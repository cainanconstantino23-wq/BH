import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { APPROVER_LABEL } from '@/lib/covers';
import { logCoverActivity } from '@/lib/covers-server';
import { periodLabel } from '@/lib/feedPlan';
import { findPlanHouse, logPlanActivity } from '@/lib/feedPlan-server';

// Link da grade: a Thereza recusa uma casa e pede outra.
// POST { collectionId, motivo }: a casa sai da grade (o dia fica livre) e a equipe recebe a notificação
// "grade.casa_recusada" para colocar outra casa. A pasta de capa da casa continua existindo.
const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const body = (await request.json().catch(() => ({}))) as { collectionId?: unknown; motivo?: unknown };
  const admin = createAdminClient();
  const house = await findPlanHouse(admin, (await params).token, body.collectionId);
  if (!house) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : '';

  const { error } = await admin.from('feed_plan_items').delete().eq('plan_id', house.planId).eq('collection_id', house.collectionId);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  const { data: plan } = await admin.from('feed_plans').select('start_date, days').eq('id', house.planId).maybeSingle();
  await admin.from('feed_plans').update({ updated_at: new Date().toISOString() }).eq('id', house.planId);

  const periodo = plan ? periodLabel(String(plan.start_date).slice(0, 10), Number(plan.days)) : '';
  await logPlanActivity(admin, {
    planId: house.planId,
    actorId: null,
    actorLabel: APPROVER_LABEL,
    action: 'grade.casa_recusada',
    details: { periodo, casa: house.label, dia: house.slotDate, motivo },
  });
  await logCoverActivity(admin, {
    collectionId: house.collectionId,
    actorId: null,
    actorLabel: APPROVER_LABEL,
    action: 'capa.recusada_na_grade',
    details: { pasta: house.label, tipo: 'capa', periodo, dia: house.slotDate, motivo },
  });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
