import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { driveFetch } from '@/lib/google/drive';
import { onlyShared } from '@/lib/google/driveAccess';
import { APPROVER_LABEL } from '@/lib/covers';

// Pasta da casa no Drive para o link da aprovadora: as pastas onde estão as fotos já escolhidas pela equipe.
// A aprovadora pode ver e escolher qualquer imagem dessas pastas (e só delas).

export interface FolderImage {
  driveId: string;
  name: string;
  width: number | null;
  height: number | null;
}

interface RawImage {
  id: string;
  name: string;
  imageMediaMetadata?: { width?: number; height?: number; rotation?: number };
}

const ALL_DRIVES = { supportsAllDrives: 'true' };

export async function parentsOf(fileId: string): Promise<string[]> {
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}`, { fields: 'parents', ...ALL_DRIVES });
  return ((await response.json()) as { parents?: string[] }).parents ?? [];
}

/** Pastas do Drive de onde vieram as fotos desta pasta de capa (olha até 5 fotos). */
export async function collectionFolders(admin: SupabaseClient, collectionId: number): Promise<string[]> {
  const { data } = await admin
    .from('cover_collection_photos')
    .select('drive_file_id')
    .eq('collection_id', collectionId)
    .order('position', { ascending: true })
    .limit(5);
  const lists = await Promise.all((data ?? []).map((row) => parentsOf(String(row.drive_file_id)).catch(() => [])));
  // só pastas de "Compartilhados comigo" (Meu Drive bloqueado)
  return onlyShared([...new Set(lists.flat())]);
}

const toImage = (file: RawImage): FolderImage => {
  const meta = file.imageMediaMetadata;
  const turned = meta?.rotation === 1 || meta?.rotation === 3;
  return {
    driveId: file.id,
    name: file.name,
    width: (turned ? meta?.height : meta?.width) ?? null,
    height: (turned ? meta?.width : meta?.height) ?? null,
  };
};

/** Todas as imagens das pastas (até 300 por pasta), em ordem de nome. */
export async function listFolderImages(folders: string[]): Promise<FolderImage[]> {
  const lists = await Promise.all(
    folders.map(async (folder) => {
      const response = await driveFetch('/files', {
        q: `'${folder}' in parents and trashed = false and mimeType contains 'image/'`,
        fields: 'files(id,name,imageMediaMetadata(width,height,rotation))',
        orderBy: 'name_natural',
        pageSize: '300',
        includeItemsFromAllDrives: 'true',
        ...ALL_DRIVES,
      });
      // "._foto.jpg" = arquivo oculto que o Mac cria ao copiar; não é foto
      return (((await response.json()) as { files?: RawImage[] }).files ?? []).filter((file) => !file.name.startsWith('._')).map(toImage);
    }),
  );
  const seen = new Set<string>();
  return lists.flat().filter((image) => !seen.has(image.driveId) && seen.add(image.driveId));
}

/** A imagem está numa das pastas da casa? Devolve os dados dela ou null. */
export async function imageInFolders(fileId: string, folders: string[]): Promise<FolderImage | null> {
  if (folders.length === 0) return null;
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}`, {
    fields: 'id,name,mimeType,parents,trashed,imageMediaMetadata(width,height,rotation)',
    ...ALL_DRIVES,
  });
  const file = (await response.json()) as RawImage & { mimeType?: string; parents?: string[]; trashed?: boolean };
  if (file.trashed || !file.mimeType?.startsWith('image/') || !(file.parents ?? []).some((parent) => folders.includes(parent))) return null;
  return toImage(file);
}

/**
 * Garante que a foto está na pasta de capa. Se ainda não está e é da pasta da casa no Drive,
 * entra como capa posta pela aprovadora (registro: added_by / favorited_by = aprovadora).
 * Devolve o nome da foto, ou null se não pertence à casa.
 */
export async function ensureApproverPhoto(admin: SupabaseClient, collectionId: number, fileId: string): Promise<{ name: string; inserted: boolean } | null> {
  const table = () => admin.from('cover_collection_photos');
  const { data: existing } = await table().select('name').eq('collection_id', collectionId).eq('drive_file_id', fileId).maybeSingle();
  if (existing) return { name: String(existing.name ?? ''), inserted: false };

  const image = await imageInFolders(fileId, await collectionFolders(admin, collectionId)).catch(() => null);
  if (!image) return null;
  const { data: last } = await table().select('position').eq('collection_id', collectionId).order('position', { ascending: false }).limit(1).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await table().insert({
    collection_id: collectionId,
    drive_file_id: image.driveId,
    name: image.name.slice(0, 300),
    width: image.width,
    height: image.height,
    is_favorite: true,
    position: Number(last?.position ?? -1) + 1,
    added_by: APPROVER_LABEL,
    favorited_by: APPROVER_LABEL,
    favorited_at: now,
    favorited_by_approver: true,
  });
  if (error) {
    console.error('Falha ao incluir foto da pasta da casa escolhida pela aprovadora:', error.message);
    return null;
  }
  return { name: image.name, inserted: true };
}
