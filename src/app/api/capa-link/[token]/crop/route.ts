import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { coverFolderLabel } from '@/lib/house';
import { cleanEdited, collectionKind, logCoverActivity, saveEdited, touchCollection } from '@/lib/covers-server';
import { APPROVER_LABEL } from '@/lib/covers';
import { checkCropUpload } from '@/lib/coverCrop';
import { putR2Object } from '@/lib/r2';
import { ensureApproverPhoto } from '@/lib/coverFolder-server';

// Corte feito pela aprovadora no link público (/capa/[token]).
// POST (multipart: fileId, file JPEG, width, height, label) envia o corte ao R2 e grava na foto.
// DELETE ({ fileId }) volta para a foto original.
// Só fotos desta pasta; sem login (quem tem o link responde), por isso o envio passa pelo servidor e é conferido.

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const noStore = { 'Cache-Control': 'private, no-store' };
type Params = { params: Promise<{ token: string }> };

async function findPhoto(token: string, fileId: unknown, fromFolder = false) {
  if (!TOKEN.test(token) || typeof fileId !== 'string' || !fileId) return null;
  const admin = createAdminClient();
  const { data: collection } = await admin
    .from('cover_collections')
    .select('id, house_name, neighborhood, house_number')
    .eq('share_token', token)
    .maybeSingle();
  if (!collection) return null;
  // foto da pasta da casa no Drive que ainda não estava na pasta de capa: entra como capa posta pela aprovadora
  if (fromFolder && !(await ensureApproverPhoto(admin, collection.id, fileId))) return null;
  const { data: photo } = await admin
    .from('cover_collection_photos')
    .select('drive_file_id, name')
    .eq('collection_id', collection.id)
    .eq('drive_file_id', fileId)
    .maybeSingle();
  return photo ? { admin, collection, photo } : null;
}

async function finish(found: NonNullable<Awaited<ReturnType<typeof findPhoto>>>, action: string, formato: string | null) {
  const { admin, collection, photo } = found;
  await touchCollection(admin, collection.id);
  await logCoverActivity(admin, {
    collectionId: collection.id,
    actorId: null,
    actorLabel: APPROVER_LABEL,
    action,
    details: {
      pasta: coverFolderLabel(collection.house_name, collection.neighborhood, collection.house_number) || 'Sem nome',
      tipo: await collectionKind(admin, collection.id),
      foto: photo.name,
      formato,
    },
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const found = await findPhoto((await params).token, form.get('fileId'), true);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const width = Number(form.get('width'));
  const height = Number(form.get('height'));
  const problem = checkCropUpload({ bytes, width, height });
  if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: noStore });

  const key = `uploads/capa-${found.collection.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  let url: string;
  try {
    url = await putR2Object(key, bytes, 'image/jpeg');
  } catch (error) {
    console.error('Falha ao enviar o corte da aprovadora ao R2:', error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 502, headers: noStore });
  }
  const label = typeof form.get('label') === 'string' ? String(form.get('label')) : '';
  const edited = cleanEdited({ url, width, height, label });
  if (!edited) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const { error } = await saveEdited(found.admin, found.collection.id, found.photo.drive_file_id, edited, APPROVER_LABEL);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  await finish(found, 'capa.foto_cortada', edited.edited_label);
  return NextResponse.json({ edited: { url, width, height, label: edited.edited_label ?? '' }, editedAt: new Date().toISOString() }, { headers: noStore });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const body = (await request.json().catch(() => ({}))) as { fileId?: unknown };
  const found = await findPhoto((await params).token, body.fileId);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const original = cleanEdited(null)!;
  const { error } = await saveEdited(found.admin, found.collection.id, found.photo.drive_file_id, original, APPROVER_LABEL);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  await finish(found, 'capa.corte_desfeito', null);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
