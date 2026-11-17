import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember, getTeamConnection } from '@/lib/team-server';
import { reconcileDeletedMedia } from '@/lib/meta/instagramSync';

// Atualizar da Grade do feed: confere no Instagram o que foi apagado lá e tira da plataforma.
// Leve (só os ids das publicações); a sincronização completa continua em /api/instagram/sync.
export const maxDuration = 30;
const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const db = createAdminClient();
  const { data } = await getTeamConnection(db, 'access_token, instagram_account_id');
  const connection = data as { access_token: string; instagram_account_id: string } | null;
  if (!connection?.instagram_account_id) return NextResponse.json({ error: 'not_connected' }, { status: 404, headers: noStore });

  try {
    const result = await reconcileDeletedMedia(db, connection.instagram_account_id, connection.access_token);
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) {
    console.error('Falha ao conferir publicações apagadas:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'reconcile_failed' }, { status: 502, headers: noStore });
  }
}
