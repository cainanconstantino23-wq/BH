import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { collectionKind, collectionName, loadCollection, logCoverActivity } from '@/lib/covers-server';
import { parentsOf } from '@/lib/coverFolder-server';
import { RECORD_FILE_NAME, SAVED_TO_DRIVE_ACTION, approvalRecord, approvedFolderName, photoRecordLines, savedFileName } from '@/lib/coverDrive';
import {
  DriveNotConnectedError,
  DriveWriteMissingError,
  canWriteDrive,
  driveCopyFile,
  driveCreateFolder,
  driveUploadFile,
  getDriveConnection,
} from '@/lib/google/drive';

// Salva no Drive as capas aprovadas pela aprovadora: cria SEMPRE uma pasta nova
// ("Capas aprovadas por Thereza em <data da resposta>") na pasta da casa de onde vieram as fotos,
// com o corte dela (ou a original) e o "Registro da aprovação.txt". Registro no histórico da pasta.

export const maxDuration = 60;
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return fail('unauthorized', 401);
  if (!member.can('editar_publicacoes') && !member.can('criar_publicacoes')) return fail('forbidden', 403);

  const id = Number((await params).id) || 0;
  const admin = createAdminClient();
  const collection = await loadCollection(admin, id).catch(() => null);
  if (!collection) return fail('not_found', 404);
  const capas = collection.photos.filter((photo) => photo.approved);
  if (!collection.respondedAt || capas.length === 0) return fail('not_answered', 409);

  try {
    if (!canWriteDrive(await getDriveConnection())) return fail('drive_write_missing', 409);

    // pasta da casa = onde está a primeira capa no Drive
    const parent = (await parentsOf(capas[0].driveId))[0];
    if (!parent) return fail('house_folder_missing', 409);

    const house = await collectionName(admin, id);
    const savedAt = new Date().toISOString();
    const record = approvalRecord(collection, house, member.label, savedAt);
    const folderName = approvedFolderName(collection.respondedAt);
    const folder = await driveCreateFolder(folderName, parent, record.slice(0, 20000));

    const saved: string[] = [];
    const failed: string[] = [];
    for (const photo of capas) {
      const name = savedFileName(photo);
      const description = photoRecordLines(photo).join('\n');
      try {
        if (photo.edited?.url) {
          const image = await fetch(photo.edited.url, { cache: 'no-store' });
          if (!image.ok) throw new Error(`corte ${image.status}`);
          await driveUploadFile(name, folder.id, new Uint8Array(await image.arrayBuffer()), image.headers.get('content-type') ?? 'image/jpeg', description);
        } else {
          await driveCopyFile(photo.driveId, name, folder.id, description);
        }
        saved.push(name);
      } catch (error) {
        if (error instanceof DriveNotConnectedError || error instanceof DriveWriteMissingError) throw error;
        console.error('Falha ao salvar capa no Drive:', photo.name, error);
        failed.push(photo.name);
      }
    }
    await driveUploadFile(RECORD_FILE_NAME, folder.id, new TextEncoder().encode(record), 'text/plain');

    const link = folder.link ?? `https://drive.google.com/drive/folders/${folder.id}`;
    await logCoverActivity(admin, {
      collectionId: id,
      actorId: member.user.id,
      actorLabel: member.label,
      action: SAVED_TO_DRIVE_ACTION,
      details: {
        pasta: house,
        tipo: await collectionKind(admin, id),
        pasta_drive: folderName,
        pasta_drive_id: folder.id,
        link,
        aprovadas_em: collection.respondedAt,
        capas: saved,
        ...(failed.length ? { falharam: failed } : {}),
      },
    });
    return NextResponse.json({ ok: true, folder: { id: folder.id, name: folderName, link }, saved, failed, collection: await loadCollection(admin, id) }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return fail('drive_not_connected', 409);
    if (error instanceof DriveWriteMissingError) return fail('drive_write_missing', 409);
    console.error('Falha ao salvar as capas no Drive:', error);
    return fail('save_failed', 500);
  }
}
