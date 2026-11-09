import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';

type RouteParams = { params: Promise<{ userId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = '876000h'; // ~100 anos

// Remove uma pessoa da equipe e bloqueia o login dela. Exige gerenciar_pessoas; não pode remover a si mesmo.
// O login NÃO é apagado: posts, métricas e histórico ficam ligados a ele e seriam apagados juntos.
export async function DELETE(_request: Request, { params }: RouteParams) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  if (!member.can('gerenciar_pessoas')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { userId } = await params;
  if (!UUID.test(userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (userId === member.user.id) {
    return NextResponse.json({ error: 'Você não pode remover a própria conta.' }, { status: 400 });
  }

  // 1) Remove da equipe com a sessão do admin: o histórico registra quem removeu.
  const { error: teamError } = await member.supabase.from('team_members').delete().eq('user_id', userId);
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 400 });

  // 2) Bloqueia o login (só o servidor consegue).
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
  if (banError) {
    console.error('Pessoa removida da equipe, mas o login não foi bloqueado:', banError.message);
    return NextResponse.json({ ok: true, warning: 'login_not_blocked' });
  }

  return NextResponse.json({ ok: true });
}
