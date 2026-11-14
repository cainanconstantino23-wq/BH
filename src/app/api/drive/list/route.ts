import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID, DriveNotConnectedError, driveFetch } from '@/lib/google/drive';

// Conteúdo de uma pasta do Drive: subpastas e imagens.
// folder = "root" (Meu Drive), "shared" (Compartilhados comigo), "drives" (Drives compartilhados) ou o ID de uma pasta.

const noStore = { 'Cache-Control': 'private, no-store' };
const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';

export interface DriveEntry {
  id: string;
  name: string;
  kind: 'folder' | 'image';
  width?: number;
  height?: number;
}

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  imageMediaMetadata?: { width?: number; height?: number; rotation?: number };
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

export async function GET(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const folder = request.nextUrl.searchParams.get('folder') ?? 'root';
  const pageToken = request.nextUrl.searchParams.get('page') ?? '';

  try {
    if (folder === 'drives') {
      const response = await driveFetch('/drives', { pageSize: '100', fields: 'nextPageToken,drives(id,name)', ...(pageToken ? { pageToken } : {}) });
      const data = (await response.json()) as { nextPageToken?: string; drives?: { id: string; name: string }[] };
      const entries: DriveEntry[] = (data.drives ?? []).map((drive) => ({ id: drive.id, name: drive.name, kind: 'folder' }));
      return NextResponse.json({ entries, nextPage: data.nextPageToken ?? null }, { headers: noStore });
    }

    if (folder !== 'shared' && !DRIVE_ID.test(folder)) {
      return NextResponse.json({ error: 'invalid_folder' }, { status: 400, headers: noStore });
    }

    const kinds = `(mimeType = '${FOLDER}' or mimeType contains 'image/' or mimeType = '${SHORTCUT}')`;
    const q = folder === 'shared' ? `sharedWithMe = true and trashed = false and ${kinds}` : `'${folder}' in parents and trashed = false and ${kinds}`;
    const response = await driveFetch('/files', {
      q,
      pageSize: '300',
      orderBy: 'folder,name_natural',
      fields: 'nextPageToken,files(id,name,mimeType,imageMediaMetadata(width,height,rotation),shortcutDetails)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    });
    const data = (await response.json()) as { nextPageToken?: string; files?: RawFile[] };

    const entries: DriveEntry[] = [];
    for (const file of data.files ?? []) {
      // "._foto.jpg" e ".DS_Store": arquivos ocultos que o Mac cria ao copiar para HD externo; não são fotos
      if (file.name.startsWith('._') || file.name === '.DS_Store') continue;
      // atalho: entra no destino (pasta ou imagem)
      const id = file.shortcutDetails?.targetId ?? file.id;
      const mime = file.shortcutDetails?.targetMimeType ?? file.mimeType;
      if (mime === FOLDER) entries.push({ id, name: file.name, kind: 'folder' });
      else if (mime.startsWith('image/')) {
        const meta = file.imageMediaMetadata;
        const turned = meta?.rotation === 1 || meta?.rotation === 3;
        entries.push({
          id,
          name: file.name,
          kind: 'image',
          width: turned ? meta?.height : meta?.width,
          height: turned ? meta?.width : meta?.height,
        });
      }
    }
    return NextResponse.json({ entries, nextPage: data.nextPageToken ?? null }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return NextResponse.json({ error: 'not_connected' }, { status: 409, headers: noStore });
    console.error('Falha ao listar o Drive:', error);
    return NextResponse.json({ error: 'list_failed' }, { status: 502, headers: noStore });
  }
}
