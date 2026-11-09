import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember, getTeamConnection } from '@/lib/team-server';
import { syncInstagramAccount } from '@/lib/meta/instagramSync';

export const maxDuration = 120;

const MIN_INTERVAL_MS = 2 * 60 * 1000;
const noStore = { 'Cache-Control': 'private, no-store' };

// Botão "Atualizar agora": sincroniza o Instagram da equipe (permissão atualizar_metricas).
export async function POST() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });
  if (!member.can('atualizar_metricas')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const db = createAdminClient();
  const { data: row } = await getTeamConnection(db, 'user_id, access_token, instagram_account_id, last_synced_at');
  const connection = row as {
    user_id: string;
    access_token: string;
    instagram_account_id: string;
    last_synced_at: string | null;
  } | null;

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
    await db.from('user_meta_config').update({ last_synced_at: syncedAt, last_sync_error: null }).eq('user_id', connection.user_id);
    return NextResponse.json({ ok: true, syncedAt, media: result.media }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'falha desconhecida';
    console.error('Atualização manual do Instagram falhou:', message);
    await db.from('user_meta_config').update({ last_sync_error: message }).eq('user_id', connection.user_id);
    return NextResponse.json({ error: 'sync_failed' }, { status: 502, headers: noStore });
  }
}
