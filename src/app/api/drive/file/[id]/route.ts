import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID, DriveNotConnectedError, driveFetch } from '@/lib/google/drive';

// Foto original do Drive, para o editor de recorte (mesma origem: o canvas pode exportar o corte).
const MAX_BYTES = 60 * 1024 * 1024;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return new NextResponse(null, { status: 401 });
  if (!member.can('ver_publicacoes')) return new NextResponse(null, { status: 403 });

  const { id } = await params;
  if (!DRIVE_ID.test(id) || id === 'root') return new NextResponse(null, { status: 400 });

  try {
    const meta = (await (await driveFetch(`/files/${id}`, { fields: 'mimeType,size', supportsAllDrives: 'true' })).json()) as {
      mimeType?: string;
      size?: string;
    };
    if (!meta.mimeType?.startsWith('image/')) return new NextResponse(null, { status: 415 });
    if (Number(meta.size) > MAX_BYTES) return new NextResponse(null, { status: 413 });

    const file = await driveFetch(`/files/${id}`, { alt: 'media', supportsAllDrives: 'true' });
    return new NextResponse(file.body, {
      headers: { 'Content-Type': meta.mimeType, 'Cache-Control': 'private, max-age=600' },
    });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return new NextResponse(null, { status: 409 });
    console.error('Falha ao baixar foto do Drive:', error);
    return new NextResponse(null, { status: 502 });
  }
}
