import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { DriveNotConnectedError, driveFetch } from '@/lib/google/drive';
import { onlyVisible } from '@/lib/google/driveAccess';
import type { DriveEntry } from '@/app/api/drive/list/route';

// Busca pastas pelo nome só em "Compartilhados comigo" (Meu Drive e drives compartilhados bloqueados: src/lib/google/driveAccess.ts).
// GET ?q=texto → { folders: [{ id, name, parentId, parentName }] }; com &tudo=1 também { images: DriveEntry[] } (fotos pelo nome). Só leitura.

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
      corpora: 'user',
      supportsAllDrives: 'true',
      pageSize: '50',
      orderBy: 'name_natural',
      fields: 'files(id,name,parents)',
    });
    const found = (((await response.json()) as { files?: { id: string; name: string; parents?: string[] }[] }).files ?? []).filter((file) => !file.name.startsWith('.'));
    const allowed = new Set(await onlyVisible(member, found.map((file) => file.id)));
    const files = found.filter((file) => allowed.has(file.id));

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
    if (request.nextUrl.searchParams.get('tudo') !== '1') return NextResponse.json({ folders }, { headers: noStore });

    // fotos com o texto no nome (só de "Compartilhados comigo")
    const imageResponse = await driveFetch('/files', {
      q: `mimeType contains 'image/' and trashed = false and name contains '${safe}'`,
      corpora: 'user',
      pageSize: '60',
      orderBy: 'name_natural',
      fields: 'files(id,name,imageMediaMetadata(width,height,rotation))',
    });
    const rawImages = (((await imageResponse.json()) as { files?: { id: string; name: string; imageMediaMetadata?: { width?: number; height?: number; rotation?: number } }[] }).files ?? []).filter((file) => !file.name.startsWith('.'));
    const allowedImages = new Set(await onlyVisible(member, rawImages.map((file) => file.id)));
    const images: DriveEntry[] = rawImages
      .filter((file) => allowedImages.has(file.id))
      .map((file) => {
        const meta = file.imageMediaMetadata;
        const turned = meta?.rotation === 1 || meta?.rotation === 3;
        return { id: file.id, name: file.name, kind: 'image', width: turned ? meta?.height : meta?.width, height: turned ? meta?.width : meta?.height };
      });
    return NextResponse.json({ folders, images }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return NextResponse.json({ error: 'not_connected' }, { status: 409, headers: noStore });
    console.error('Falha na busca do Drive:', error);
    return NextResponse.json({ error: 'search_failed' }, { status: 500, headers: noStore });
  }
}
