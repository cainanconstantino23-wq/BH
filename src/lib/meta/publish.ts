import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { GRAPH_VERSION } from '@/lib/meta/graph';
import { getTeamConnection } from '@/lib/team-server';

// Publicação no Instagram pela API de conteúdo do Meta (permissão instagram_content_publish).
// Passos: cria o contêiner (foto, vídeo, carrossel ou story) → espera o Instagram processar → publica.
// Vídeo pode demorar: se não terminar dentro do tempo da função, fica "processing" com o contêiner salvo
// e a próxima chamada (botão ou agendador) continua de onde parou.

const API = `https://graph.facebook.com/${GRAPH_VERSION}`;
const WAIT_MS = 40_000;

export type PublishResult =
  | { status: 'published'; permalink: string | null }
  | { status: 'processing' }
  | { status: 'error'; message: string };

interface PostRow {
  id: number;
  platform: string | null;
  content: string | null;
  caption: string | null;
  image_url: string | null;
  media_type: string | null;
  media_items: unknown;
  approval_status: string | null;
  publish_status: string | null;
  publish_container_id: string | null;
}

export const POST_PUBLISH_COLUMNS =
  'id, platform, content, caption, image_url, media_type, media_items, approval_status, publish_status, publish_container_id';

class PublishError extends Error {}

const isVideo = (url: string, type?: string | null) => type === 'video' || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);

/** Mensagens do Meta em português simples. */
function friendly(message: string, code?: number, subcode?: number) {
  if (code === 10 || code === 200 || /permission/i.test(message)) {
    return 'A conexão do Instagram não tem permissão para publicar. Libere "instagram_content_publish" no Meta e reconecte o Instagram em Conexões.';
  }
  if (subcode === 2207009 || /aspect ratio/i.test(message)) {
    return 'O Instagram recusou a proporção da imagem. Pela publicação automática vale de 4:5 a 1,91:1 (o 3:4 só pelo app). Corte em 4:5 e tente de novo.';
  }
  if (subcode === 2207026 || /video format|unsupported/i.test(message)) return 'O Instagram não aceitou o formato do vídeo. Use MP4 (H.264, AAC), até 15 min para Reels.';
  if (subcode === 2207004 || subcode === 2207052 || /download|fetch|media url/i.test(message)) {
    return 'O Instagram não conseguiu baixar a mídia. Confira se o arquivo é JPG (foto) ou MP4 (vídeo) e se o endereço é público.';
  }
  if (code === 4 || code === 9 || subcode === 2207042) return 'Limite de publicações do Instagram atingido (100 por dia). Tente mais tarde.';
  if (code === 190) return 'A conexão do Instagram expirou. Reconecte em Conexões.';
  return `O Instagram recusou a publicação: ${message}`;
}

async function call(path: string, token: string, params: Record<string, string>, method: 'GET' | 'POST' = 'POST') {
  const url = new URL(`${API}${path}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  const response =
    method === 'GET'
      ? await fetch(`${url}?${body}`, { cache: 'no-store' })
      : await fetch(url, { method: 'POST', body, cache: 'no-store' });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string };
  };
  if (!response.ok || data.error) {
    const error = data.error ?? {};
    throw new PublishError(friendly(error.error_user_msg || error.message || `HTTP ${response.status}`, error.code, error.error_subcode));
  }
  return data;
}

function mediaList(post: PostRow) {
  const items = Array.isArray(post.media_items)
    ? (post.media_items as { url?: unknown; type?: unknown }[])
        .filter((item) => typeof item?.url === 'string' && item.url)
        .map((item) => ({ url: String(item.url), type: typeof item.type === 'string' ? item.type : null }))
    : [];
  if (items.length) return items;
  return post.image_url ? [{ url: post.image_url, type: post.media_type }] : [];
}

/** Cria o contêiner principal do post e devolve o id. */
async function createContainer(post: PostRow, igId: string, token: string) {
  const caption = (post.content || post.caption || '').slice(0, 2200);
  const media = mediaList(post);
  if (media.length === 0) throw new PublishError('O post não tem foto nem vídeo.');
  const format = (post.platform || 'POST').toUpperCase();
  const first = media[0];

  if (format === 'STORY') {
    const params: Record<string, string> = isVideo(first.url, first.type) ? { media_type: 'STORIES', video_url: first.url } : { media_type: 'STORIES', image_url: first.url };
    return String((await call(`/${igId}/media`, token, params)).id);
  }

  if (media.length > 1 || format === 'CARROSSEL') {
    if (media.length < 2) throw new PublishError('Carrossel precisa de pelo menos 2 mídias.');
    const children: string[] = [];
    for (const item of media.slice(0, 20)) {
      const params: Record<string, string> = isVideo(item.url, item.type)
        ? { is_carousel_item: 'true', media_type: 'VIDEO', video_url: item.url }
        : { is_carousel_item: 'true', image_url: item.url };
      children.push(String((await call(`/${igId}/media`, token, params)).id));
    }
    // vídeos dentro do carrossel precisam terminar de processar antes do contêiner do carrossel
    for (const child of children) await waitFinished(child, token, WAIT_MS / 2);
    return String((await call(`/${igId}/media`, token, { media_type: 'CAROUSEL', children: children.join(','), caption })).id);
  }

  if (isVideo(first.url, first.type)) {
    return String((await call(`/${igId}/media`, token, { media_type: 'REELS', video_url: first.url, caption, share_to_feed: 'true' })).id);
  }
  return String((await call(`/${igId}/media`, token, { image_url: first.url, caption })).id);
}

/** Espera o contêiner ficar pronto. true = pronto; false = ainda processando quando o tempo acabou. */
async function waitFinished(containerId: string, token: string, maxMs = WAIT_MS) {
  const started = Date.now();
  for (;;) {
    const data = await call(`/${containerId}`, token, { fields: 'status_code,status' }, 'GET');
    const status = String(data.status_code ?? '');
    if (status === 'FINISHED' || status === 'PUBLISHED') return true;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new PublishError(friendly(String(data.status ?? 'o Instagram não conseguiu processar a mídia')));
    }
    if (Date.now() - started > maxMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

/**
 * Publica (ou continua publicando) um post. Atualiza a linha em posts com o resultado.
 * Só posts aprovados; nunca publica duas vezes.
 */
export async function publishPost(admin: SupabaseClient, postId: number): Promise<PublishResult> {
  const { data: row, error } = await admin.from('posts').select(POST_PUBLISH_COLUMNS).eq('id', postId).maybeSingle();
  if (error || !row) return { status: 'error', message: 'Post não encontrado.' };
  const post = row as PostRow;
  if (post.publish_status === 'published') return { status: 'error', message: 'Este post já foi publicado.' };
  if (post.approval_status !== 'approved') return { status: 'error', message: 'Só posts aprovados podem ser publicados.' };

  const save = (changes: Record<string, unknown>) => admin.from('posts').update(changes).eq('id', postId);

  // trava simples contra duas publicações ao mesmo tempo (botão + agendador)
  const { data: locked } = await admin
    .from('posts')
    .update({ publish_status: 'processing', publish_attempted_at: new Date().toISOString(), publish_error: null })
    .eq('id', postId)
    .or(`publish_status.is.null,publish_status.eq.error,and(publish_status.eq.processing,publish_attempted_at.lt.${new Date(Date.now() - 60_000).toISOString()})`)
    .select('id');
  if (!locked?.length) return { status: 'processing' };

  try {
    const { data: connection } = await getTeamConnection(admin, 'access_token, instagram_account_id');
    const token = typeof connection?.access_token === 'string' ? connection.access_token : '';
    const igId = typeof connection?.instagram_account_id === 'string' ? connection.instagram_account_id : '';
    if (!token || !igId) throw new PublishError('O Instagram não está conectado. Conecte em Conexões.');

    const containerId = post.publish_container_id || (await createContainer(post, igId, token));
    if (!post.publish_container_id) await save({ publish_container_id: containerId });

    if (!(await waitFinished(containerId, token))) {
      await save({ publish_status: 'processing' });
      return { status: 'processing' };
    }

    const published = await call(`/${igId}/media_publish`, token, { creation_id: containerId });
    const mediaId = String(published.id);
    let permalink: string | null = null;
    try {
      permalink = String((await call(`/${mediaId}`, token, { fields: 'permalink' }, 'GET')).permalink ?? '') || null;
    } catch {
      // o post já saiu; o link é só um extra
    }
    await save({
      publish_status: 'published',
      published_at: new Date().toISOString(),
      ig_media_id: mediaId,
      ig_permalink: permalink,
      publish_error: null,
      publish_container_id: null,
      auto_publish: false,
    });
    return { status: 'published', permalink };
  } catch (publishError) {
    const message = publishError instanceof PublishError ? publishError.message : 'Falha inesperada ao publicar. Tente de novo.';
    if (!(publishError instanceof PublishError)) console.error('Falha ao publicar no Instagram:', publishError);
    // contêiner com erro não serve mais: a próxima tentativa cria outro
    await save({ publish_status: 'error', publish_error: message, publish_container_id: null });
    return { status: 'error', message };
  }
}

/** Data e hora agendadas do post, no horário da Bahia (UTC-3, sem horário de verão). */
export function scheduledInstant(date: string, hour: number | null, timeString: string | null) {
  const match = timeString?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  let h = hour ?? 19;
  let m = 0;
  if (match) {
    h = Number(match[1]);
    m = Number(match[2]);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
  }
  return new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);
}
