import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';

// Link único com todos os posts não aprovados. Só quem envia links de aprovação gera ou troca.
// POST {}              → devolve o link ativo (cria se não houver)
// POST { renew: true } → desativa o link atual e cria outro

const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });
  if (!member.can('enviar_link_aprovacao')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const body = (await request.json().catch(() => ({}))) as { renew?: unknown };
  const renew = body.renew === true;
  const admin = createAdminClient();

  if (renew) {
    const { error } = await admin
      .from('approval_list_links')
      .update({ revoked_at: new Date().toISOString() })
      .is('revoked_at', null);
    if (error) {
      console.error('Falha ao desativar o link da lista:', error.message);
      return NextResponse.json({ error: 'update_failed' }, { status: 500, headers: noStore });
    }
  } else {
    const { data, error } = await admin
      .from('approval_list_links')
      .select('token')
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Falha ao buscar o link da lista:', error.message);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
    }
    if (data?.token) return NextResponse.json({ token: data.token }, { headers: noStore });
  }

  const token = randomBytes(18).toString('base64url');
  const { error: insertError } = await admin
    .from('approval_list_links')
    .insert({ token, created_by: member.user.id });
  if (insertError) {
    console.error('Falha ao criar o link da lista:', insertError.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ token }, { headers: noStore });
}
