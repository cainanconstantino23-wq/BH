import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type {
  ApprovalDecision,
  ApprovalStatus,
  ClientApprovalMessage,
  ClientApprovalPost,
  ClientApprovalVersion,
} from '@/components/approval/ClientApprovalView';
import { houseLabel } from '@/lib/house';

// Rota pública da página de aprovação. Usa a chave de serviço no servidor,
// então continua funcionando quando o acesso anônimo à tabela posts for fechado.
// Só expõe o post cujo approval_token confere e só os campos que o cliente vê.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DECISIONS: ApprovalDecision[] = ['approved', 'changes_requested', 'rejected'];
const STATUSES: ApprovalStatus[] = ['pending', ...DECISIONS];
const MAX_FEEDBACK_LENGTH = 2000;
const POST_COLUMNS =
  'id, house_name, house_number, title, caption, content, image_url, media_type, platform, scheduled_date, time_string, approval_status, client_feedback, views_count';

const noStore = { 'Cache-Control': 'private, no-store' };

type RouteParams = { params: Promise<{ token: string }> };

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function cleanToken(raw: string) {
  const token = decodeURIComponent(raw).replace(/[()]/g, '').trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

const VERSION_COLUMNS = 'version, media_url, media_type, caption, note, created_at, decision, feedback, responded_at, responded_by_label';
// Rótulo gravado pelo banco quando a resposta veio deste link (sem login).
const LINK_RESPONDER = 'Aprovador pelo link';

function mediaKind(url: string, type: string): 'image' | 'video' {
  const rawType = type.toLowerCase();
  return rawType === 'video' || rawType === 'reel' || /\.(mp4|mov|webm|m3u8)($|\?)/i.test(url) ? 'video' : 'image';
}

function toClientVersion(row: Record<string, unknown>): ClientApprovalVersion {
  const mediaUrl = readString(row.media_url);
  const decision = readString(row.decision) as ApprovalDecision;
  return {
    version: typeof row.version === 'number' ? row.version : 1,
    mediaUrl,
    mediaType: mediaKind(mediaUrl, readString(row.media_type)),
    caption: readString(row.caption),
    note: readString(row.note),
    createdAt: readString(row.created_at),
    decision: DECISIONS.includes(decision) ? decision : null,
    feedback: readString(row.feedback),
    respondedAt: readString(row.responded_at),
    // decisão marcada por alguém da equipe no painel (não pela aprovadora no link)
    decidedByTeam: DECISIONS.includes(decision) && Boolean(readString(row.responded_by_label)) && readString(row.responded_by_label) !== LINK_RESPONDER,
  };
}

function toClientMessage(row: Record<string, unknown>): ClientApprovalMessage {
  const team = row.author_kind === 'equipe';
  return {
    id: Number(row.id),
    from: team ? 'equipe' : 'aprovadora',
    author: team ? readString(row.author_label) || 'Equipe' : 'Você',
    text: readString(row.body),
    at: readString(row.created_at),
  };
}

function toClientPost(row: Record<string, unknown>, versionRows: Record<string, unknown>[], messageRows: Record<string, unknown>[] = []): ClientApprovalPost {
  const mediaUrl = readString(row.image_url);
  const status = readString(row.approval_status) as ApprovalStatus;
  const versions = versionRows.map(toClientVersion).sort((a, b) => a.version - b.version);

  return {
    houseName: houseLabel(readString(row.house_name), readString(row.house_number)) || readString(row.title) || 'Casa',
    caption: readString(row.caption) || readString(row.content),
    mediaUrl,
    mediaType: mediaKind(mediaUrl, readString(row.media_type)),
    format: readString(row.platform),
    scheduledDate: readString(row.scheduled_date),
    scheduledTime: readString(row.time_string),
    approvalStatus: STATUSES.includes(status) ? status : 'pending',
    clientFeedback: readString(row.client_feedback),
    currentVersion: versions.at(-1)?.version ?? 1,
    versions,
    messages: messageRows.map(toClientMessage),
  };
}

// Versões do post (V1, V2...). Se a tabela ainda não existir, o link continua funcionando só com a atual.
async function loadVersions(supabase: ReturnType<typeof createAdminClient>, postId: unknown) {
  const { data, error } = await supabase
    .from('post_versions')
    .select(VERSION_COLUMNS)
    .eq('post_id', postId)
    .order('version', { ascending: true });
  if (error) {
    console.warn('Não foi possível carregar as versões do post:', error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

// Conversa com a equipe (migração 20261126c). Sem a tabela, o link funciona sem o chat.
async function loadMessages(supabase: ReturnType<typeof createAdminClient>, postId: unknown) {
  const { data, error } = await supabase
    .from('post_messages')
    .select('id, author_kind, author_label, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('Não foi possível carregar as mensagens do post:', error.message);
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
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

export async function GET(request: Request, { params }: RouteParams) {
  const token = cleanToken((await params).token);
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const { supabase, row, error } = await findPost(token);
  if (error) {
    console.error('Falha ao buscar post para aprovação:', error.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
  }
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  // ?atualizar=1: a página aberta busca mensagens novas sem contar outro acesso
  if (!new URL(request.url).searchParams.has('atualizar')) {
    const views = (typeof row.views_count === 'number' ? row.views_count : 0) + 1;
    const { error: viewError } = await supabase.from('posts').update({ views_count: views }).eq('id', row.id);
    if (viewError) console.warn('Não foi possível registrar a visualização:', viewError.message);
  }

  const [versions, messages] = await Promise.all([loadVersions(supabase, row.id), loadMessages(supabase, row.id)]);
  return NextResponse.json({ post: toClientPost(row, versions, messages) }, { headers: noStore });
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

  // Mensagem da Thereza no chat (não muda o status)
  const rawMessage = (body as { message?: unknown })?.message;
  if (typeof rawMessage === 'string') {
    const text = rawMessage.trim();
    if (!text) return NextResponse.json({ error: 'message_empty' }, { status: 400, headers: noStore });
    if (text.length > MAX_FEEDBACK_LENGTH) return NextResponse.json({ error: 'feedback_too_long' }, { status: 400, headers: noStore });
    const found = await findPost(token);
    if (found.error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500, headers: noStore });
    if (!found.row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const versionsNow = await loadVersions(found.supabase, found.row.id);
    const { error: insertError } = await found.supabase.from('post_messages').insert({
      post_id: found.row.id,
      version: versionsNow.at(-1)?.version ?? 1,
      author_kind: 'aprovadora',
      author_label: 'Thereza (link de aprovação)',
      body: text,
    });
    if (insertError) {
      console.error('Falha ao gravar mensagem do link de aprovação:', insertError.message);
      return NextResponse.json({ error: 'message_failed' }, { status: 500, headers: noStore });
    }
    const messagesNow = await loadMessages(found.supabase, found.row.id);
    return NextResponse.json({ post: toClientPost(found.row, versionsNow, messagesNow) }, { headers: noStore });
  }

  const decision = (body as { decision?: unknown })?.decision;
  const rawFeedback = (body as { feedback?: unknown })?.feedback;
  const feedback = typeof rawFeedback === 'string' ? rawFeedback.trim() : '';
  const rawVersion = (body as { version?: unknown })?.version;
  const answeredVersion = typeof rawVersion === 'number' ? rawVersion : null;

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

  // Se a equipe enviou uma versão nova enquanto a página estava aberta, a resposta não vale para ela.
  const versionsBefore = await loadVersions(supabase, row.id);
  const latestVersion = versionsBefore.reduce((max, v) => Math.max(max, typeof v.version === 'number' ? v.version : 0), 0);
  if (answeredVersion !== null && latestVersion > 0 && answeredVersion !== latestVersion) {
    return NextResponse.json(
      { error: 'new_version', post: toClientPost(row, versionsBefore, await loadMessages(supabase, row.id)) },
      { status: 409, headers: noStore },
    );
  }

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
      { error: 'already_answered', post: toClientPost(row, versionsBefore, await loadMessages(supabase, row.id)) },
      { status: 409, headers: noStore },
    );
  }

  const [versionsAfter, messagesAfter] = await Promise.all([loadVersions(supabase, row.id), loadMessages(supabase, row.id)]);
  return NextResponse.json({ post: toClientPost(updated as Record<string, unknown>, versionsAfter, messagesAfter) }, { headers: noStore });
}
