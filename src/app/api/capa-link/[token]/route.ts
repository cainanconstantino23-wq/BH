import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { coverFolderLabel } from '@/lib/house';
import { PHOTO_COLUMNS, collectionKind, logCoverActivity, toPhoto } from '@/lib/covers-server';
import { APPROVER_LABEL, type PublicCoverCollection } from '@/lib/covers';

// Rota pública do link de capa: quem tem o link vê as favoritas e escolhe a capa (sem login).
// Em "Encontrar mais fotos" a aprovadora vê as outras fotos da pasta (as do carrossel) e pode promover algumas a capa.
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const noStore = { 'Cache-Control': 'private, no-store' };

async function findCollection(token: string) {
  if (!TOKEN.test(token)) return null;
  const { data } = await createAdminClient()
    .from('cover_collections')
    .select('id, house_name, neighborhood, house_number, client_feedback, responded_at')
    .eq('share_token', token)
    .maybeSingle();
  return data;
}

async function allPhotos(id: number) {
  const { data } = await createAdminClient()
    .from('cover_collection_photos')
    .select(PHOTO_COLUMNS)
    .eq('collection_id', id)
    .order('position', { ascending: true });
  return (data ?? []).map(toPhoto);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const collection = await findCollection((await params).token);
  if (!collection) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body: PublicCoverCollection = {
    label: coverFolderLabel(collection.house_name, collection.neighborhood, collection.house_number) || 'Casa',
    feedback: collection.client_feedback ?? '',
    respondedAt: collection.responded_at,
    photos: [],
    morePhotos: [],
  };
  for (const photo of await allPhotos(collection.id)) {
    // o link é público: não expõe os nomes da equipe, só se foi a aprovadora que pôs nas capas
    const shown = { ...photo, addedBy: null, favoritedBy: null, approvedBy: null, editedBy: photo.editedBy === APPROVER_LABEL ? APPROVER_LABEL : null };
    (photo.favorite ? body.photos : body.morePhotos).push(shown);
  }
  return NextResponse.json(body, { headers: noStore });
}

// Resposta: { approved: [ids das capas escolhidas], added: [ids que ela mesma pôs nas capas], feedback }
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const collection = await findCollection((await params).token);
  if (!collection) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = (await request.json().catch(() => ({}))) as { approved?: unknown; added?: unknown; feedback?: unknown };
  const ids = (value: unknown) => new Set((Array.isArray(value) ? value : []).filter((id): id is string => typeof id === 'string'));
  const approved = ids(body.approved);
  const added = ids(body.added);
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 2000) : '';
  if (approved.size === 0 && !feedback) return NextResponse.json({ error: 'empty' }, { status: 400, headers: noStore });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // só fotos desta pasta: as favoritas e as que ela mesma acrescentou às capas
  const photos = await allPhotos(collection.id);
  const promoted = photos.filter((photo) => !photo.favorite && added.has(photo.driveId));
  const capas = [...photos.filter((photo) => photo.favorite), ...promoted];
  const chosen = capas.filter((photo) => approved.has(photo.driveId));
  const newlyApproved = chosen.filter((photo) => !photo.approved).map((photo) => photo.driveId);
  const unapproved = photos.filter((photo) => photo.approved && !approved.has(photo.driveId));
  const table = () => admin.from('cover_collection_photos');
  const none = { error: null };

  // fotos do carrossel que ela pôs nas capas: registradas como dela
  const promote = promoted.length
    ? await table()
        .update({ is_favorite: true, favorited_by: APPROVER_LABEL, favorited_at: now, favorited_by_approver: true })
        .eq('collection_id', collection.id)
        .in('drive_file_id', promoted.map((photo) => photo.driveId))
    : none;
  // capas aprovadas: quem e quando (as que continuam aprovadas mantêm a data original)
  const mark = newlyApproved.length
    ? await table().update({ approved: true, approved_by: APPROVER_LABEL, approved_at: now }).eq('collection_id', collection.id).in('drive_file_id', newlyApproved)
    : none;
  const reset = unapproved.length
    ? await table()
        .update({ approved: false, approved_by: null, approved_at: null })
        .eq('collection_id', collection.id)
        .in('drive_file_id', unapproved.map((photo) => photo.driveId))
    : none;
  const save = await admin
    .from('cover_collections')
    .update({ client_feedback: feedback, responded_at: now, updated_at: now })
    .eq('id', collection.id);
  if (promote.error || reset.error || mark.error || save.error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });

  const pasta = coverFolderLabel(collection.house_name, collection.neighborhood, collection.house_number) || 'Sem nome';
  const tipo = await collectionKind(admin, collection.id);
  if (promoted.length) {
    await logCoverActivity(admin, {
      collectionId: collection.id,
      actorId: null,
      actorLabel: APPROVER_LABEL,
      action: 'capa.capas_adicionadas_aprovadora',
      details: { pasta, tipo, fotos: promoted.map((photo) => photo.name) },
    });
  }
  await logCoverActivity(admin, {
    collectionId: collection.id,
    actorId: null,
    actorLabel: APPROVER_LABEL,
    action: 'capa.respondido',
    details: {
      pasta,
      tipo,
      aprovadas: chosen.map((photo) => photo.name),
      desmarcadas: unapproved.map((photo) => photo.name),
      comentario: feedback,
    },
  });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
