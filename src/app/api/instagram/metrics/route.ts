import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember, getTeamConnection } from '@/lib/team-server';
import type { MetricsResponse } from '@/lib/instagramMetrics';

const noStore = { 'Cache-Control': 'private, no-store' };

// Métricas guardadas no Supabase para o painel. Não chama o Meta.
// Lê as tabelas de métricas com a sessão do usuário (RLS: só a equipe ativa vê).
export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });
  if (!member.can('ver_estatisticas')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const { supabase } = member;

  const { data: row } = await getTeamConnection(
    createAdminClient(),
    'instagram_account_id, instagram_username, last_synced_at, last_sync_error',
  );
  const connection = row as {
    instagram_account_id: string;
    instagram_username: string | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
  } | null;

  if (!connection?.instagram_account_id) {
    return NextResponse.json({ error: 'not_connected' }, { status: 404, headers: noStore });
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 62);

  const [daily, media] = await Promise.all([
    supabase
      .from('instagram_account_daily')
      .select(
        'date, followers_count, follows_count, reach, views, accounts_engaged, total_interactions, likes, comments, shares, saves, profile_links_taps, follows, unfollows',
      )
      .eq('instagram_account_id', connection.instagram_account_id)
      .gte('date', since.toISOString().slice(0, 10))
      .order('date'),
    supabase
      .from('instagram_media')
      .select(
        'id, media_type, media_product_type, caption, permalink, thumbnail_url, media_url, published_at, likes, comments, shares, saved, reach, views, total_interactions, reels_avg_watch_time_ms',
      )
      .eq('instagram_account_id', connection.instagram_account_id)
      .order('published_at', { ascending: false }),
  ]);

  if (daily.error || media.error) {
    console.error('Falha ao ler métricas do Instagram:', daily.error?.message ?? media.error?.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }

  const body: MetricsResponse = {
    account: {
      username: connection.instagram_username ?? '',
      lastSyncedAt: connection.last_synced_at,
      lastSyncError: connection.last_sync_error,
    },
    today,
    daily: daily.data ?? [],
    media: media.data ?? [],
  };
  return NextResponse.json(body, { headers: noStore });
}
