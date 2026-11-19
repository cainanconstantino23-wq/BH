import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DRIVE_ID, DriveNotConnectedError, clampThumbSize, driveThumbnail } from '@/lib/google/drive';
import { PLAN_TOKEN, findPlanHouse } from '@/lib/feedPlan-server';
import { collectionFolders, imageInFolders } from '@/lib/coverFolder-server';

// Imagem pública do link da grade: fotos das pastas de capa das casas daquele plano e,
// com ?casa=<id>, também as fotos da pasta da casa no Drive (para a Thereza escolher outra capa).
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  if (!PLAN_TOKEN.test(token) || !DRIVE_ID.test(fileId) || fileId === 'root') return new Response(null, { status: 404 });
  const admin = createAdminClient();
  const { data: plan } = await admin.from('feed_plans').select('id').eq('share_token', token).maybeSingle();
  if (!plan) return new Response(null, { status: 404 });
  const { data: items } = await admin.from('feed_plan_items').select('collection_id').eq('plan_id', plan.id);
  const ids = (items ?? []).map((item) => Number(item.collection_id));
  if (!ids.length) return new Response(null, { status: 404 });
  try {
    const { data: photo } = await admin.from('cover_collection_photos').select('drive_file_id').in('collection_id', ids).eq('drive_file_id', fileId).limit(1).maybeSingle();
    if (!photo) {
      const house = await findPlanHouse(admin, token, request.nextUrl.searchParams.get('casa'));
      if (!house || !(await imageInFolders(fileId, await collectionFolders(admin, house.collectionId)))) return new Response(null, { status: 404 });
    }
    return await driveThumbnail(fileId, clampThumbSize(request.nextUrl.searchParams.get('s')), 'public, max-age=3600');
  } catch (error) {
    if (!(error instanceof DriveNotConnectedError)) console.error('Falha na imagem do link da grade:', error);
    return new Response(null, { status: 502 });
  }
}
