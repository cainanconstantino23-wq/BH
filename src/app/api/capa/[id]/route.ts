import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { cleanEdited, collectionKind, collectionName, loadCollection, logCoverActivity, touchCollection } from '@/lib/covers-server';
import { parsePlanned } from '@/lib/covers';

// Uma pasta de capa: ver, editar (nome, estrela, remover foto) e apagar.

const noStore = { 'Cache-Control': 'private, no-store' };
const clean = (value: unknown, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : undefined);
const idFrom = async (params: Promise<{ id: string }>) => Number((await params).id) || 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const collection = await loadCollection(createAdminClient(), await idFrom(params)).catch(() => null);
  if (!collection) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ collection }, { headers: noStore });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const id = await idFrom(params);
  const body = (await request.json().catch(() => ({}))) as {
    houseName?: string; neighborhood?: string; houseNumber?: string; photo?: string; favorite?: boolean; remove?: boolean; edited?: unknown;
    plannedDate?: unknown; plannedHour?: unknown;
  };
  const onlyDate = 'plannedDate' in body && Object.keys(body).every((key) => key === 'plannedDate' || key === 'plannedHour');
  const canEdit = member.can('editar_publicacoes') || member.can('criar_publicacoes');
  // mudar só a data planejada também vale para quem pode reagendar (ex.: arrastar na Grade do feed)
  if (!canEdit && !(onlyDate && member.can('reagendar_publicacoes'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const admin = createAdminClient();
  const log = async (action: string, details: Record<string, unknown>) =>
    logCoverActivity(admin, {
      collectionId: id,
      actorId: member.user.id,
      actorLabel: member.label,
      action,
      details: { pasta: await collectionName(admin, id), tipo: await collectionKind(admin, id), ...details },
    });

  if (onlyDate) {
    const planned = parsePlanned(body.plannedDate, body.plannedHour);
    if (!planned) return NextResponse.json({ error: 'invalid_date' }, { status: 400, headers: noStore });
    const { error } = await admin.from('cover_collections').update(planned).eq('id', id);
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
    await log('capa.data_planejada', { data: planned.planned_date, hora: planned.planned_hour });
  } else if (typeof body.photo === 'string') {
    const target = admin.from('cover_collection_photos');
    const edited = 'edited' in body ? cleanEdited(body.edited) : undefined;
    if ('edited' in body && !edited) return NextResponse.json({ error: 'invalid_edit' }, { status: 400, headers: noStore });
    const { data: photo } = await target.select('name, is_favorite, approved').eq('collection_id', id).eq('drive_file_id', body.photo).maybeSingle();
    if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const now = new Date().toISOString();
    const favorite = Boolean(body.favorite);
    const { error } = body.remove
      ? await target.delete().eq('collection_id', id).eq('drive_file_id', body.photo)
      : edited
        ? await target.update(edited).eq('collection_id', id).eq('drive_file_id', body.photo)
        : await target
            .update(
              favorite
                ? { is_favorite: true, ...(photo.is_favorite ? {} : { favorited_by: member.label, favorited_at: now, favorited_by_approver: false }) }
                : { is_favorite: false, favorited_by: null, favorited_at: null, favorited_by_approver: false, approved: false, approved_by: null, approved_at: null },
            )
            .eq('collection_id', id)
            .eq('drive_file_id', body.photo);
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
    if (body.remove) await log('capa.foto_removida', { foto: photo.name, era_capa: photo.is_favorite, era_aprovada: photo.approved });
    else if (edited) await log(edited.edited_url ? 'capa.foto_cortada' : 'capa.corte_desfeito', { foto: photo.name, formato: edited.edited_label });
    else if (favorite !== photo.is_favorite) await log(favorite ? 'capa.capa_marcada' : 'capa.capa_desmarcada', { foto: photo.name, era_aprovada: photo.approved });
  } else {
    const changes = {
      ...(clean(body.houseName) !== undefined ? { house_name: clean(body.houseName) } : {}),
      ...(clean(body.neighborhood) !== undefined ? { neighborhood: clean(body.neighborhood) } : {}),
      ...(clean(body.houseNumber, 20) !== undefined ? { house_number: clean(body.houseNumber, 20) } : {}),
    };
    if (Object.keys(changes).length) {
      const before = await collectionName(admin, id);
      const { error } = await admin.from('cover_collections').update(changes).eq('id', id);
      if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
      await log('capa.pasta_renomeada', { de: before });
    }
  }
  await touchCollection(admin, id);
  const collection = await loadCollection(admin, id);
  if (!collection) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ collection }, { headers: noStore });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('apagar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const admin = createAdminClient();
  const id = await idFrom(params);
  const pasta = await collectionName(admin, id);
  const tipo = await collectionKind(admin, id);
  const { error } = await admin.from('cover_collections').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500, headers: noStore });
  // o registro continua no histórico mesmo com a pasta apagada
  await logCoverActivity(admin, { collectionId: id, actorId: member.user.id, actorLabel: member.label, action: 'capa.pasta_apagada', details: { pasta, tipo } });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
