import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { DriveNotConnectedError, driveFetch } from '@/lib/google/drive';

// Busca pastas pelo nome em todo o Drive da equipe (Meu Drive, compartilhados comigo e drives compartilhados).
// GET ?q=texto → { folders: [{ id, name, parentId, parentName }] }. Só leitura.

const noStore = { 'Cache-Control': 'private, no-store' };
const FOLDER = 'application/vnd.google-apps.folder';

export interface DriveFolderHit {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string;
}

export async function GET(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const text = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (text.length < 2) return NextResponse.json({ folders: [] }, { headers: noStore });
  // aspas e barras escapadas para a consulta do Drive
  const safe = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  try {
    const response = await driveFetch('/files', {
      q: `mimeType = '${FOLDER}' and trashed = false and name contains '${safe}'`,
      corpora: 'allDrives',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
      pageSize: '50',
      orderBy: 'name_natural',
      fields: 'files(id,name,parents)',
    });
    const files = (((await response.json()) as { files?: { id: string; name: string; parents?: string[] }[] }).files ?? []).filter((file) => !file.name.startsWith('.'));

    // nome da pasta de cima (ex.: o bairro), para mostrar onde fica e sugerir o bairro
    const parentIds = [...new Set(files.map((file) => file.parents?.[0]).filter((id): id is string => Boolean(id)))].slice(0, 30);
    const parentNames = new Map<string, string>();
    await Promise.all(
      parentIds.map(async (id) => {
        const parent = await driveFetch(`/files/${encodeURIComponent(id)}`, { fields: 'name', supportsAllDrives: 'true' }).catch(() => null);
        const data = parent ? ((await parent.json().catch(() => ({}))) as { name?: string }) : {};
        if (data.name) parentNames.set(id, data.name);
      }),
    );

    const folders: DriveFolderHit[] = files.map((file) => ({
      id: file.id,
      name: file.name,
      parentId: file.parents?.[0] ?? null,
      parentName: (file.parents?.[0] && parentNames.get(file.parents[0])) || '',
    }));
    return NextResponse.json({ folders }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return NextResponse.json({ error: 'not_connected' }, { status: 409, headers: noStore });
    console.error('Falha na busca do Drive:', error);
    return NextResponse.json({ error: 'search_failed' }, { status: 500, headers: noStore });
  }
}
