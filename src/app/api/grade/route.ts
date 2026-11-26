import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { DEFAULT_POST_HOUR, PLAN_DAY_OPTIONS, distribute, isIsoDate, periodLabel } from '@/lib/feedPlan';
import { isMissingTable, logPlanActivity, toPlanSummary } from '@/lib/feedPlan-server';

// Aprovação da grade: GET lista os planos; POST cria um plano com as casas (pastas da Aprovação de capa) distribuídas nos dias.
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  // a grade mistura casas de várias pastas: quem só vê algumas pastas do Drive não usa a grade
  if (member.driveFolders) return NextResponse.json({ error: 'drive_restrito' }, { status: 403, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from('feed_plans').select('*').order('start_date', { ascending: false }).limit(50);
  if (isMissingTable(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 503, headers: noStore });
  if (error) return NextResponse.json({ error: 'list_failed' }, { status: 500, headers: noStore });
  const ids = (rows ?? []).map((row) => Number(row.id));
  const { data: items } = ids.length ? await admin.from('feed_plan_items').select('plan_id').in('plan_id', ids) : { data: [] };
  const count = (id: number) => (items ?? []).filter((item) => Number(item.plan_id) === id).length;
  return NextResponse.json({ plans: (rows ?? []).map((row) => toPlanSummary(row, count(Number(row.id)))) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  // a grade mistura casas de várias pastas: quem só vê algumas pastas do Drive não usa a grade
  if (member.driveFolders) return NextResponse.json({ error: 'drive_restrito' }, { status: 403, headers: noStore });
  if (!member.can('criar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const body = (await request.json().catch(() => ({}))) as { startDate?: unknown; days?: unknown; hour?: unknown; collectionIds?: unknown };
  const days = Number(body.days);
  const hour = body.hour === undefined ? DEFAULT_POST_HOUR : Number(body.hour);
  const ids = [...new Set((Array.isArray(body.collectionIds) ? body.collectionIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 60);
  if (!isIsoDate(body.startDate) || !PLAN_DAY_OPTIONS.includes(days as (typeof PLAN_DAY_OPTIONS)[number]) || !Number.isInteger(hour) || hour < 0 || hour > 23 || ids.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  }

  const admin = createAdminClient();
  // só pastas da Aprovação de capa (as candidatas a capa de cada casa)
  const { data: folders } = await admin.from('cover_collections').select('id, kind').in('id', ids);
  const valid = new Set((folders ?? []).filter((folder) => (folder.kind ?? 'capa') === 'capa').map((folder) => Number(folder.id)));
  const ordered = ids.filter((id) => valid.has(id));
  if (!ordered.length) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });

  const { data: plan, error } = await admin
    .from('feed_plans')
    .insert({ start_date: body.startDate, days, post_hour: hour, created_by: member.user.id, created_by_label: member.label })
    .select('*')
    .single();
  if (isMissingTable(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 503, headers: noStore });
  if (error || !plan) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });

  const layout = distribute(ordered, body.startDate as string, days);
  const { error: itemsError } = await admin
    .from('feed_plan_items')
    .insert(layout.map((item) => ({ plan_id: plan.id, collection_id: item.collectionId, slot_date: item.slotDate, cover_drive_id: null })));
  if (itemsError) {
    await admin.from('feed_plans').delete().eq('id', plan.id);
    return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  }
  await logPlanActivity(admin, {
    planId: Number(plan.id),
    actorId: member.user.id,
    actorLabel: member.label,
    action: 'grade.criada',
    details: { periodo: periodLabel(body.startDate as string, days), casas: ordered.length },
  });
  return NextResponse.json({ id: Number(plan.id) }, { headers: noStore });
}
