import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember, getTeamConnection } from '@/lib/team-server';

const noStore = { 'Cache-Control': 'private, no-store' };

// Diz ao painel se a equipe já conectou o Instagram. Nunca devolve o token.
export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });

  const { data, error } = await getTeamConnection(
    createAdminClient(),
    'instagram_account_id, instagram_username, token_expires_at, updated_at',
  );

  if (error) {
    console.error('Falha ao ler a conexão do Instagram:', error.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }

  if (!data?.instagram_account_id) {
    return NextResponse.json({ connected: false, canConnect: member.can('conectar_instagram') }, { headers: noStore });
  }

  return NextResponse.json(
    {
      connected: true,
      username: (data.instagram_username as string | null) ?? '',
      tokenExpiresAt: data.token_expires_at,
      connectedAt: data.updated_at,
      canConnect: member.can('conectar_instagram'),
    },
    { headers: noStore },
  );
}
