import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { syncInstagramAccount } from '@/lib/meta/instagramSync';

export const maxDuration = 120;

const MIN_INTERVAL_MS = 2 * 60 * 1000;
const noStore = { 'Cache-Control': 'private, no-store' };

// Botão "Atualizar agora": sincroniza só a conta do usuário logado.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });

  const db = createAdminClient();
  const { data: connection } = await db
    .from('user_meta_config')
    .select('user_id, access_token, instagram_account_id, last_synced_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!connection?.instagram_account_id) {
    return NextResponse.json({ error: 'not_connected' }, { status: 404, headers: noStore });
  }

  const last = connection.last_synced_at ? new Date(connection.last_synced_at).getTime() : 0;
  if (Date.now() - last < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: 'too_soon' }, { status: 429, headers: noStore });
  }

  try {
    const result = await syncInstagramAccount(db, connection, { days: last ? 3 : 30 });
    const syncedAt = new Date().toISOString();
    await db.from('user_meta_config').update({ last_synced_at: syncedAt, last_sync_error: null }).eq('user_id', user.id);
    return NextResponse.json({ ok: true, syncedAt, media: result.media }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'falha desconhecida';
    console.error('Atualização manual do Instagram falhou:', message);
    await db.from('user_meta_config').update({ last_sync_error: message }).eq('user_id', user.id);
    return NextResponse.json({ error: 'sync_failed' }, { status: 502, headers: noStore });
  }
}
