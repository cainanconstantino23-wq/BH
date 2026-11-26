import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { collectionVisibleTo, collectionFolders } from '@/lib/coverFolder-server';
import { onlyVisible } from '@/lib/google/driveAccess';
import { DriveNotConnectedError, driveFetch } from '@/lib/google/drive';

// "Casas com capas selecionadas" → "Adicionar fotos": a pasta da casa no Drive (de onde vieram as capas já salvas),
// para o estúdio abrir as fotos dela e a equipe escolher mais capas. Só leitura.
// GET → { folders: [{ id, name, parentName }] }

const noStore = { 'Cache-Control': 'private, no-store' };
const SELECTED_FOLDER_NAME = 'Capas Selecionadas';

interface FolderMeta { id: string; name?: string; parents?: string[] }

const folderMeta = async (id: string): Promise<FolderMeta> =>
  (await (await driveFetch(`/files/${encodeURIComponent(id)}`, { fields: 'id,name,parents', supportsAllDrives: 'true' })).json()) as FolderMeta;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!(await collectionVisibleTo(createAdminClient(), member, Number((await params).id) || 0))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const id = Number((await params).id) || 0;
  if (!id) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  try {
    const ids = await onlyVisible(member, await collectionFolders(createAdminClient(), id));
    const folders = await Promise.all(
      ids.map(async (folderId) => {
        const meta = await folderMeta(folderId).catch(() => null);
        if (!meta?.name) return null;
        const parentId = meta.parents?.[0];
        const parent = parentId ? await folderMeta(parentId).catch(() => null) : null;
        // foto que veio de "Capas Selecionadas": a pasta da casa é a de cima
        if (meta.name === SELECTED_FOLDER_NAME && parent?.name) {
          const grand = parent.parents?.[0] ? await folderMeta(parent.parents[0]).catch(() => null) : null;
          return { id: parent.id, name: parent.name, parentName: grand?.name ?? '' };
        }
        return { id: meta.id, name: meta.name, parentName: parent?.name ?? '' };
      }),
    );
    const unique = [...new Map(folders.filter((row): row is { id: string; name: string; parentName: string } => row !== null).map((row) => [row.id, row])).values()];
    return NextResponse.json({ folders: unique }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return NextResponse.json({ error: 'drive_unavailable' }, { status: 503, headers: noStore });
    console.error('Falha ao achar a pasta da casa no Drive:', error);
    return NextResponse.json({ error: 'drive_unavailable' }, { status: 502, headers: noStore });
  }
}
