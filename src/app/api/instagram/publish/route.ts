import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { publishPost } from '@/lib/meta/publish';

// POST { postId }: publica agora no Instagram.  PATCH { postId, auto }: liga/desliga a publicação no horário agendado.
// Só para quem tem a permissão "Publicar no Instagram"; só posts aprovados.

export const maxDuration = 60;
const noStore = { 'Cache-Control': 'private, no-store' };

async function readPostId(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { postId?: unknown; auto?: unknown };
  const postId = Number(body.postId);
  return { postId: Number.isInteger(postId) && postId > 0 ? postId : 0, auto: body.auto };
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
  if (!member.can('publicar_instagram')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const { postId, auto } = await readPostId(request);
  if (!postId || typeof auto !== 'boolean') return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });

  const { error } = await createAdminClient().from('posts').update({ auto_publish: auto }).eq('id', postId).neq('publish_status', 'published');
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true, auto }, { headers: noStore });
}
