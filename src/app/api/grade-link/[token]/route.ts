import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { APPROVER_LABEL } from '@/lib/covers';
import { isMissingColumn, logCoverActivity } from '@/lib/covers-server';
import { coverOf, periodLabel, validateLayout, type PublicFeedPlan } from '@/lib/feedPlan';
import { PLAN_TOKEN, loadPlanDetail, loadPlanRow, logPlanActivity, saveLayout } from '@/lib/feedPlan-server';
import { driveCanCreate, saveHouseCropsToDrive } from '@/lib/coverDrive-server';

// Link público da grade (/grade/[token]), sem login: a Thereza vê a grade dos próximos dias, mexe e aprova.
// GET: a grade. PUT { layout }: salva enquanto ela mexe (não perde se fechar). POST { layout, feedback }: aprova.
// Ao aprovar, cada casa da grade fica com a capa escolhida aprovada na pasta de capa e com a data do dia,
// e segue o fluxo de sempre (Salvar no Drive, aprovação do carrossel, programar).
// e, logo depois de responder, os cortes de cada casa vão para uma pasta nova na pasta da casa no Drive.
const noStore = { 'Cache-Control': 'private, no-store' };
// tempo para salvar os cortes de todas as casas no Drive depois da resposta (after)
export const maxDuration = 60;

async function findPlan(token: string) {
  if (!PLAN_TOKEN.test(token)) return null;
  const admin = createAdminClient();
  const row = await loadPlanRow(admin, { token }).catch(() => null);
  return row ? { admin, row, plan: await loadPlanDetail(admin, row) } : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const found = await findPlan((await params).token);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { plan } = found;
  const body: PublicFeedPlan = {
    startDate: plan.startDate,
    days: plan.days,
    hour: plan.hour,
    status: plan.status,
    feedback: plan.feedback,
    respondedAt: plan.respondedAt,
    houses: plan.houses,
    published: plan.published,
  };
  return NextResponse.json(body, { headers: noStore });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const found = await findPlan((await params).token);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { admin, plan } = found;
  const body = (await request.json().catch(() => ({}))) as { layout?: unknown };
  const layout = validateLayout(body.layout, plan.houses, plan.startDate, plan.days);
  if (!layout) return NextResponse.json({ error: 'invalid_layout' }, { status: 400, headers: noStore });
  await saveLayout(admin, plan.id, layout);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const found = await findPlan((await params).token);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { admin, plan } = found;
  const body = (await request.json().catch(() => ({}))) as { layout?: unknown; feedback?: unknown };
  const layout = validateLayout(body.layout, plan.houses, plan.startDate, plan.days);
  if (!layout) return NextResponse.json({ error: 'invalid_layout' }, { status: 400, headers: noStore });
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 2000) : '';
  await saveLayout(admin, plan.id, layout);

  const now = new Date().toISOString();
  const byId = new Map(plan.houses.map((house) => [house.collectionId, house]));
  const scheduled = layout.filter((item) => item.slotDate).sort((a, b) => a.slotDate!.localeCompare(b.slotDate!));
  const summary: string[] = [];

  for (const item of scheduled) {
    const house = byId.get(item.collectionId);
    if (!house) continue;
    const cover = coverOf({ ...house, coverDriveId: item.coverDriveId });
    if (!cover) continue;
    const photos = () => admin.from('cover_collection_photos');
    // a capa escolhida na grade é a aprovada da casa (as outras deixam de estar aprovadas)
    await photos().update({ approved: false, approved_by: null, approved_at: null }).eq('collection_id', house.collectionId).neq('drive_file_id', cover.driveId);
    await photos().update({ approved: true, approved_by: APPROVER_LABEL, approved_at: now }).eq('collection_id', house.collectionId).eq('drive_file_id', cover.driveId);
    const folder = { responded_at: now, updated_at: now, client_feedback: feedback };
    const dated = await admin
      .from('cover_collections')
      .update({ ...folder, planned_date: item.slotDate, planned_hour: plan.hour, confirmed_by: null, confirmed_at: null })
      .eq('id', house.collectionId);
    if (isMissingColumn(dated.error)) await admin.from('cover_collections').update(folder).eq('id', house.collectionId);
    await logCoverActivity(admin, {
      collectionId: house.collectionId,
      actorId: null,
      actorLabel: APPROVER_LABEL,
      action: 'capa.aprovada_na_grade',
      details: { pasta: house.label, tipo: 'capa', foto: cover.name, data: item.slotDate },
    });
    summary.push(`${item.slotDate!.split('-').reverse().slice(0, 2).join('/')}: ${house.label}`);
  }

  const { error } = await admin.from('feed_plans').update({ status: 'aprovado', responded_at: now, feedback, updated_at: now }).eq('id', plan.id);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  const periodo = periodLabel(plan.startDate, plan.days);
  await logPlanActivity(admin, {
    planId: plan.id,
    actorId: null,
    actorLabel: APPROVER_LABEL,
    action: 'grade.aprovada',
    details: { periodo, casas: summary, comentario: feedback },
  });

  // depois da resposta: cortes das capas de cada casa da grade numa pasta nova no Drive (a Thereza não espera)
  after(async () => {
    const houses = scheduled.map((item) => ({ item, house: byId.get(item.collectionId) })).filter((entry) => entry.house);
    if (!(await driveCanCreate())) {
      await logPlanActivity(admin, { planId: plan.id, actorId: null, actorLabel: 'Sistema', action: 'grade.cortes_drive_falhou', details: { periodo, motivo: 'drive_sem_permissao' } });
      return;
    }
    const salvas: string[] = [];
    const semCorte: string[] = [];
    const falhas: string[] = [];
    // 3 casas por vez
    for (let i = 0; i < houses.length; i += 3) {
      await Promise.all(
        houses.slice(i, i + 3).map(async ({ item, house }) => {
          try {
            const result = await saveHouseCropsToDrive(admin, house!.collectionId, { house: house!.label, period: periodo, day: item.slotDate, approvedAt: now });
            if (result.status === 'saved') salvas.push(`${house!.label} (${result.saved.length})`);
            else if (result.status === 'no_crops') semCorte.push(house!.label);
            else falhas.push(house!.label);
            if (result.status === 'saved' && result.failed.length) falhas.push(`${house!.label}: ${result.failed.join(', ')}`);
          } catch (driveError) {
            console.error('Falha ao salvar os cortes da grade no Drive:', house!.label, driveError);
            falhas.push(house!.label);
          }
        }),
      );
    }
    await logPlanActivity(admin, {
      planId: plan.id,
      actorId: null,
      actorLabel: 'Sistema',
      action: falhas.length ? 'grade.cortes_drive_falhou' : 'grade.cortes_salvos',
      details: { periodo, casas: salvas, sem_corte: semCorte, falhas },
    });
  });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
