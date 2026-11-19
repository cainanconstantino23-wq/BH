import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { APPROVER_LABEL } from '@/lib/covers';
import { logCoverActivity, touchCollection } from '@/lib/covers-server';
import { ensureApproverPhoto } from '@/lib/coverFolder-server';
import { findPlanHouse } from '@/lib/feedPlan-server';

// Link da grade: a Thereza escolhe uma foto da pasta da casa no Drive como capa.
// POST { collectionId, fileId }: a foto entra nas candidatas da casa (registrada como dela) e volta para a tela.
// Só grava no banco do app; nada muda no Drive.
const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const body = (await request.json().catch(() => ({}))) as { collectionId?: unknown; fileId?: unknown };
  const admin = createAdminClient();
  const house = await findPlanHouse(admin, (await params).token, body.collectionId);
  if (!house || typeof body.fileId !== 'string' || !body.fileId) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const photo = await ensureApproverPhoto(admin, house.collectionId, body.fileId);
  if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { data: row } = await admin.from('cover_collection_photos').select('edited_url').eq('collection_id', house.collectionId).eq('drive_file_id', body.fileId).maybeSingle();
  if (photo.inserted) {
    await touchCollection(admin, house.collectionId);
    await logCoverActivity(admin, {
      collectionId: house.collectionId,
      actorId: null,
      actorLabel: APPROVER_LABEL,
      action: 'capa.capas_adicionadas_aprovadora',
      details: { pasta: house.label, tipo: 'capa', fotos: [photo.name], origem: 'grade' },
    });
  }
  return NextResponse.json({ candidate: { driveId: body.fileId, name: photo.name, editedUrl: (row?.edited_url as string | null) ?? null } }, { headers: noStore });
}
