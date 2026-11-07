import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type {
  ApprovalDecision,
  ApprovalStatus,
  ClientApprovalPost,
} from '@/components/approval/ClientApprovalView';

// Rota pública da página de aprovação. Usa a chave de serviço no servidor,
// então continua funcionando quando o acesso anônimo à tabela posts for fechado.
// Só expõe o post cujo approval_token confere e só os campos que o cliente vê.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DECISIONS: ApprovalDecision[] = ['approved', 'changes_requested', 'rejected'];
const STATUSES: ApprovalStatus[] = ['pending', ...DECISIONS];
const MAX_FEEDBACK_LENGTH = 2000;
const POST_COLUMNS =
  'id, house_name, title, caption, content, image_url, media_type, platform, scheduled_date, time_string, approval_status, client_feedback, views_count';

const noStore = { 'Cache-Control': 'private, no-store' };

type RouteParams = { params: Promise<{ token: string }> };

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function cleanToken(raw: string) {
  const token = decodeURIComponent(raw).replace(/[()]/g, '').trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

function toClientPost(row: Record<string, unknown>): ClientApprovalPost {
  const mediaUrl = readString(row.image_url);
  const rawType = readString(row.media_type).toLowerCase();
  const isVideo = rawType === 'video' || rawType === 'reel' || /\.(mp4|mov|webm|m3u8)($|\?)/i.test(mediaUrl);
  const status = readString(row.approval_status) as ApprovalStatus;

  return {
    houseName: readString(row.house_name) || readString(row.title) || 'Casa',
    caption: readString(row.caption) || readString(row.content),
    mediaUrl,
    mediaType: isVideo ? 'video' : 'image',
    format: readString(row.platform),
    scheduledDate: readString(row.scheduled_date),
    scheduledTime: readString(row.time_string),
    approvalStatus: STATUSES.includes(status) ? status : 'pending',
    clientFeedback: readString(row.client_feedback),
  };
}

async function findPost(token: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('posts')
    .select(POST_COLUMNS)
    .eq('approval_token', token)
    .maybeSingle();
  return { supabase, row: data as Record<string, unknown> | null, error };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const token = cleanToken((await params).token);
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const { supabase, row, error } = await findPost(token);
  if (error) {
    console.error('Falha ao buscar post para aprovação:', error.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const views = (typeof row.views_count === 'number' ? row.views_count : 0) + 1;
  const { error: viewError } = await supabase.from('posts').update({ views_count: views }).eq('id', row.id);
  if (viewError) console.warn('Não foi possível registrar a visualização:', viewError.message);

  return NextResponse.json({ post: toClientPost(row) }, { headers: noStore });
}

export async function POST(request: Request, { params }: RouteParams) {
  const token = cleanToken((await params).token);
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: noStore });
  }

  const decision = (body as { decision?: unknown })?.decision;
  const rawFeedback = (body as { feedback?: unknown })?.feedback;
  const feedback = typeof rawFeedback === 'string' ? rawFeedback.trim() : '';

  if (!DECISIONS.includes(decision as ApprovalDecision)) {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400, headers: noStore });
  }
  if (feedback.length > MAX_FEEDBACK_LENGTH) {
    return NextResponse.json({ error: 'feedback_too_long' }, { status: 400, headers: noStore });
  }
  if (decision === 'changes_requested' && !feedback) {
    return NextResponse.json({ error: 'feedback_required' }, { status: 400, headers: noStore });
  }

  const { supabase, row, error } = await findPost(token);
  if (error) {
    console.error('Falha ao buscar post para aprovação:', error.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  // Só aceita resposta enquanto o post está pendente (a condição vai no próprio UPDATE).
  const { data: updated, error: updateError } = await supabase
    .from('posts')
    .update({ approval_status: decision, client_feedback: feedback })
    .eq('id', row.id)
    .eq('approval_status', 'pending')
    .select(POST_COLUMNS)
    .maybeSingle();

  if (updateError) {
    console.error('Falha ao registrar resposta de aprovação:', updateError.message);
    return NextResponse.json({ error: 'update_failed' }, { status: 500, headers: noStore });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'already_answered', post: toClientPost(row) },
      { status: 409, headers: noStore },
    );
  }

  return NextResponse.json({ post: toClientPost(updated as Record<string, unknown>) }, { headers: noStore });
}
