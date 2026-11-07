import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

const noStore = { 'Cache-Control': 'private, no-store' };

// Diz ao painel se o usuário logado já conectou o Instagram. Nunca devolve o token.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });

  const { data, error } = await createAdminClient()
    .from('user_meta_config')
    .select('instagram_account_id, instagram_username, token_expires_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Falha ao ler a conexão do Instagram:', error.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }

  if (!data?.instagram_account_id) return NextResponse.json({ connected: false }, { headers: noStore });

  return NextResponse.json(
    {
      connected: true,
      username: data.instagram_username ?? '',
      tokenExpiresAt: data.token_expires_at,
      connectedAt: data.updated_at,
    },
    { headers: noStore },
  );
}
