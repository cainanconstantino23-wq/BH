import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID, DriveNotConnectedError, clampThumbSize, driveThumbnail } from '@/lib/google/drive';

// Miniatura de uma imagem do Drive, pelo servidor (o link do Google exige o token).
// ?s=tamanho do lado maior em px (até 2000).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return new NextResponse(null, { status: 401 });
  if (!member.can('ver_publicacoes')) return new NextResponse(null, { status: 403 });

  const { id } = await params;
  if (!DRIVE_ID.test(id) || id === 'root') return new NextResponse(null, { status: 400 });

  try {
    return await driveThumbnail(id, clampThumbSize(request.nextUrl.searchParams.get('s')));
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return new NextResponse(null, { status: 409 });
    console.error('Falha na miniatura do Drive:', error);
    return new NextResponse(null, { status: 502 });
  }
}
