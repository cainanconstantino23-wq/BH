import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { periodLabel, validateLayout } from '@/lib/feedPlan';
import { isMissingTable, loadPlanDetail, loadPlanRow, logPlanActivity, saveLayout } from '@/lib/feedPlan-server';

// Um plano da Aprovação da grade.
// GET: detalhe. PATCH { layout } grava a grade; { addCollectionIds } põe casas na reserva; { removeCollectionId } tira uma casa.
// POST { renew? }: link da Thereza (devolve o atual ou troca). DELETE: apaga o plano (as pastas de capa continuam).
const noStore = { 'Cache-Control': 'private, no-store' };
const planId = async (params: Promise<{ id: string }>) => Number((await params).id) || 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const admin = createAdminClient();
  try {
    const row = await loadPlanRow(admin, { id: await planId(params) });
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    return NextResponse.json({ plan: await loadPlanDetail(admin, row) }, { headers: noStore });
  } catch (error) {
    if (isMissingTable(error as { code?: string })) return NextResponse.json({ error: 'migration_pending' }, { status: 503, headers: noStore });
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('criar_publicacoes') && !member.can('editar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const id = await planId(params);
  const admin = createAdminClient();
  const row = await loadPlanRow(admin, { id });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = (await request.json().catch(() => ({}))) as { layout?: unknown; addCollectionIds?: unknown; removeCollectionId?: unknown };

  if (Array.isArray(body.addCollectionIds)) {
    const ids = body.addCollectionIds.map(Number).filter((value) => Number.isInteger(value) && value > 0).slice(0, 30);
    const { data: folders } = ids.length ? await admin.from('cover_collections').select('id, kind').in('id', ids) : { data: [] };
    const valid = (folders ?? []).filter((folder) => (folder.kind ?? 'capa') === 'capa').map((folder) => Number(folder.id));
    if (valid.length) {
      // casas novas entram na reserva (upsert ignora as que já estão no plano)
      const { error } = await admin
        .from('feed_plan_items')
        .upsert(valid.map((collectionId) => ({ plan_id: id, collection_id: collectionId, slot_date: null })), { onConflict: 'plan_id,collection_id', ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
    }
  } else if (body.removeCollectionId !== undefined) {
    const { error } = await admin.from('feed_plan_items').delete().eq('plan_id', id).eq('collection_id', Number(body.removeCollectionId) || 0);
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  } else {
    const current = await loadPlanDetail(admin, row);
    const layout = validateLayout(body.layout, current.houses, current.startDate, current.days);
    if (!layout) return NextResponse.json({ error: 'invalid_layout' }, { status: 400, headers: noStore });
    await saveLayout(admin, id, layout);
  }
  return NextResponse.json({ plan: await loadPlanDetail(admin, (await loadPlanRow(admin, { id }))!) }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('enviar_link_aprovacao')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const id = await planId(params);
  const { renew } = (await request.json().catch(() => ({}))) as { renew?: boolean };
  const admin = createAdminClient();
  const row = await loadPlanRow(admin, { id });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (row.share_token && !renew) return NextResponse.json({ token: row.share_token }, { headers: noStore });

  const token = randomBytes(18).toString('base64url');
  const status = row.status === 'aprovado' ? 'aprovado' : 'enviado';
  const { error } = await admin.from('feed_plans').update({ share_token: token, link_created_at: new Date().toISOString(), status }).eq('id', id);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  await logPlanActivity(admin, {
    planId: id,
    actorId: member.user.id,
    actorLabel: member.label,
    action: row.share_token ? 'grade.link_renovado' : 'grade.link_gerado',
    details: { periodo: periodLabel(String(row.start_date), Number(row.days)) },
  });
  return NextResponse.json({ token }, { headers: noStore });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('apagar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const id = await planId(params);
  const admin = createAdminClient();
  const row = await loadPlanRow(admin, { id });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { error } = await admin.from('feed_plans').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500, headers: noStore });
  await logPlanActivity(admin, {
    planId: id,
    actorId: member.user.id,
    actorLabel: member.label,
    action: 'grade.apagada',
    details: { periodo: periodLabel(String(row.start_date), Number(row.days)) },
  });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
