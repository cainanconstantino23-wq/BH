import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { GraphError, graphGet } from '@/lib/meta/graph';

// Busca no Instagram e grava no Supabase: perfil (foto diária de seguidores),
// métricas da conta por dia e cada publicação com suas métricas.

const TIME_ZONE = 'America/Sao_Paulo';
const CONCURRENCY = 4;

export interface InstagramConnectionRow {
  user_id: string;
  access_token: string;
  instagram_account_id: string;
}

export interface SyncResult {
  instagramAccountId: string;
  days: number;
  media: number;
  mediaWithoutInsights: number;
  warnings: string[];
}

interface InsightValue {
  name: string;
  total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] };
  values?: { value?: number }[];
}

interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
function localDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
}

/** Meia-noite de São Paulo (UTC−3, sem horário de verão desde 2019) em segundos UNIX. */
function startOfLocalDay(isoDate: string) {
  return Math.floor(new Date(`${isoDate}T00:00:00-03:00`).getTime() / 1000);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDate(date);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

function readInsights(data: InsightValue[]) {
  const out: Record<string, number> = {};
  for (const metric of data) {
    const value = metric.total_value?.value ?? metric.values?.[0]?.value;
    if (typeof value === 'number') out[metric.name] = value;
  }
  return out;
}

/** Pede várias métricas de uma vez; se o Meta recusar o grupo, tenta uma por uma. */
async function fetchInsights(
  path: string,
  metrics: string[],
  params: Record<string, string>,
  token: string,
  warnings: string[],
) {
  try {
    const { data } = await graphGet<{ data: InsightValue[] }>(path, { ...params, metric: metrics.join(','), access_token: token });
    return readInsights(data);
  } catch {
    const merged: Record<string, number> = {};
    for (const metric of metrics) {
      try {
        const { data } = await graphGet<{ data: InsightValue[] }>(path, { ...params, metric, access_token: token });
        Object.assign(merged, readInsights(data));
      } catch (error) {
        warnings.push(`${metric}: ${error instanceof GraphError ? error.message : 'falhou'}`);
      }
    }
    return merged;
  }
}

const ACCOUNT_METRICS = [
  'reach',
  'views',
  'accounts_engaged',
  'total_interactions',
  'likes',
  'comments',
  'shares',
  'saves',
  'profile_links_taps',
];

async function fetchAccountDay(igId: string, token: string, date: string, warnings: string[]) {
  const params = {
    period: 'day',
    metric_type: 'total_value',
    since: String(startOfLocalDay(date)),
    until: String(startOfLocalDay(addDays(date, 1))),
  };
  const metrics = await fetchInsights(`/${igId}/insights`, ACCOUNT_METRICS, params, token, warnings);

  // Seguiram / deixaram de seguir (só para contas com 100+ seguidores).
  let follows: number | null = null;
  let unfollows: number | null = null;
  try {
    const { data } = await graphGet<{ data: InsightValue[] }>(`/${igId}/insights`, {
      ...params,
      metric: 'follows_and_unfollows',
      breakdown: 'follow_type',
      access_token: token,
    });
    for (const result of data[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
      if (result.dimension_values[0] === 'FOLLOWER') follows = result.value;
      if (result.dimension_values[0] === 'NON_FOLLOWER') unfollows = result.value;
    }
  } catch {
    // Sem dados (conta pequena ou dia sem movimento): fica vazio.
  }

  return {
    date,
    reach: metrics.reach ?? null,
    views: metrics.views ?? null,
    accounts_engaged: metrics.accounts_engaged ?? null,
    total_interactions: metrics.total_interactions ?? null,
    likes: metrics.likes ?? null,
    comments: metrics.comments ?? null,
    shares: metrics.shares ?? null,
    saves: metrics.saves ?? null,
    profile_links_taps: metrics.profile_links_taps ?? null,
    follows,
    unfollows,
  };
}

const FEED_METRICS = ['reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'views'];
const REELS_METRICS = [...FEED_METRICS, 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];

async function fetchAllMedia(igId: string, token: string) {
  const items: MediaItem[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const response = await graphGet<{ data: MediaItem[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/${igId}/media`,
      {
        fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
        limit: '50',
        access_token: token,
        ...(after ? { after } : {}),
      },
    );
    items.push(...response.data);
    after = response.paging?.cursors?.after;
    if (!response.paging?.next || !after) break;
  }
  return items;
}

/**
 * Sincroniza uma conta. `days` = quantos dias para trás buscar das métricas da conta
 * (30 na primeira vez; 3 nas rotinas diárias, porque o Meta pode atrasar até 48 h).
 */
export async function syncInstagramAccount(
  db: SupabaseClient,
  connection: InstagramConnectionRow,
  { days = 30 }: { days?: number } = {},
): Promise<SyncResult> {
  const { user_id: userId, access_token: token, instagram_account_id: igId } = connection;
  const warnings: string[] = [];
  const now = new Date();
  const today = localDate(now);

  // 1) Perfil: foto do dia de seguidores, seguindo e publicações.
  const profile = await graphGet<{ followers_count?: number; follows_count?: number; media_count?: number }>(`/${igId}`, {
    fields: 'followers_count,follows_count,media_count',
    access_token: token,
  });
  const { error: snapshotError } = await db.from('instagram_account_daily').upsert(
    {
      instagram_account_id: igId,
      date: today,
      user_id: userId,
      followers_count: profile.followers_count ?? null,
      follows_count: profile.follows_count ?? null,
      media_count: profile.media_count ?? null,
      updated_at: now.toISOString(),
    },
    { onConflict: 'instagram_account_id,date' },
  );
  if (snapshotError) throw new Error(`Falha ao salvar o perfil: ${snapshotError.message}`);

  // 2) Métricas da conta, um dia por vez (ontem para trás; o dia de hoje ainda está incompleto).
  const dates = Array.from({ length: days }, (_, index) => addDays(today, -(index + 1)));
  const dailyRows = await mapLimit(dates, CONCURRENCY, (date) => fetchAccountDay(igId, token, date, warnings));
  const { error: dailyError } = await db.from('instagram_account_daily').upsert(
    dailyRows.map((row) => ({ ...row, instagram_account_id: igId, user_id: userId, updated_at: now.toISOString() })),
    { onConflict: 'instagram_account_id,date' },
  );
  if (dailyError) throw new Error(`Falha ao salvar as métricas diárias: ${dailyError.message}`);

  // 3) Publicações e as métricas de cada uma.
  const media = await fetchAllMedia(igId, token);
  let mediaWithoutInsights = 0;
  const mediaRows = await mapLimit(media, CONCURRENCY, async (item) => {
    const isReel = item.media_product_type === 'REELS';
    const mediaWarnings: string[] = [];
    const insights = await fetchInsights(
      `/${item.id}/insights`,
      isReel ? REELS_METRICS : FEED_METRICS,
      {},
      token,
      mediaWarnings,
    );
    if (Object.keys(insights).length === 0) {
      mediaWithoutInsights++;
      warnings.push(`post ${item.id}: sem métricas (${mediaWarnings[0] ?? 'sem dados'})`);
    }

    return {
      id: item.id,
      instagram_account_id: igId,
      user_id: userId,
      media_type: item.media_type ?? null,
      media_product_type: item.media_product_type ?? null,
      caption: item.caption ?? null,
      permalink: item.permalink ?? null,
      thumbnail_url: item.thumbnail_url ?? null,
      media_url: item.media_url ?? null,
      published_at: item.timestamp ?? null,
      likes: insights.likes ?? item.like_count ?? null,
      comments: insights.comments ?? item.comments_count ?? null,
      shares: insights.shares ?? null,
      saved: insights.saved ?? null,
      reach: insights.reach ?? null,
      views: insights.views ?? null,
      total_interactions: insights.total_interactions ?? null,
      reels_avg_watch_time_ms: insights.ig_reels_avg_watch_time ?? null,
      reels_total_watch_time_ms: insights.ig_reels_video_view_total_time ?? null,
      insights_updated_at: Object.keys(insights).length ? now.toISOString() : null,
      updated_at: now.toISOString(),
    };
  });

  if (mediaRows.length) {
    const { error: mediaError } = await db.from('instagram_media').upsert(mediaRows, { onConflict: 'id' });
    if (mediaError) throw new Error(`Falha ao salvar as publicações: ${mediaError.message}`);
  }

  return { instagramAccountId: igId, days: dailyRows.length, media: mediaRows.length, mediaWithoutInsights, warnings };
}
