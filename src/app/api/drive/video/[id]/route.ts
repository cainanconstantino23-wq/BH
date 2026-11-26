import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID, DriveNotConnectedError, driveFetch, getDriveAccessToken } from '@/lib/google/drive';
import { canSeeDriveItem } from '@/lib/google/driveAccess';

// Vídeo do Drive para assistir no app (estúdio "Selecionar capas"): repassa o arquivo em partes (Range),
// assim o player do navegador começa logo e consegue avançar sem baixar o vídeo inteiro. Só leitura.

export const maxDuration = 60;
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return new NextResponse(null, { status: 401 });
  if (!member.can('ver_publicacoes')) return new NextResponse(null, { status: 403 });

  const { id } = await params;
  if (!DRIVE_ID.test(id) || id === 'root') return new NextResponse(null, { status: 400 });

  try {
    // só o que a pessoa pode ver (Compartilhados comigo + pastas dela)
    if (!(await canSeeDriveItem(member, id))) return new NextResponse(null, { status: 403 });
    const meta = (await (await driveFetch(`/files/${id}`, { fields: 'mimeType', supportsAllDrives: 'true' })).json()) as { mimeType?: string };
    if (!meta.mimeType?.startsWith('video/')) return new NextResponse(null, { status: 415 });

    const range = request.headers.get('range');
    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${await getDriveAccessToken()}`, ...(range ? { Range: range } : {}) },
      cache: 'no-store',
    });
    if (upstream.status === 401) throw new DriveNotConnectedError();
    if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: upstream.status === 416 ? 416 : 502 });

    const headers = new Headers({ 'Cache-Control': 'private, max-age=600', 'Accept-Ranges': 'bytes' });
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.get('content-type')?.startsWith('video/')) headers.set('Content-Type', meta.mimeType);
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return new NextResponse(null, { status: 409 });
    console.error('Falha ao abrir vídeo do Drive:', error);
    return new NextResponse(null, { status: 502 });
  }
}
