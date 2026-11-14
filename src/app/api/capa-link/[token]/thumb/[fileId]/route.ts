import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DriveNotConnectedError, clampThumbSize, driveThumbnail } from '@/lib/google/drive';

// Imagem pública do link de capa: só entrega fotos favoritas daquela pasta.
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  if (!TOKEN.test(token)) return new Response(null, { status: 404 });
  const admin = createAdminClient();
  const { data: collection } = await admin.from('cover_collections').select('id').eq('share_token', token).maybeSingle();
  if (!collection) return new Response(null, { status: 404 });
  const { data: photo } = await admin
    .from('cover_collection_photos')
    .select('drive_file_id')
    .eq('collection_id', collection.id)
    .eq('drive_file_id', fileId)
    .eq('is_favorite', true)
    .maybeSingle();
  if (!photo) return new Response(null, { status: 404 });

  try {
    return await driveThumbnail(fileId, clampThumbSize(request.nextUrl.searchParams.get('s')), 'public, max-age=3600');
  } catch (error) {
    if (!(error instanceof DriveNotConnectedError)) console.error('Falha na imagem do link de capa:', error);
    return new Response(null, { status: 502 });
  }
}
