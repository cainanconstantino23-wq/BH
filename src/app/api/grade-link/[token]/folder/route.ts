import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DriveNotConnectedError } from '@/lib/google/drive';
import { collectionFolders, listFolderImages } from '@/lib/coverFolder-server';
import { findPlanHouse } from '@/lib/feedPlan-server';

// Link da grade: as fotos da pasta da casa no Drive (de onde vieram as candidatas), para a Thereza escolher
// outra capa se não gostar de nenhuma. Só leitura no Drive. GET ?casa=<id da pasta de capa>
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const admin = createAdminClient();
  const house = await findPlanHouse(admin, (await params).token, request.nextUrl.searchParams.get('casa'));
  if (!house) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  try {
    const photos = await listFolderImages(await collectionFolders(admin, house.collectionId));
    return NextResponse.json({ photos }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return NextResponse.json({ error: 'drive_unavailable' }, { status: 503, headers: noStore });
    console.error('Falha ao listar a pasta da casa (grade):', error);
    return NextResponse.json({ error: 'list_failed' }, { status: 500, headers: noStore });
  }
}
