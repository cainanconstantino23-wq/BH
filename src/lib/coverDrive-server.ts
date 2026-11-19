import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { APPROVER_LABEL } from '@/lib/covers';
import { loadCollection, logCoverActivity } from '@/lib/covers-server';
import { parentsOf } from '@/lib/coverFolder-server';
import { CROPS_SAVED_ACTION, RECORD_FILE_NAME, cropFileName, cropsFolderName, cropsRecord, photoRecordLines } from '@/lib/coverDrive';
import { canWriteDrive, driveCreateFolder, driveUploadFile, getDriveConnection } from '@/lib/google/drive';

// Aprovação da grade: os cortes das capas de cada casa vão para uma pasta NOVA dentro da pasta da casa no Drive
// ("Cortes das capas aprovados por Thereza em <data>"), com o "Registro da aprovação.txt".
// Regra do projeto: no Drive só se cria (pasta e arquivos novos); nada existente é alterado, movido ou apagado.

export type CropsResult =
  | { status: 'saved'; folderName: string; link: string; saved: string[]; failed: string[] }
  | { status: 'no_crops' | 'no_folder' | 'not_found' };

/** O Drive está conectado com permissão de criar? (senão a aprovação da grade avisa a equipe) */
export async function driveCanCreate() {
  return canWriteDrive(await getDriveConnection().catch(() => null));
}

export async function saveHouseCropsToDrive(
  admin: SupabaseClient,
  collectionId: number,
  info: { house: string; period: string; day: string | null; approvedAt: string },
): Promise<CropsResult> {
  const collection = await loadCollection(admin, collectionId);
  if (!collection) return { status: 'not_found' };
  const crops = collection.photos.filter((photo) => photo.edited?.url);
  if (crops.length === 0) return { status: 'no_crops' };

  // pasta da casa = onde está a foto original da capa aprovada (ou do primeiro corte) no Drive
  const reference = collection.photos.find((photo) => photo.approved) ?? crops[0];
  const parent = (await parentsOf(reference.driveId))[0];
  if (!parent) return { status: 'no_folder' };

  const record = cropsRecord(collection.photos, info.house, info.period, info.day, info.approvedAt);
  const folderName = cropsFolderName(info.approvedAt);
  const folder = await driveCreateFolder(folderName, parent, record.slice(0, 20000));
  const saved: string[] = [];
  const failed: string[] = [];
  for (const photo of crops) {
    const name = cropFileName(photo);
    try {
      const image = await fetch(photo.edited!.url, { cache: 'no-store' });
      if (!image.ok) throw new Error(`corte ${image.status}`);
      await driveUploadFile(name, folder.id, new Uint8Array(await image.arrayBuffer()), image.headers.get('content-type') ?? 'image/jpeg', photoRecordLines(photo).join('\n'));
      saved.push(name);
    } catch (error) {
      console.error('Falha ao salvar corte no Drive (grade):', photo.name, error);
      failed.push(photo.name);
    }
  }
  await driveUploadFile(RECORD_FILE_NAME, folder.id, new TextEncoder().encode(record), 'text/plain');

  const link = folder.link ?? `https://drive.google.com/drive/folders/${folder.id}`;
  await logCoverActivity(admin, {
    collectionId,
    actorId: null,
    actorLabel: APPROVER_LABEL,
    action: CROPS_SAVED_ACTION,
    details: { pasta: info.house, tipo: 'capa', pasta_drive: folderName, pasta_drive_id: folder.id, link, aprovadas_em: info.approvedAt, capas: saved, ...(failed.length ? { falharam: failed } : {}), origem: 'grade' },
  });
  return { status: 'saved', folderName, link, saved, failed };
}
