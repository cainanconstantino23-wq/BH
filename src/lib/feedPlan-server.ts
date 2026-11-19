import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { coverFolderLabel } from '@/lib/house';
import type { FeedPlanDetail, FeedPlanSummary, PlanHouse, PlanLayoutItem, PlanStatus, PublishedTile } from '@/lib/feedPlan';

// Aprovação da grade: leitura e gravação dos planos (feed_plans / feed_plan_items), só pelo servidor.

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : '');
export const PLAN_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
/** Tabela ainda não criada (migração 20261119_grade_quinzena.sql não rodada). */
export const isMissingTable = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';

const parseStatus = (value: unknown): PlanStatus => (value === 'enviado' || value === 'aprovado' ? value : 'rascunho');

export function toPlanSummary(row: Row, houseCount: number): FeedPlanSummary {
  return {
    id: Number(row.id),
    startDate: text(row.start_date).slice(0, 10),
    days: Number(row.days) || 15,
    hour: typeof row.post_hour === 'number' ? row.post_hour : 19,
    status: parseStatus(row.status),
    houseCount,
    respondedAt: text(row.responded_at) || null,
    createdBy: text(row.created_by_label),
    createdAt: text(row.created_at),
    hasLink: Boolean(row.share_token),
  };
}

/** Casas do plano com as capas candidatas (todas as fotos da pasta de capa, na ordem da pasta). */
async function loadHouses(admin: SupabaseClient, planId: number): Promise<PlanHouse[]> {
  const { data: items, error } = await admin.from('feed_plan_items').select('collection_id, slot_date, cover_drive_id').eq('plan_id', planId).order('id');
  if (error) throw new Error(error.message);
  const ids = (items ?? []).map((item) => Number(item.collection_id));
  if (!ids.length) return [];
  const [{ data: folders }, { data: photos }] = await Promise.all([
    admin.from('cover_collections').select('id, house_name, neighborhood, house_number').in('id', ids),
    admin.from('cover_collection_photos').select('collection_id, drive_file_id, name, edited_url').in('collection_id', ids).order('position', { ascending: true }),
  ]);
  const folderById = new Map((folders ?? []).map((folder) => [Number(folder.id), folder]));
  return (items ?? []).map((item) => {
    const id = Number(item.collection_id);
    const folder = folderById.get(id);
    return {
      collectionId: id,
      label: folder ? coverFolderLabel(text(folder.house_name), text(folder.neighborhood), text(folder.house_number)) || 'Casa' : 'Casa',
      slotDate: text(item.slot_date).slice(0, 10) || null,
      coverDriveId: text(item.cover_drive_id) || null,
      candidates: (photos ?? [])
        .filter((photo) => Number(photo.collection_id) === id)
        .map((photo) => ({ driveId: text(photo.drive_file_id), name: text(photo.name), editedUrl: text(photo.edited_url) || null })),
    };
  });
}

/** Últimos posts do Instagram (para a Thereza ver a grade nova junto com o feed atual). */
export async function loadPublished(admin: SupabaseClient, limit = 9): Promise<PublishedTile[]> {
  const { data } = await admin
    .from('instagram_media')
    .select('id, media_type, media_product_type, thumbnail_url, media_url, published_at')
    .neq('media_product_type', 'STORY')
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => {
    const isVideo = row.media_type === 'VIDEO';
    return { id: text(row.id), imageUrl: (isVideo ? text(row.thumbnail_url) : text(row.media_url) || text(row.thumbnail_url)) || null, publishedAt: text(row.published_at) || null, isVideo };
  });
}

export async function loadPlanRow(admin: SupabaseClient, filter: { id: number } | { token: string }) {
  const query = admin.from('feed_plans').select('*');
  const { data, error } = await ('id' in filter ? query.eq('id', filter.id) : query.eq('share_token', filter.token)).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as Row | null;
}

export async function loadPlanDetail(admin: SupabaseClient, row: Row): Promise<FeedPlanDetail> {
  const [houses, published] = await Promise.all([loadHouses(admin, Number(row.id)), loadPublished(admin)]);
  return {
    ...toPlanSummary(row, houses.length),
    feedback: text(row.feedback),
    shareToken: text(row.share_token) || null,
    houses,
    published,
  };
}

/** Grava a grade (dia e capa de cada casa) já conferida por validateLayout. */
export async function saveLayout(admin: SupabaseClient, planId: number, layout: PlanLayoutItem[]) {
  const results = await Promise.all(
    layout.map((item) =>
      admin
        .from('feed_plan_items')
        .update({ slot_date: item.slotDate, cover_drive_id: item.coverDriveId })
        .eq('plan_id', planId)
        .eq('collection_id', item.collectionId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  await admin.from('feed_plans').update({ updated_at: new Date().toISOString() }).eq('id', planId);
}

/** Registro (activity_log, entity_type 'grade'). */
export async function logPlanActivity(
  admin: SupabaseClient,
  entry: { planId: number; actorId: string | null; actorLabel: string; action: string; details?: Record<string, unknown> },
) {
  const { error } = await admin.from('activity_log').insert({
    actor_id: entry.actorId,
    actor_label: entry.actorLabel,
    action: entry.action,
    entity_type: 'grade',
    entity_id: String(entry.planId),
    details: entry.details ?? {},
  });
  if (error) console.error('Falha ao gravar o registro da grade:', entry.action, error.message);
}

/**
 * Link público da grade: confere o token e se a casa (pasta de capa) está no plano.
 * Usado pelas rotas de corte, pasta da casa, foto escolhida e recusa de casa no link da Thereza.
 */
export async function findPlanHouse(admin: SupabaseClient, token: string, collectionId: unknown) {
  const id = Number(collectionId);
  if (!PLAN_TOKEN.test(token) || !Number.isInteger(id) || id <= 0) return null;
  const { data: plan } = await admin.from('feed_plans').select('id, start_date, days').eq('share_token', token).maybeSingle();
  if (!plan) return null;
  const { data: item } = await admin.from('feed_plan_items').select('collection_id, slot_date').eq('plan_id', plan.id).eq('collection_id', id).maybeSingle();
  if (!item) return null;
  const { data: folder } = await admin.from('cover_collections').select('id, house_name, neighborhood, house_number').eq('id', id).maybeSingle();
  if (!folder) return null;
  return {
    planId: Number(plan.id),
    collectionId: id,
    slotDate: text(item.slot_date).slice(0, 10) || null,
    label: coverFolderLabel(text(folder.house_name), text(folder.neighborhood), text(folder.house_number)) || 'Casa',
  };
}
