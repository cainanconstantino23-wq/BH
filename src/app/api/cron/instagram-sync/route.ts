import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncInstagramAccount, type InstagramConnectionRow } from '@/lib/meta/instagramSync';

// Rotina diária (Vercel Cron) e execução manual protegida.
// Exige o cabeçalho Authorization: Bearer <CRON_SECRET>.
// ?days=30 busca 30 dias de métricas da conta (padrão: 3, suficiente para a rotina diária).

export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const daysParam = Number(request.nextUrl.searchParams.get('days') ?? 3);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), 1), 30) : 3;

  const db = createAdminClient();
  const { data: connections, error } = await db
    .from('user_meta_config')
    .select('user_id, access_token, instagram_account_id')
    .not('instagram_account_id', 'is', null);

  if (error) return NextResponse.json({ error: 'lookup_failed', detail: error.message }, { status: 500 });

  const results = [];
  for (const connection of (connections ?? []) as InstagramConnectionRow[]) {
    try {
      const result = await syncInstagramAccount(db, connection, { days });
      await db
        .from('user_meta_config')
        .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
        .eq('user_id', connection.user_id);
      results.push({ ok: true, ...result });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'falha desconhecida';
      console.error(`Sincronização do Instagram falhou (${connection.instagram_account_id}):`, message);
      await db.from('user_meta_config').update({ last_sync_error: message }).eq('user_id', connection.user_id);
      results.push({ ok: false, instagramAccountId: connection.instagram_account_id, error: message });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
