import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID } from '@/lib/google/drive';
import { COLLECTION_COLUMNS, PHOTO_COLUMNS, cleanEdited, loadCollection, toPhoto, toSummary, touchCollection } from '@/lib/covers-server';

// Pastas da aprovação de capa (uma por casa). GET lista; POST cria uma pasta ou junta fotos numa existente.

const noStore = { 'Cache-Control': 'private, no-store' };
const clean = (value: unknown, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const admin = createAdminClient();
  const { data: rows, error } = await admin.from('cover_collections').select(COLLECTION_COLUMNS).order('updated_at', { ascending: false });
  if (error) {
    console.error('Falha ao listar pastas de capa:', error.message);
    return NextResponse.json({ error: 'list_failed' }, { status: 500, headers: noStore });
  }
  const ids = (rows ?? []).map((row) => row.id);
  const { data: photoRows } = ids.length
    ? await admin.from('cover_collection_photos').select(PHOTO_COLUMNS).in('collection_id', ids).order('position', { ascending: true })
    : { data: [] };
  const byCollection = new Map<number, ReturnType<typeof toPhoto>[]>();
  for (const row of photoRows ?? []) {
    const list = byCollection.get(Number(row.collection_id)) ?? [];
    list.push(toPhoto(row));
    byCollection.set(Number(row.collection_id), list);
  }
  const collections = (rows ?? []).map((row) => toSummary(row, byCollection.get(Number(row.id)) ?? []));
  return NextResponse.json({ collections }, { headers: noStore });
}

interface IncomingPhoto { id: string; name?: string; width?: number; height?: number; favorite?: boolean; edited?: unknown }

export async function POST(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('criar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const body = (await request.json().catch(() => ({}))) as {
    collectionId?: number; houseName?: string; neighborhood?: string; houseNumber?: string; photos?: IncomingPhoto[];
  };
  const photos = (Array.isArray(body.photos) ? body.photos : []).filter((photo) => typeof photo?.id === 'string' && DRIVE_ID.test(photo.id) && photo.id !== 'root').slice(0, 500);
  if (photos.length === 0) return NextResponse.json({ error: 'no_photos' }, { status: 400, headers: noStore });

  const admin = createAdminClient();
  let collectionId = Number(body.collectionId) || 0;

  if (!collectionId) {
    const houseName = clean(body.houseName);
    const houseNumber = clean(body.houseNumber, 20);
    if (!houseName && !houseNumber) return NextResponse.json({ error: 'missing_house' }, { status: 400, headers: noStore });
    const { data, error } = await admin
      .from('cover_collections')
      .insert({ house_name: houseName, neighborhood: clean(body.neighborhood), house_number: houseNumber, created_by: member.user.id })
      .select('id')
      .single();
    if (error || !data) {
      console.error('Falha ao criar pasta de capa:', error?.message);
      return NextResponse.json({ error: 'create_failed' }, { status: 500, headers: noStore });
    }
    collectionId = data.id;
  }

  // continua a numeração depois da última foto da pasta; fotos repetidas mantêm a estrela que já tinham, a não ser que venham favoritadas
  const { data: existing } = await admin.from('cover_collection_photos').select('drive_file_id, is_favorite, position').eq('collection_id', collectionId);
  const known = new Map((existing ?? []).map((row) => [row.drive_file_id as string, row]));
  let position = Math.max(-1, ...(existing ?? []).map((row) => Number(row.position))) + 1;
  const rows = photos.map((photo) => {
    const before = known.get(photo.id);
    return {
      collection_id: collectionId,
      drive_file_id: photo.id,
      name: clean(photo.name, 300),
      width: Number.isFinite(photo.width) ? Math.round(Number(photo.width)) : null,
      height: Number.isFinite(photo.height) ? Math.round(Number(photo.height)) : null,
      is_favorite: Boolean(photo.favorite) || Boolean(before?.is_favorite),
      position: before ? Number(before.position) : position++,
      ...(photo.edited ? cleanEdited(photo.edited) ?? {} : {}),
    };
  });
  const { error: photoError } = await admin.from('cover_collection_photos').upsert(rows, { onConflict: 'collection_id,drive_file_id' });
  if (photoError) {
    console.error('Falha ao salvar fotos de capa:', photoError.message);
    // pasta criada agora e sem fotos: desfaz para não ficar uma pasta vazia
    if (!Number(body.collectionId)) await admin.from('cover_collections').delete().eq('id', collectionId);
    return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  }
  await touchCollection(admin, collectionId);
  return NextResponse.json({ collection: await loadCollection(admin, collectionId) }, { headers: noStore });
}
