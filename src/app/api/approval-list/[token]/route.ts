import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { houseLabel } from '@/lib/house';
import { isVideoMedia } from '@/lib/media';

// Rota pública da lista de aprovação: com um token ativo, devolve os posts ainda não aprovados.
// Expõe só o necessário para o cartão; cada post abre na página dele (/approval/[token]).

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const noStore = { 'Cache-Control': 'private, no-store' };

export interface ApprovalListItem {
  token: string;
  houseName: string;
  coverUrl: string;
  mediaType: 'image' | 'video';
  format: string;
  scheduledDate: string;
  scheduledTime: string;
  status: 'pending' | 'changes_requested';
  version: number;
  feedback: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token).trim();
  if (!TOKEN_PATTERN.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin
    .from('approval_list_links')
    .select('token')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();
  if (linkError) {
    console.error('Falha ao validar o link da lista:', linkError.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const { data: posts, error } = await admin
    .from('posts')
    .select('id, approval_token, house_name, house_number, title, image_url, media_type, platform, scheduled_date, time_string, approval_status, client_feedback')
    .in('approval_status', ['pending', 'changes_requested'])
    .not('approval_token', 'is', null)
    .order('scheduled_date', { ascending: true })
    .order('hour', { ascending: true });
  if (error) {
    console.error('Falha ao buscar posts da lista:', error.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }

  const rows = (posts ?? []) as Record<string, unknown>[];
  const versions = new Map<string, number>();
  if (rows.length) {
    const { data: versionRows } = await admin
      .from('post_versions')
      .select('post_id, version')
      .in('post_id', rows.map((row) => row.id));
    for (const v of (versionRows ?? []) as { post_id: number; version: number }[]) {
      versions.set(String(v.post_id), Math.max(versions.get(String(v.post_id)) ?? 0, v.version));
    }
  }

  const items: ApprovalListItem[] = rows.map((row) => {
    const coverUrl = text(row.image_url);
    return {
      token: text(row.approval_token).replace(/[()]/g, '').trim(),
      houseName: houseLabel(text(row.house_name), text(row.house_number)) || text(row.title) || 'Casa',
      coverUrl,
      mediaType: isVideoMedia(coverUrl, text(row.media_type)) ? 'video' : 'image',
      format: text(row.platform),
      scheduledDate: text(row.scheduled_date),
      scheduledTime: text(row.time_string),
      status: row.approval_status === 'changes_requested' ? 'changes_requested' : 'pending',
      version: versions.get(String(row.id)) ?? 1,
      feedback: row.approval_status === 'changes_requested' ? text(row.client_feedback) : '',
    };
  });

  return NextResponse.json({ items }, { headers: noStore });
}
