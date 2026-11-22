import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { collectionName, loadCollection, logCoverActivity } from '@/lib/covers-server';
import { parentsOf } from '@/lib/coverFolder-server';
import { isSharedWithMe } from '@/lib/google/driveAccess';
import { photoRecordLines, savedFileName } from '@/lib/coverDrive';
import {
  DRIVE_ID,
  DriveNotConnectedError,
  DriveWriteMissingError,
  canWriteDrive,
  driveCopyFile,
  driveCreateFolder,
  driveFetch,
  driveUploadFile,
  getDriveConnection,
} from '@/lib/google/drive';

// "Selecionar capas": depois de salvar a casa, as capas escolhidas vão para a pasta "Capas Selecionadas"
// dentro da pasta da casa no Drive (o corte, ou uma cópia da original).
// Regra do Drive: só criar. Se "Capas Selecionadas" já existe, só acrescenta arquivos novos (os de mesmo nome são pulados);
// nada existente é alterado, movido ou apagado.
// POST { folderId: pasta da casa no Drive, photos: [ids do Drive das capas salvas agora] }

export const maxDuration = 60;
const SELECTED_FOLDER_NAME = 'Capas Selecionadas';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return fail('unauthorized', 401);
  if (!member.can('criar_publicacoes') && !member.can('editar_publicacoes')) return fail('forbidden', 403);

  const id = Number((await params).id) || 0;
  const body = (await request.json().catch(() => ({}))) as { folderId?: unknown; photos?: unknown };
  const folderId = typeof body.folderId === 'string' ? body.folderId : '';
  const wanted = new Set((Array.isArray(body.photos) ? body.photos : []).filter((value): value is string => typeof value === 'string'));
  if (!DRIVE_ID.test(folderId) || folderId === 'root' || wanted.size === 0) return fail('invalid', 400);

  const admin = createAdminClient();
  const collection = await loadCollection(admin, id).catch(() => null);
  if (!collection) return fail('not_found', 404);
  const photos = collection.photos.filter((photo) => wanted.has(photo.driveId));
  if (photos.length === 0) return fail('not_found', 404);

  try {
    if (!canWriteDrive(await getDriveConnection())) return fail('drive_write_missing', 409);
    // a pasta precisa ser mesmo a pasta da casa: onde estão as fotos escolhidas
    const parents = await Promise.all(photos.map((photo) => parentsOf(photo.driveId).catch(() => [] as string[])));
    if (!parents.some((list) => list.includes(folderId))) return fail('wrong_folder', 400);
    if (!(await isSharedWithMe(folderId))) return fail('blocked', 403);

    // "Capas Selecionadas" já existe? usa a mesma pasta (só acrescenta); senão cria
    const found = (await (
      await driveFetch('/files', {
        q: `'${folderId}' in parents and name = '${SELECTED_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
        fields: 'files(id,webViewLink)',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        pageSize: '1',
      })
    ).json()) as { files?: { id: string; webViewLink?: string }[] };
    const house = await collectionName(admin, id);
    const folder = found.files?.[0]
      ? { id: found.files[0].id, link: found.files[0].webViewLink ?? null, created: false }
      : { ...(await driveCreateFolder(SELECTED_FOLDER_NAME, folderId, `Capas selecionadas para o feed — ${house}`)), created: true };

    // nomes que já estão lá: não duplica
    const existing = new Set(
      (
        ((await (
          await driveFetch('/files', { q: `'${folder.id}' in parents and trashed = false`, fields: 'files(name)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: '1000' })
        ).json()) as { files?: { name: string }[] }).files ?? []
      ).map((file) => file.name),
    );

    const saved: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    for (const photo of photos) {
      const name = savedFileName(photo);
      if (existing.has(name)) {
        skipped.push(name);
        continue;
      }
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
        console.error('Falha ao salvar capa em Capas Selecionadas:', photo.name, error);
        failed.push(photo.name);
      }
    }

    const link = folder.link ?? `https://drive.google.com/drive/folders/${folder.id}`;
    await logCoverActivity(admin, {
      collectionId: id,
      actorId: member.user.id,
      actorLabel: member.label,
      action: 'capa.capas_selecionadas_drive',
      details: { pasta: house, tipo: 'capa', pasta_drive: SELECTED_FOLDER_NAME, link, capas: saved, ...(skipped.length ? { ja_estavam: skipped } : {}), ...(failed.length ? { falharam: failed } : {}) },
    });
    return NextResponse.json({ folder: { id: folder.id, link, created: folder.created }, saved, skipped, failed }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return fail('drive_not_connected', 409);
    if (error instanceof DriveWriteMissingError) return fail('drive_write_missing', 409);
    console.error('Falha ao salvar em Capas Selecionadas:', error);
    return fail('save_failed', 500);
  }
}
