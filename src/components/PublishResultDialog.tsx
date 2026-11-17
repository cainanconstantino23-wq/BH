'use client';

import { CalendarCheck, Check, Clock3, Loader2 } from 'lucide-react';
import { OnScreen } from '@/components/drive/OnScreen';

/** Andamento e resultado da publicação no Instagram, no centro da tela. */
export type PublishResult =
  | { state: 'working'; text: string }
  | { state: 'done'; permalink: string | null }
  | { state: 'processing' }
  | { state: 'error'; text: string }
  | { state: 'scheduled'; scheduledDate: string; hour: number; autoPublish: boolean; approved?: boolean }
  | { state: 'unscheduled'; text?: string };

/** Cancela o agendamento (PATCH cancel) e devolve o resultado para o aviso. */
export async function cancelScheduledPublish(postId: number | string): Promise<PublishResult> {
  try {
    const response = await fetch('/api/instagram/publish', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, cancel: true }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!response.ok || !result.ok) return { state: 'error', text: result.message ?? 'Não foi possível cancelar o agendamento.' };
    return {
      state: 'unscheduled',
      text: 'Não vai mais ser publicado sozinho no Instagram. Continua aprovado e planejado na mesma data na Grade do feed; agende de novo quando quiser.',
    };
  } catch {
    return { state: 'error', text: 'Sem conexão com o servidor. Tente de novo.' };
  }
}

/** POST /api/instagram/publish e devolve o resultado para o aviso. */
export async function publishToInstagram(postId: number | string): Promise<PublishResult> {
  try {
    const response = await fetch('/api/instagram/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    });
    const result = (await response.json().catch(() => ({}))) as { status?: string; message?: string; permalink?: string | null };
    if (result.status === 'published') return { state: 'done', permalink: result.permalink ?? null };
    if (result.status === 'processing') return { state: 'processing' };
    return { state: 'error', text: result.message ?? 'Não foi possível publicar.' };
  } catch {
    return { state: 'error', text: 'Sem conexão com o servidor. O post ficou salvo; tente publicar de novo.' };
  }
}

export function PublishResultDialog({
  result,
  label,
  onClose,
  onOpenCalendar,
  inline = false,
}: {
  result: PublishResult;
  /** Casa do post (aparece no resumo do agendamento). */
  label?: string;
  onClose: () => void;
  onOpenCalendar?: () => void;
  /** Dentro de um <dialog> aberto com showModal (ex.: prévia da Grade do feed): sem portal, senão fica atrás. */
  inline?: boolean;
}) {
  const content = (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${result.state === 'working' ? 'bg-ink/40' : 'bg-ink/30'}`}>
        <div role="status" aria-live="assertive" className="toast-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-panel bg-surface px-7 py-6 text-center shadow-2xl">
          {result.state === 'working' && (
            <>
              <Loader2 size={30} className="animate-spin text-brand-plum motion-reduce:animate-none" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">{result.text}</p>
              <p className="text-xs text-ink-muted">Não feche esta página.</p>
            </>
          )}
          {result.state === 'done' && (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-success text-white"><Check size={26} strokeWidth={3} aria-hidden="true" /></span>
              <p className="text-base font-semibold text-ink">Publicado no Instagram</p>
              {result.permalink && (
                <a href={result.permalink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-plum underline underline-offset-2">Ver o post</a>
              )}
            </>
          )}
          {result.state === 'processing' && (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-soft text-status-warning"><Clock3 size={24} aria-hidden="true" /></span>
              <p className="text-base font-semibold text-ink">Enviado ao Instagram</p>
              <p className="text-sm leading-relaxed text-ink-muted">O Instagram está processando o vídeo. A publicação termina sozinha em alguns minutos; o post fica marcado como &ldquo;No ar&rdquo; na Grade do feed.</p>
            </>
          )}
          {result.state === 'scheduled' && (() => {
            const [year, month, day] = result.scheduledDate.split('-');
            const when = `${day}/${month}/${year} às ${String(result.hour).padStart(2, '0')}:00`;
            return (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-success text-white"><CalendarCheck size={24} aria-hidden="true" /></span>
                <p className="text-base font-semibold text-ink">Post agendado</p>
                <dl className="w-full space-y-1.5 rounded-control bg-canvas px-4 py-3 text-left text-sm">
                  {label && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Casa</dt><dd className="text-right font-medium text-ink">{label}</dd></div>}
                  <div className="flex justify-between gap-3"><dt className="text-ink-muted">Data</dt><dd className="font-medium tabular-nums text-ink">{when}</dd></div>
                  {result.approved !== undefined && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-muted">Aprovação</dt>
                      <dd className={`font-medium ${result.approved ? 'text-status-success' : 'text-status-warning'}`}>{result.approved ? 'Aprovado' : 'Pendente'}</dd>
                    </div>
                  )}
                </dl>
                <p className={`w-full rounded-control px-4 py-2.5 text-left text-xs leading-relaxed ${result.autoPublish ? 'bg-status-success-soft text-status-success' : 'bg-status-warning-soft text-status-warning'}`}>
                  {result.autoPublish
                    ? `Vai ser publicado sozinho no Instagram em ${when}.`
                    : 'Ficou no calendário, mas você não tem a permissão "Publicar no Instagram". Peça a quem tem essa permissão para agendar ou publicar.'}
                </p>
                {onOpenCalendar && (
                  <button type="button" onClick={() => { onClose(); onOpenCalendar(); }} className="text-sm font-semibold text-brand-plum underline underline-offset-2">
                    Ver no Calendário de posts
                  </button>
                )}
              </>
            );
          })()}
          {result.state === 'unscheduled' && (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-soft text-status-warning"><Clock3 size={24} aria-hidden="true" /></span>
              <p className="text-base font-semibold text-ink">Agendamento cancelado</p>
              <p className="text-sm leading-relaxed text-ink-muted">{result.text ?? 'Não vai mais ser publicado sozinho no Instagram. O post continua no calendário.'}</p>
            </>
          )}
          {result.state === 'error' && (
            <>
              <p className="text-base font-semibold text-ink">Não foi possível publicar</p>
              <p className="text-sm leading-relaxed text-ink-muted">{result.text}</p>
            </>
          )}
          {result.state !== 'working' && (
            <button type="button" autoFocus onClick={onClose} className="mt-1 min-h-10 rounded-control bg-brand-plum px-5 text-sm font-semibold text-white hover:bg-brand-plum-hover">
              OK
            </button>
          )}
        </div>
      </div>
  );
  return inline ? content : <OnScreen>{content}</OnScreen>;
}
