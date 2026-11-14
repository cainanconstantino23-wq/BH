import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoverCollectionDetail, CoverCollectionSummary, CoverPhoto } from '@/lib/covers';

export const COLLECTION_COLUMNS = 'id, house_name, neighborhood, house_number, share_token, client_feedback, responded_at, updated_at';
export const PHOTO_COLUMNS = 'collection_id, drive_file_id, name, width, height, is_favorite, approved, position, edited_url, edited_width, edited_height, edited_label';

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : '');

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
  };
}

export async function loadCollection(admin: SupabaseClient, id: number): Promise<CoverCollectionDetail | null> {
  const { data: row, error } = await admin.from('cover_collections').select(COLLECTION_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const { data: photoRows, error: photoError } = await admin
    .from('cover_collection_photos')
    .select(PHOTO_COLUMNS)
    .eq('collection_id', id)
    .order('position', { ascending: true });
  if (photoError) throw new Error(photoError.message);
  const photos = (photoRows ?? []).map(toPhoto);
  return { ...toSummary(row, photos), feedback: text(row.client_feedback), respondedAt: text(row.responded_at) || null, photos };
}

export const touchCollection = (admin: SupabaseClient, id: number) =>
  admin.from('cover_collections').update({ updated_at: new Date().toISOString() }).eq('id', id);
