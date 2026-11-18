import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DriveNotConnectedError } from '@/lib/google/drive';
import { collectionFolders, listFolderImages } from '@/lib/coverFolder-server';

// "Encontrar mais fotos" no link da aprovadora: todas as imagens da pasta da casa no Drive
// (as pastas de onde vieram as fotos já escolhidas), menos as que já estão na pasta de capa.
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const admin = createAdminClient();
  const { data: collection } = await admin.from('cover_collections').select('id').eq('share_token', token).maybeSingle();
  if (!collection) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  try {
    const { data: rows } = await admin.from('cover_collection_photos').select('drive_file_id').eq('collection_id', collection.id);
    const known = new Set((rows ?? []).map((row) => String(row.drive_file_id)));
    const images = await listFolderImages(await collectionFolders(admin, collection.id));
    return NextResponse.json({ photos: images.filter((image) => !known.has(image.driveId)) }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) return NextResponse.json({ error: 'drive_unavailable' }, { status: 503, headers: noStore });
    console.error('Falha ao listar a pasta da casa no link de capa:', error);
    return NextResponse.json({ error: 'drive_unavailable' }, { status: 502, headers: noStore });
  }
}
