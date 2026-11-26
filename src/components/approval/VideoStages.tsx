'use client';

import { Check, Clock, PenLine, RotateCw, Upload, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { GROUPS, timelineEvents, type ApprovalGroup, type ApprovalStage, type TimelineVersion } from '@/lib/videoApproval';

// Peças da Aprovação vídeos por etapas: cores, linha do tempo do topo e linha do tempo de cada vídeo.

export const STAGE_TONE: Record<ApprovalStage, { dot: string; text: string; soft: string; icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }> = {
  aguardando: { dot: 'bg-status-info', text: 'text-status-info', soft: 'bg-status-info-soft', icon: Clock },
  alteracao: { dot: 'bg-status-warning', text: 'text-status-warning', soft: 'bg-status-warning-soft', icon: PenLine },
  reenviado: { dot: 'bg-violet-600', text: 'text-violet-700', soft: 'bg-violet-50', icon: RotateCw },
  aprovado: { dot: 'bg-status-success', text: 'text-status-success', soft: 'bg-status-success-soft', icon: Check },
  reprovado: { dot: 'bg-status-danger', text: 'text-status-danger', soft: 'bg-status-danger-soft', icon: X },
};

/** Cores dos três grupos da fila. */
export const GROUP_TONE: Record<ApprovalGroup, (typeof STAGE_TONE)[ApprovalStage]> = {
  aguardando: STAGE_TONE.aguardando,
  ajuste: STAGE_TONE.alteracao,
  aprovado: STAGE_TONE.aprovado,
};

/** Topo da aba: os três grupos com a contagem; tocar abre só aquele grupo da fila. */
export function StageTimeline({ counts, active, onPick }: { counts: Record<ApprovalGroup, number>; active: ApprovalGroup | null; onPick: (group: ApprovalGroup) => void }) {
  return (
    <section aria-label="Grupos da aprovação" className="vidro rounded-panel p-3 sm:p-4">
      <p className="mb-2.5 px-1 text-xs font-semibold text-ink-muted">Onde está cada vídeo · toque num grupo para abrir</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
        {GROUPS.map((group) => {
          const tone = GROUP_TONE[group.id];
          const Icon = tone.icon;
          const on = active === group.id;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onPick(group.id)}
              aria-pressed={on}
              className={`flex min-h-14 items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                on ? 'bg-accent/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]' : 'hover:bg-surface-muted/80'
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${tone.dot}`}>
                <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-tight text-ink">{group.label}</span>
                <span className="block truncate text-[11px] text-ink-muted">{group.hint}</span>
              </span>
              <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-muted">{counts[group.id]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 px-1 text-[11.5px] text-ink-muted">
        <RotateCw size={12} aria-hidden="true" className="text-status-warning" />
        Ajuste → a equipe envia nova versão → volta para Aguardando aprovação
      </p>
    </section>
  );
}

/** Barrinhas com o caminho do vídeo (uma por passo). */
export function StagePathBars({ path, label }: { path: ApprovalStage[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="mt-1.5 flex gap-0.5">
      {path.map((stage, index) => (
        <span key={index} className={`h-[3px] w-3.5 rounded-full ${STAGE_TONE[stage].dot}`} />
      ))}
    </span>
  );
}

const longDate = (iso: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às') : '';

const EVENT_TITLE = {
  enviado: (version: number) => (version === 1 ? 'V1 enviada para aprovação' : `V${version} reenviada com as alterações`),
  aprovado: 'Thereza aprovou',
  alteracao: 'Thereza pediu alterações',
  reprovado: 'Thereza reprovou',
};

/** Linha do tempo de um vídeo: envios, respostas (com o comentário) e a espera atual. */
export function VideoTimeline({ versions }: { versions: TimelineVersion[] }) {
  const events = timelineEvents(versions);
  if (events.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-[13px] font-semibold text-ink-muted">Linha do tempo deste vídeo</h4>
      <ol className="cartao rounded-panel px-3 py-1">
        {events.map((event, index) => {
          const tone = STAGE_TONE[event.stage];
          const Icon = event.kind === 'enviado' || event.kind === 'reaberto' ? Upload : tone.icon;
          const last = index === events.length - 1;
          return (
            <li key={`${event.kind}-${event.version}-${index}`} className="relative grid grid-cols-[1.25rem_1fr] gap-2.5 py-2.5">
              {!last && <span aria-hidden="true" className="absolute bottom-[-4px] left-[9px] top-8 w-[1.5px] bg-border" />}
              {event.kind === 'esperando' ? (
                <span aria-hidden="true" className="mt-0.5 h-5 w-5 rounded-full border-[1.5px] border-dashed border-ink-muted/60" />
              ) : (
                <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white ${tone.dot}`}>
                  <Icon size={11} strokeWidth={2.8} />
                </span>
              )}
              <div className="min-w-0 text-xs">
                <p className={`text-[13px] font-semibold ${event.kind === 'esperando' ? 'text-ink-muted' : 'text-ink'}`}>
                  {event.kind === 'esperando'
                    ? 'Aguardando a resposta da Thereza'
                    : event.kind === 'reaberto'
                      ? 'Voltou para aguardando aprovação'
                    : event.kind === 'enviado'
                      ? EVENT_TITLE.enviado(event.version)
                      : EVENT_TITLE[event.stage as 'aprovado' | 'alteracao' | 'reprovado']}
                </p>
                {event.at && (
                  <p className="mt-0.5 text-ink-muted">
                    {longDate(event.at)}
                    {event.by ? ` · ${event.by}` : ''}
                    {event.kind === 'enviado' && event.text ? ` · “${event.text}”` : ''}
                  </p>
                )}
                {event.kind === 'resposta' && event.text && (
                  <p className={`mt-1.5 whitespace-pre-line rounded-control px-2.5 py-2 text-[12.5px] text-ink ${tone.soft}`}>{event.text}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
