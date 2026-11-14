import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';

// Link público da pasta (só as favoritas). Devolve o atual; { renew: true } troca por um novo e o antigo para de funcionar.
const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('enviar_link_aprovacao')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const id = Number((await params).id) || 0;
  const { renew } = (await request.json().catch(() => ({}))) as { renew?: boolean };
  const admin = createAdminClient();
  const { data: row } = await admin.from('cover_collections').select('share_token').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (row.share_token && !renew) return NextResponse.json({ token: row.share_token }, { headers: noStore });

  const token = randomBytes(18).toString('base64url');
  const { error } = await admin.from('cover_collections').update({ share_token: token }).eq('id', id);
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500, headers: noStore });
  return NextResponse.json({ token }, { headers: noStore });
}
