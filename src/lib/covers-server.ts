import 'server-only';

import { coverFolderLabel } from '@/lib/house';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseKind, type CollectionKind, type CoverActivity, type CoverCollectionDetail, type CoverCollectionSummary, type CoverPhoto } from '@/lib/covers';

export const LEGACY_COLLECTION_COLUMNS = 'id, house_name, neighborhood, house_number, share_token, client_feedback, responded_at, updated_at, link_created_by, link_created_at';
// planned_*: migração 20261117b_data_planejada.sql (sem ela, as rotas caem para LEGACY_COLLECTION_COLUMNS)
export const COLLECTION_COLUMNS = `${LEGACY_COLLECTION_COLUMNS}, planned_date, planned_hour`;
/** Coluna ainda não criada (migração não rodada). */
export const isMissingColumn = (error: { code?: string } | null) => error?.code === '42703';
export const PHOTO_COLUMNS = 'collection_id, drive_file_id, name, width, height, is_favorite, approved, position, edited_url, edited_width, edited_height, edited_label, created_at, added_by, favorited_by, favorited_at, favorited_by_approver, approved_by, approved_at';

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const orNull = (value: unknown) => text(value) || null;

export const toPhoto = (row: Row): CoverPhoto => ({
  driveId: text(row.drive_file_id),
  name: text(row.name),
  width: typeof row.width === 'number' ? row.width : null,
  height: typeof row.height === 'number' ? row.height : null,
  favorite: row.is_favorite === true,
  approved: row.approved === true,
  edited: text(row.edited_url)
    ? { url: text(row.edited_url), width: Number(row.edited_width) || 0, height: Number(row.edited_height) || 0, label: text(row.edited_label) }
    : null,
  addedBy: orNull(row.added_by),
  addedAt: orNull(row.created_at),
  favoritedBy: orNull(row.favorited_by),
  favoritedAt: orNull(row.favorited_at),
  favoritedByApprover: row.favorited_by_approver === true,
  approvedBy: orNull(row.approved_by),
  approvedAt: orNull(row.approved_at),
});

/** Só aceita corte salvo no R2 do app. */
export function cleanEdited(value: unknown) {
  if (value === null) return { edited_url: null, edited_width: null, edited_height: null, edited_label: null };
  if (typeof value !== 'object' || !value) return undefined;
  const edited = value as Record<string, unknown>;
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const url = typeof edited.url === 'string' ? edited.url : '';
  if (!base || !url.startsWith(`${base}/uploads/`) || !/^[A-Za-z0-9:/._-]+$/.test(url)) return undefined;
  return {
    edited_url: url,
    edited_width: Math.round(Number(edited.width)) || null,
    edited_height: Math.round(Number(edited.height)) || null,
    edited_label: typeof edited.label === 'string' ? edited.label.slice(0, 80) : null,
  };
}

export function toSummary(row: Row, photos: CoverPhoto[]): CoverCollectionSummary {
  const cover = photos.find((photo) => photo.approved) ?? photos.find((photo) => photo.favorite) ?? photos[0];
  return {
    id: Number(row.id),
    houseName: text(row.house_name),
    neighborhood: text(row.neighborhood),
    houseNumber: text(row.house_number),
    photoCount: photos.length,
    favoriteCount: photos.filter((photo) => photo.favorite).length,
    approvedCount: photos.filter((photo) => photo.approved).length,
    coverDriveId: cover?.driveId ?? null,
    coverEditedUrl: cover?.edited?.url ?? null,
    shareToken: text(row.share_token) || null,
    responded: Boolean(row.responded_at),
    updatedAt: text(row.updated_at),
    plannedDate: text(row.planned_date).slice(0, 10) || null,
    plannedHour: typeof row.planned_hour === 'number' ? row.planned_hour : null,
  };
}

export async function loadCollection(admin: SupabaseClient, id: number): Promise<CoverCollectionDetail | null> {
  let { data: row, error } = await admin.from('cover_collections').select(COLLECTION_COLUMNS).eq('id', id).maybeSingle();
  if (isMissingColumn(error)) ({ data: row, error } = await admin.from('cover_collections').select(LEGACY_COLLECTION_COLUMNS).eq('id', id).maybeSingle());
  if (error) throw new Error(error.message);
  if (!row) return null;
  const { data: photoRows, error: photoError } = await admin
    .from('cover_collection_photos')
    .select(PHOTO_COLUMNS)
    .eq('collection_id', id)
    .order('position', { ascending: true });
  if (photoError) throw new Error(photoError.message);
  const photos = (photoRows ?? []).map(toPhoto);
  const { data: logRows } = await admin
    .from('activity_log')
    .select('id, created_at, actor_label, action, details')
    .eq('entity_type', 'capa')
    .eq('entity_id', String(id))
    .order('created_at', { ascending: false })
    .limit(200);
  const history: CoverActivity[] = (logRows ?? []).map((log) => ({
    id: Number(log.id),
    createdAt: text(log.created_at),
    actor: text(log.actor_label),
    action: text(log.action),
    details: (log.details ?? {}) as Record<string, unknown>,
  }));
  return {
    ...toSummary(row, photos),
    feedback: text(row.client_feedback),
    respondedAt: orNull(row.responded_at),
    photos,
    linkCreatedBy: orNull(row.link_created_by),
    linkCreatedAt: orNull(row.link_created_at),
    history,
  };
}

/** Nome da pasta para o registro (ex.: "Casa 110 · Vila dos Coqueiros"). */
export async function collectionName(admin: SupabaseClient, id: number) {
  const { data } = await admin.from('cover_collections').select('house_name, neighborhood, house_number').eq('id', id).maybeSingle();
  return data ? coverFolderLabel(text(data.house_name), text(data.neighborhood), text(data.house_number)) || 'Sem nome' : '';
}

/**
 * Grava uma ação no histórico (activity_log, entity_type 'capa'): quem, o quê e quando.
 * As rotas usam a chave de serviço, então o gatilho do banco não sabe quem agiu; por isso o registro é feito aqui.
 * Falha no registro não desfaz a ação, mas fica no log do servidor.
 */
export async function logCoverActivity(
  admin: SupabaseClient,
  entry: { collectionId: number; actorId: string | null; actorLabel: string; action: string; details?: Record<string, unknown> },
) {
  const { error } = await admin.from('activity_log').insert({
    actor_id: entry.actorId,
    actor_label: entry.actorLabel,
    action: entry.action,
    entity_type: 'capa',
    entity_id: String(entry.collectionId),
    details: entry.details ?? {},
  });
  if (error) console.error('Falha ao gravar o registro da pasta de capa:', entry.action, error.message);
}

export const touchCollection = (admin: SupabaseClient, id: number) =>
  admin.from('cover_collections').update({ updated_at: new Date().toISOString() }).eq('id', id);

/** Tipo da pasta ('capa' ou 'fotos'); null se a pasta não existe. Sem a migração da coluna kind, toda pasta é 'capa'. */
export async function collectionKind(admin: SupabaseClient, id: number): Promise<CollectionKind | null> {
  const { data, error } = await admin.from('cover_collections').select('id, kind').eq('id', id).maybeSingle();
  if (error?.code === '42703') {
    const { data: row } = await admin.from('cover_collections').select('id').eq('id', id).maybeSingle();
    return row ? 'capa' : null;
  }
  if (error) throw new Error(error.message);
  return data ? parseKind(data.kind) : null;
}
