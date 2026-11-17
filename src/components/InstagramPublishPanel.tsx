'use client';

import { useRef, useState } from 'react';
import { CalendarCheck, RefreshCw, Send, XCircle } from 'lucide-react';
import { PublishResultDialog, cancelScheduledPublish, publishToInstagram, type PublishResult } from '@/components/PublishResultDialog';

export interface PublishablePost {
  id: number | string;
  approvalStatus: string;
  autoPublish: boolean;
  publishStatus: '' | 'processing' | 'published' | 'error';
  publishError: string;
  permalink: string;
  scheduledDate: string; // AAAA-MM-DD
  timeString: string;
}

const formatLongDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return 'Data não definida';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));
};

/**
 * Publicar no Instagram: agora ou sozinho no horário agendado. Só posts aprovados.
 * Usado na prévia da Grade do feed e na Aprovação vídeos (vídeos aprovados).
 * Use key={post.id} para reiniciar o estado ao trocar de post.
 */
export function InstagramPublishPanel({
  post,
  canPublish,
  onChanged,
  className = 'mt-auto space-y-2 border-t border-border px-4 py-3',
  inlineDialog = false,
}: {
  post: PublishablePost;
  canPublish: boolean;
  onChanged: () => void;
  className?: string;
  /** O painel está dentro de um <dialog> modal: o aviso abre ali dentro. */
  inlineDialog?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [auto, setAuto] = useState(post.autoPublish);
  // aviso no centro da tela: publicando, publicado, agendado…
  const [result, setResult] = useState<PublishResult | null>(null);
  const refreshOnClose = useRef(false);

  const approved = post.approvalStatus === 'approved';
  const published = post.publishStatus === 'published';

  const publishNow = async () => {
    if (!window.confirm('Publicar este post agora no Instagram? Depois de publicado, só dá para apagar pelo app do Instagram.')) return;
    setBusy(true);
    setMessage(null);
    setResult({ state: 'working', text: 'Publicando no Instagram… vídeos podem levar alguns minutos.' });
    setResult(await publishToInstagram(post.id));
    setBusy(false);
    onChanged();
  };

  // Agendar = autorizar a publicação sozinha no horário do post.
  const schedule = async () => {
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/instagram/publish', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id, auto: true }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setMessage({ tone: 'error', text: 'Não foi possível agendar. Tente de novo.' });
      return;
    }
    setAuto(true);
    const [h] = post.timeString.split(':').map(Number);
    setResult({ state: 'scheduled', scheduledDate: post.scheduledDate, hour: Number.isFinite(h) ? h : 19, autoPublish: true });
    onChanged();
  };

  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Send size={13} aria-hidden="true" /> Instagram</p>

      {published ? (
        <p className="text-xs text-status-success">
          Publicado.{' '}
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Ver no Instagram</a>
          )}
        </p>
      ) : !approved ? (
        <p className="text-xs text-ink-muted">Só posts aprovados podem ser publicados.</p>
      ) : !canPublish ? (
        <p className="text-xs text-ink-muted">Você não tem a permissão &ldquo;Publicar no Instagram&rdquo;.</p>
      ) : (
        <>
          {post.publishStatus === 'error' && post.publishError && !message && (
            <p className="text-xs text-status-danger">Última tentativa: {post.publishError}</p>
          )}
          {post.publishStatus === 'processing' && !message && (
            <p className="text-xs text-ink-muted">Publicação em andamento (o Instagram está processando a mídia).</p>
          )}
          {auto ? (
            <p className="rounded-control bg-status-success-soft px-3 py-2 text-xs font-medium text-status-success">
              Agendado: vai para o Instagram em {formatLongDay(post.scheduledDate)}, {post.timeString}.
            </p>
          ) : post.publishStatus !== 'processing' && (
            <button
              type="button"
              onClick={() => void schedule()}
              disabled={busy}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-border bg-surface px-4 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
            >
              <CalendarCheck size={14} aria-hidden="true" /> Agendar para {formatLongDay(post.scheduledDate)}, {post.timeString}
            </button>
          )}
          <button
            type="button"
            onClick={() => void publishNow()}
            disabled={busy}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-60"
          >
            {busy ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
            {busy ? 'Publicando…' : post.publishStatus === 'processing' ? 'Concluir publicação' : 'Publicar agora'}
          </button>
          {auto && post.publishStatus !== 'processing' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Cancelar o agendamento? Não vai mais ser publicado sozinho no Instagram.')) return;
                void (async () => {
                  setBusy(true);
                  setResult({ state: 'working', text: 'Cancelando o agendamento…' });
                  const outcome = await cancelScheduledPublish(post.id);
                  if (outcome.state === 'unscheduled') setAuto(false);
                  setResult(outcome);
                  setBusy(false);
                  // atualiza a grade só ao fechar o aviso: um vídeo cancelado sai da grade e fecharia a prévia junto
                  refreshOnClose.current = true;
                })();
              }}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-status-danger-border px-4 text-xs font-semibold text-status-danger hover:bg-status-danger-soft disabled:opacity-60"
            >
              <XCircle size={14} aria-hidden="true" /> Cancelar agendamento
            </button>
          )}
        </>
      )}

      {result && (
        <PublishResultDialog
          inline={inlineDialog}
          result={result}
          onClose={() => {
            setResult(null);
            if (refreshOnClose.current) {
              refreshOnClose.current = false;
              onChanged();
            }
          }}
        />
      )}

      {message && (
        <p role="status" className={`text-xs ${message.tone === 'ok' ? 'text-status-success' : message.tone === 'error' ? 'text-status-danger' : 'text-ink-muted'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
