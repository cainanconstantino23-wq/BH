import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { coverFolderLabel } from '@/lib/house';
import { PHOTO_COLUMNS, toPhoto } from '@/lib/covers-server';
import type { PublicCoverCollection } from '@/lib/covers';

// Rota pública do link de capa: quem tem o link vê as favoritas e escolhe a capa (sem login).
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

async function favorites(id: number) {
  const { data } = await createAdminClient()
    .from('cover_collection_photos')
    .select(PHOTO_COLUMNS)
    .eq('collection_id', id)
    .eq('is_favorite', true)
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
    photos: await favorites(collection.id),
  };
  return NextResponse.json(body, { headers: noStore });
}

// Resposta: { approved: [ids das capas escolhidas], feedback }
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const collection = await findCollection((await params).token);
  if (!collection) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = (await request.json().catch(() => ({}))) as { approved?: unknown; feedback?: unknown };
  const approved = new Set((Array.isArray(body.approved) ? body.approved : []).filter((id): id is string => typeof id === 'string'));
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 2000) : '';
  if (approved.size === 0 && !feedback) return NextResponse.json({ error: 'empty' }, { status: 400, headers: noStore });

  const admin = createAdminClient();
  const ids = (await favorites(collection.id)).map((photo) => photo.driveId);
  const chosen = ids.filter((id) => approved.has(id));
  const reset = await admin.from('cover_collection_photos').update({ approved: false }).eq('collection_id', collection.id);
  const mark = chosen.length
    ? await admin.from('cover_collection_photos').update({ approved: true }).eq('collection_id', collection.id).in('drive_file_id', chosen)
    : { error: null };
  const save = await admin
    .from('cover_collections')
    .update({ client_feedback: feedback, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', collection.id);
  if (reset.error || mark.error || save.error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
