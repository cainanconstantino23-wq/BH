import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { publishPost, scheduledInstant } from '@/lib/meta/publish';

// Agendador: publica os posts aprovados com "publicar automaticamente" cuja hora chegou
// e continua os que ficaram processando (vídeo). Chamar a cada 5 minutos com
// Authorization: Bearer <CRON_SECRET> (Vercel Cron no plano Pro ou agendador externo, ex.: cron-job.org).
// Segurança: não publica posts atrasados mais de 6 horas (ex.: agendador parado por dias).

export const maxDuration = 300;
const LATE_LIMIT_MS = 6 * 60 * 60 * 1000;
const PER_RUN = 5;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const yesterday = new Date(now - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from('posts')
    .select('id, scheduled_date, hour, time_string, auto_publish, publish_status')
    .eq('approval_status', 'approved')
    .or('auto_publish.eq.true,publish_status.eq.processing')
    .or('publish_status.is.null,publish_status.eq.processing')
    .gte('scheduled_date', yesterday)
    .order('scheduled_date', { ascending: true });
  if (error) return NextResponse.json({ error: 'lookup_failed', detail: error.message }, { status: 500 });

  const due = (rows ?? []).filter((row) => {
    if (row.publish_status === 'processing') return true;
    const at = scheduledInstant(row.scheduled_date, row.hour, row.time_string).getTime();
    return at <= now && now - at <= LATE_LIMIT_MS;
  });

  const results = [];
  for (const row of due.slice(0, PER_RUN)) {
    results.push({ id: row.id, ...(await publishPost(admin, row.id)) });
  }
  return NextResponse.json({ checked: rows?.length ?? 0, due: due.length, results });
}
