import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { publishPost } from '@/lib/meta/publish';

// POST { postId }: publica agora no Instagram.  PATCH { postId, auto }: liga/desliga a publicação no horário agendado.
// Só para quem tem a permissão "Publicar no Instagram"; só posts aprovados.

export const maxDuration = 60;
const noStore = { 'Cache-Control': 'private, no-store' };

async function readPostId(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { postId?: unknown; auto?: unknown; cancel?: unknown };
  const postId = Number(body.postId);
  return { postId: Number.isInteger(postId) && postId > 0 ? postId : 0, auto: body.auto, cancel: body.cancel === true };
}

export async function POST(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('publicar_instagram')) {
    return NextResponse.json({ status: 'error', message: 'Você não tem a permissão "Publicar no Instagram".' }, { status: 403, headers: noStore });
  }
  const { postId } = await readPostId(request);
  if (!postId) return NextResponse.json({ status: 'error', message: 'Post inválido.' }, { status: 400, headers: noStore });

  const result = await publishPost(createAdminClient(), postId);
  return NextResponse.json(result, { status: result.status === 'error' ? 422 : 200, headers: noStore });
}

export async function PATCH(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { postId, auto, cancel } = await readPostId(request);

  // PATCH { postId, cancel: true }: cancela o agendamento (não publica sozinho). A data fica como planejada.
  if (cancel) {
    if (!member.can('publicar_instagram') && !member.can('reagendar_publicacoes')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }
    if (!postId) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    const admin = createAdminClient();
    const { data: post } = await admin.from('posts').select('id, publish_status, cover_collection_id').eq('id', postId).maybeSingle();
    if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    if (post.publish_status === 'published' || post.publish_status === 'processing') {
      return NextResponse.json({ error: 'already_sent', message: 'Este post já foi enviado ao Instagram; apague pelo app do Instagram.' }, { status: 409, headers: noStore });
    }
    const { error } = await admin.from('posts').update({ auto_publish: false }).eq('id', postId);
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
    return NextResponse.json({ ok: true, cancelled: true }, { headers: noStore });
  }

  if (!member.can('publicar_instagram')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  if (!postId || typeof auto !== 'boolean') return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });

  // publish_status vazio (nunca tentou publicar) também vale: só "neq" deixaria esses de fora
  const { data, error } = await createAdminClient()
    .from('posts')
    .update({ auto_publish: auto })
    .eq('id', postId)
    .or('publish_status.is.null,publish_status.neq.published')
    .select('id');
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  if (!data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, auto }, { headers: noStore });
}
