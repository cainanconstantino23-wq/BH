import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';

// Post programado a partir de uma pasta com capa aprovada pela aprovadora (link de capa):
// o post já nasce "aprovado". Feito no servidor para ninguém criar post aprovado sem a escolha dela.
const noStore = { 'Cache-Control': 'private, no-store' };
const RECENT_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('criar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const collectionId = Number((await params).id) || 0;
  const { postId } = (await request.json().catch(() => ({}))) as { postId?: unknown };
  if (!Number.isInteger(postId)) return NextResponse.json({ error: 'invalid_post' }, { status: 400, headers: noStore });

  const admin = createAdminClient();
  const { data: collection } = await admin
    .from('cover_collections')
    .select('id, client_feedback, responded_at')
    .eq('id', collectionId)
    .maybeSingle();
  if (!collection?.responded_at) return NextResponse.json({ error: 'not_approved' }, { status: 409, headers: noStore });
  const { count } = await admin
    .from('cover_collection_photos')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId)
    .eq('approved', true);
  if (!count) return NextResponse.json({ error: 'not_approved' }, { status: 409, headers: noStore });

  // só o post que esta pessoa acabou de criar
  const { data: post } = await admin.from('posts').select('id, user_id, created_at, approval_status').eq('id', postId).maybeSingle();
  if (!post || post.user_id !== member.user.id) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (post.created_at && Date.now() - Date.parse(post.created_at) > RECENT_MS) {
    return NextResponse.json({ error: 'too_old' }, { status: 409, headers: noStore });
  }

  const feedback = (collection.client_feedback ?? '').trim();
  const { error } = await admin
    .from('posts')
    .update({
      approval_status: 'approved',
      client_feedback: feedback ? `Capa aprovada pelo link de capa: ${feedback}` : 'Capa aprovada pelo link de capa.',
    })
    .eq('id', post.id);
  if (error) {
    console.error('Falha ao marcar post como aprovado:', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
