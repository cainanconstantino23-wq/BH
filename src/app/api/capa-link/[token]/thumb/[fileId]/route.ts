import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DRIVE_ID, DriveNotConnectedError, clampThumbSize, driveThumbnail } from '@/lib/google/drive';
import { isSharedWithMe } from '@/lib/google/driveAccess';
import { collectionFolders, imageInFolders } from '@/lib/coverFolder-server';

// Imagem pública do link de capa: só entrega fotos daquela pasta de capa ou da pasta da casa no Drive ("Encontrar mais fotos").
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
    .maybeSingle();
  if (!DRIVE_ID.test(fileId) || fileId === 'root') return new Response(null, { status: 404 });

  try {
    if (!photo && !(await imageInFolders(fileId, await collectionFolders(admin, collection.id)).catch(() => null))) return new Response(null, { status: 404 });
    if (!(await isSharedWithMe(fileId))) return new Response(null, { status: 404 });
    return await driveThumbnail(fileId, clampThumbSize(request.nextUrl.searchParams.get('s')), 'public, max-age=3600');
  } catch (error) {
    if (!(error instanceof DriveNotConnectedError)) console.error('Falha na imagem do link de capa:', error);
    return new Response(null, { status: 502 });
  }
}
