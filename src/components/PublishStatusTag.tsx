import { CalendarCheck, CircleDashed, Loader2, Send, TriangleAlert } from 'lucide-react';

/** Situação da publicação no Instagram, para as filas de aprovação (vídeos e fotos). */
export type PublishState = 'published' | 'processing' | 'scheduled' | 'error' | 'none';

export function publishStateOf(post: { publishStatus?: string | null; autoPublish?: boolean; scheduledDate?: string | null }): PublishState {
  if (post.publishStatus === 'published') return 'published';
  if (post.publishStatus === 'processing') return 'processing';
  if (post.autoPublish && post.scheduledDate) return 'scheduled';
  if (post.publishStatus === 'error') return 'error';
  return 'none';
}

const when = (date?: string | null, hour?: number | null) => {
  if (!date) return '';
  const [, month, day] = date.split('-');
  return `${day}/${month}${typeof hour === 'number' ? ` ${String(hour).padStart(2, '0')}h` : ''}`;
};

export function PublishStatusTag({ state, date, hour, noneLabel = 'Não publicado' }: { state: PublishState; date?: string | null; hour?: number | null; noneLabel?: string }) {
  const config = {
    published: { icon: Send, text: 'Publicado', cls: 'bg-status-success text-white' },
    processing: { icon: Loader2, text: 'Publicando…', cls: 'bg-status-warning-soft text-status-warning' },
    scheduled: { icon: CalendarCheck, text: `Agendado ${when(date, hour)}`.trim(), cls: 'bg-accent text-white' },
    error: { icon: TriangleAlert, text: 'Erro ao publicar', cls: 'bg-status-danger-soft text-status-danger' },
    none: { icon: CircleDashed, text: noneLabel, cls: 'bg-surface-muted text-ink-muted' },
  }[state];
  const Icon = config.icon;
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${config.cls}`}>
      <Icon size={11} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{config.text}</span>
    </span>
  );
}
