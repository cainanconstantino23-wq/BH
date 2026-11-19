import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { cleanEdited, logCoverActivity, saveEdited, touchCollection } from '@/lib/covers-server';
import { APPROVER_LABEL } from '@/lib/covers';
import { checkCropUpload } from '@/lib/coverCrop';
import { putR2Object } from '@/lib/r2';
import { ensureApproverPhoto } from '@/lib/coverFolder-server';
import { findPlanHouse } from '@/lib/feedPlan-server';

// Corte feito pela Thereza no link da grade (/grade/[token]), igual ao do link de capa.
// POST (multipart: collectionId, fileId, file JPEG, width, height, label): envia o corte ao R2 e grava na foto.
//   Foto da pasta da casa no Drive que ainda não era candidata entra na pasta de capa como escolhida por ela.
// DELETE ({ collectionId, fileId }): volta para a foto original.
// O corte vai para o R2 do app; a foto no Drive nunca é alterada.

const noStore = { 'Cache-Control': 'private, no-store' };
type Params = { params: Promise<{ token: string }> };

async function log(house: NonNullable<Awaited<ReturnType<typeof findPlanHouse>>>, action: string, foto: string, formato: string | null) {
  const admin = createAdminClient();
  await touchCollection(admin, house.collectionId);
  await logCoverActivity(admin, { collectionId: house.collectionId, actorId: null, actorLabel: APPROVER_LABEL, action, details: { pasta: house.label, tipo: 'capa', foto, formato, origem: 'grade' } });
}

export async function POST(request: NextRequest, { params }: Params) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const admin = createAdminClient();
  const house = await findPlanHouse(admin, (await params).token, form.get('collectionId'));
  const fileId = form.get('fileId');
  if (!house || typeof fileId !== 'string' || !fileId) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const photo = await ensureApproverPhoto(admin, house.collectionId, fileId);
  if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const width = Number(form.get('width'));
  const height = Number(form.get('height'));
  const problem = checkCropUpload({ bytes, width, height });
  if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: noStore });

  let url: string;
  try {
    url = await putR2Object(`uploads/capa-${house.collectionId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`, bytes, 'image/jpeg');
  } catch (error) {
    console.error('Falha ao enviar o corte da grade ao R2:', error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 502, headers: noStore });
  }
  const label = typeof form.get('label') === 'string' ? String(form.get('label')) : '';
  const edited = cleanEdited({ url, width, height, label });
  if (!edited) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const { error } = await saveEdited(admin, house.collectionId, fileId, edited, APPROVER_LABEL);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  await log(house, 'capa.foto_cortada', photo.name, edited.edited_label);
  return NextResponse.json(
    { candidate: { driveId: fileId, name: photo.name, editedUrl: url }, added: photo.inserted, editedAt: new Date().toISOString() },
    { headers: noStore },
  );
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const body = (await request.json().catch(() => ({}))) as { collectionId?: unknown; fileId?: unknown };
  const admin = createAdminClient();
  const house = await findPlanHouse(admin, (await params).token, body.collectionId);
  if (!house || typeof body.fileId !== 'string') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { data: photo } = await admin.from('cover_collection_photos').select('name').eq('collection_id', house.collectionId).eq('drive_file_id', body.fileId).maybeSingle();
  if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { error } = await saveEdited(admin, house.collectionId, body.fileId, cleanEdited(null)!, APPROVER_LABEL);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  await log(house, 'capa.corte_desfeito', String(photo.name ?? ''), null);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
