import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { cleanEdited, loadCollection, touchCollection } from '@/lib/covers-server';

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
  if (!member.can('editar_publicacoes') && !member.can('criar_publicacoes')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const id = await idFrom(params);
  const body = (await request.json().catch(() => ({}))) as {
    houseName?: string; neighborhood?: string; houseNumber?: string; photo?: string; favorite?: boolean; remove?: boolean; edited?: unknown;
  };
  const admin = createAdminClient();

  if (typeof body.photo === 'string') {
    const target = admin.from('cover_collection_photos');
    const edited = 'edited' in body ? cleanEdited(body.edited) : undefined;
    if ('edited' in body && !edited) return NextResponse.json({ error: 'invalid_edit' }, { status: 400, headers: noStore });
    const { error } = body.remove
      ? await target.delete().eq('collection_id', id).eq('drive_file_id', body.photo)
      : edited
        ? await target.update(edited).eq('collection_id', id).eq('drive_file_id', body.photo)
        : await target.update({ is_favorite: Boolean(body.favorite), ...(body.favorite ? {} : { approved: false }) }).eq('collection_id', id).eq('drive_file_id', body.photo);
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  } else {
    const changes = {
      ...(clean(body.houseName) !== undefined ? { house_name: clean(body.houseName) } : {}),
      ...(clean(body.neighborhood) !== undefined ? { neighborhood: clean(body.neighborhood) } : {}),
      ...(clean(body.houseNumber, 20) !== undefined ? { house_number: clean(body.houseNumber, 20) } : {}),
    };
    if (Object.keys(changes).length) {
      const { error } = await admin.from('cover_collections').update(changes).eq('id', id);
      if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
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
  const { error } = await createAdminClient().from('cover_collections').delete().eq('id', await idFrom(params));
  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
