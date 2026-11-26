import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID } from '@/lib/google/drive';
import { COLLECTION_COLUMNS, LEGACY_COLLECTION_COLUMNS, PHOTO_COLUMNS, isMissingColumn, cleanEdited, collectionKind, collectionName, loadCollection, logCoverActivity, toPhoto, toSummary, touchCollection } from '@/lib/covers-server';
import { parseKind, parsePlanned, photoLimit, type CollectionPostInfo } from '@/lib/covers';
import { onlyVisible } from '@/lib/google/driveAccess';

// Pastas da aprovação de capa e da aprovação fotos (uma por casa). GET ?tipo=capa|fotos lista; POST cria uma pasta ou junta fotos numa existente.
// Na aprovação fotos a pasta guarda no máximo 15 fotos (o carrossel).

const noStore = { 'Cache-Control': 'private, no-store' };
const clean = (value: unknown, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function GET(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('ver_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const kind = parseKind(request.nextUrl.searchParams.get('tipo'));
  const admin = createAdminClient();
  const list = (filter: boolean, columns = COLLECTION_COLUMNS) => {
    const query = admin.from('cover_collections').select(columns);
    return (filter ? query.eq('kind', kind) : query).order('updated_at', { ascending: false });
  };
  let { data: rawRows, error } = await list(true);
  // migração da data planejada ainda não rodada: lista sem a data
  if (isMissingColumn(error)) ({ data: rawRows, error } = await list(true, LEGACY_COLLECTION_COLUMNS));
  // migração da coluna kind ainda não rodada: a aba de capa continua funcionando como antes
  if (error?.code === '42703' && kind === 'capa') ({ data: rawRows, error } = await list(false, LEGACY_COLLECTION_COLUMNS));
  if (error) {
    console.error('Falha ao listar pastas de capa:', error.message);
    return NextResponse.json({ error: 'list_failed' }, { status: 500, headers: noStore });
  }
  const rows = (rawRows ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((row) => Number(row.id));
  const { data: photoRows } = ids.length
    ? await admin.from('cover_collection_photos').select(PHOTO_COLUMNS).in('collection_id', ids).order('position', { ascending: true })
    : { data: [] };
  const byCollection = new Map<number, ReturnType<typeof toPhoto>[]>();
  for (const row of photoRows ?? []) {
    const list = byCollection.get(Number(row.collection_id)) ?? [];
    list.push(toPhoto(row));
    byCollection.set(Number(row.collection_id), list);
  }
  // post programado a partir de cada pasta (o mais recente), para a fila mostrar agendado/publicado
  const { data: postRows } = ids.length
    ? await admin
        .from('posts')
        .select('cover_collection_id, scheduled_date, hour, auto_publish, publish_status, ig_permalink, id')
        .in('cover_collection_id', ids)
        .order('id', { ascending: false })
    : { data: [] };
  const postByCollection = new Map<number, CollectionPostInfo>();
  for (const row of postRows ?? []) {
    const key = Number(row.cover_collection_id);
    if (postByCollection.has(key)) continue;
    postByCollection.set(key, {
      id: Number(row.id),
      status: row.publish_status === 'published' ? 'published' : row.auto_publish || row.publish_status === 'processing' ? 'scheduled' : 'saved',
      scheduledDate: row.scheduled_date ?? null,
      hour: typeof row.hour === 'number' ? row.hour : null,
      permalink: row.ig_permalink ?? null,
    });
  }
  const collections = rows.map((row) => ({
    ...toSummary(row, byCollection.get(Number(row.id)) ?? []),
    post: postByCollection.get(Number(row.id)) ?? null,
  }));
  return NextResponse.json({ collections }, { headers: noStore });
}

interface IncomingPhoto { id: string; name?: string; width?: number; height?: number; favorite?: boolean; edited?: unknown }

export async function POST(request: NextRequest) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('criar_publicacoes')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const body = (await request.json().catch(() => ({}))) as {
    collectionId?: number; houseName?: string; neighborhood?: string; houseNumber?: string; photos?: IncomingPhoto[]; kind?: string;
    plannedDate?: unknown; plannedHour?: unknown;
  };
  const photos = (Array.isArray(body.photos) ? body.photos : []).filter((photo) => typeof photo?.id === 'string' && DRIVE_ID.test(photo.id) && photo.id !== 'root').slice(0, 500);
  if (photos.length === 0) return NextResponse.json({ error: 'no_photos' }, { status: 400, headers: noStore });
  // só fotos de "Compartilhados comigo" (Meu Drive e drives compartilhados bloqueados)
  const allowed = new Set(await onlyVisible(member, photos.map((photo) => photo.id)).catch(() => [] as string[]));
  if (photos.some((photo) => !allowed.has(photo.id))) return NextResponse.json({ error: 'blocked' }, { status: 403, headers: noStore });

  const admin = createAdminClient();
  let collectionId = Number(body.collectionId) || 0;
  let kind = parseKind(body.kind);
  if (collectionId) {
    const existingKind = await collectionKind(admin, collectionId);
    if (!existingKind) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    kind = existingKind;
  }
  const limit = photoLimit(kind);
  if (limit && new Set(photos.map((photo) => photo.id)).size > limit) {
    return NextResponse.json({ error: 'too_many', limit }, { status: 400, headers: noStore });
  }

  if (!collectionId) {
    const houseName = clean(body.houseName);
    const houseNumber = clean(body.houseNumber, 20);
    if (!houseName && !houseNumber) return NextResponse.json({ error: 'missing_house' }, { status: 400, headers: noStore });
    const base = {
      house_name: houseName,
      neighborhood: clean(body.neighborhood),
      house_number: houseNumber,
      created_by: member.user.id,
      ...(kind === 'capa' ? {} : { kind }),
    };
    const insert = (row: Record<string, unknown>) => admin.from('cover_collections').insert(row).select('id').single();
    let { data, error } = await insert({ ...base, ...(parsePlanned(body.plannedDate, body.plannedHour) ?? {}) });
    // migração da data planejada ainda não rodada: cria sem a data
    if (isMissingColumn(error)) ({ data, error } = await insert(base));
    if (error || !data) {
      console.error('Falha ao criar pasta de capa:', error?.message);
      return NextResponse.json({ error: 'create_failed' }, { status: 500, headers: noStore });
    }
    collectionId = data.id;
    await logCoverActivity(admin, {
      collectionId,
      actorId: member.user.id,
      actorLabel: member.label,
      action: 'capa.pasta_criada',
      details: { pasta: await collectionName(admin, collectionId), tipo: kind },
    });
  }

  // continua a numeração depois da última foto da pasta; fotos repetidas mantêm a estrela que já tinham, a não ser que venham favoritadas
  const { data: existing } = await admin.from('cover_collection_photos').select('drive_file_id, is_favorite, position, added_by, created_at, favorited_by, favorited_at').eq('collection_id', collectionId);
  const known = new Map((existing ?? []).map((row) => [row.drive_file_id as string, row]));
  if (limit && new Set([...known.keys(), ...photos.map((photo) => photo.id)]).size > limit) {
    return NextResponse.json({ error: 'too_many', limit, current: known.size }, { status: 400, headers: noStore });
  }
  let position = Math.max(-1, ...(existing ?? []).map((row) => Number(row.position))) + 1;
  const now = new Date().toISOString();
  const rows = photos.map((photo) => {
    const before = known.get(photo.id);
    const favoriteNow = Boolean(photo.favorite) && !before?.is_favorite;
    return {
      collection_id: collectionId,
      drive_file_id: photo.id,
      name: clean(photo.name, 300),
      width: Number.isFinite(photo.width) ? Math.round(Number(photo.width)) : null,
      height: Number.isFinite(photo.height) ? Math.round(Number(photo.height)) : null,
      is_favorite: Boolean(photo.favorite) || Boolean(before?.is_favorite),
      position: before ? Number(before.position) : position++,
      // registro: quem escolheu e quem marcou como capa (mantém o que já existia)
      added_by: before ? before.added_by ?? null : member.label,
      favorited_by: favoriteNow ? member.label : before?.favorited_by ?? null,
      favorited_at: favoriteNow ? now : before?.favorited_at ?? null,
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
  const newPhotos = rows.filter((row) => !known.has(row.drive_file_id));
  await logCoverActivity(admin, {
    collectionId,
    actorId: member.user.id,
    actorLabel: member.label,
    action: 'capa.fotos_adicionadas',
    details: {
      pasta: await collectionName(admin, collectionId),
      tipo: kind,
      quantidade: newPhotos.length,
      fotos: newPhotos.map((row) => row.name).slice(0, 50),
      capas: rows.filter((row) => row.favorited_at === now).map((row) => row.name).slice(0, 50),
    },
  });
  await touchCollection(admin, collectionId);
  return NextResponse.json({ collection: await loadCollection(admin, collectionId) }, { headers: noStore });
}
