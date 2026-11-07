'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Film,
  GripVertical,
  Layers,
  LayoutGrid,
  MessageSquareWarning,
  RefreshCw,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { MediaPreview } from '@/components/MediaPreview';
import { isVideoMedia } from '@/lib/media';

type FeedStatusFilter = 'all' | 'pending' | 'approved';

interface ScheduledTile {
  kind: 'scheduled';
  id: number | string;
  title: string;
  caption: string;
  imageUrl: string;
  mediaType: string;
  format: string;
  scheduledDate: string;
  timeString: string;
  hour: number;
  approvalStatus: string;
}

interface PublishedTile {
  kind: 'published';
  id: string;
  imageUrl: string;
  mediaType: string;
  productType: string;
  publishedAt: string;
  permalink: string;
}

type Slot = Pick<ScheduledTile, 'scheduledDate' | 'hour' | 'timeString'>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DRAG_THRESHOLD_PX = 6;

const formatDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(year, month - 1, day));
};

const formatLongDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));
};

const mondayIndex = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
};

const normalizeTime = (timeString: string | null | undefined, hour: number) => {
  const match = timeString?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return `${String(hour).padStart(2, '0')}:00`;
  let h = Number(match[1]);
  if (match[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
  if (match[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${match[2]}`;
};

const APPROVAL = {
  approved: { label: 'Aprovado', icon: CheckCircle2, tone: 'text-status-success' },
  pending: { label: 'Aguardando aprovação', icon: Clock3, tone: 'text-status-warning' },
  changes_requested: { label: 'Ajustes solicitados', icon: MessageSquareWarning, tone: 'text-status-warning' },
  rejected: { label: 'Reprovado', icon: XCircle, tone: 'text-status-danger' },
} as const;

const approvalOf = (status: string) =>
  APPROVAL[status as keyof typeof APPROVAL] ?? { label: 'Não enviado para aprovação', icon: Clock3, tone: 'text-ink-muted' };

const slotOf = (post: ScheduledTile): Slot => ({ scheduledDate: post.scheduledDate, hour: post.hour, timeString: post.timeString });

/** Mais recente primeiro, como no perfil do Instagram. */
const byNewest = (a: ScheduledTile, b: ScheduledTile) =>
  b.scheduledDate.localeCompare(a.scheduledDate) || b.timeString.localeCompare(a.timeString);

function InstagramFeedPreview() {
  const [posts, setPosts] = useState<ScheduledTile[]>([]);
  const [published, setPublished] = useState<PublishedTile[]>([]);
  const [username, setUsername] = useState('');
  const [filter, setFilter] = useState<FeedStatusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [selectedId, setSelectedId] = useState<ScheduledTile['id'] | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: [ScheduledTile['id'], ScheduledTile['id']] } | null>(null);
  const [drag, setDrag] = useState<{ id: ScheduledTile['id']; x: number; y: number; overId: ScheduledTile['id'] | null } | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const pressRef = useRef<{ id: ScheduledTile['id']; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const postsRef = useRef<ScheduledTile[]>([]);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, content, caption, image_url, media_type, platform, scheduled_date, time_string, hour, approval_status')
      .not('scheduled_date', 'is', null);
    if (error) throw error;

    return (data ?? []).map(
      (row): ScheduledTile => ({
        kind: 'scheduled',
        id: row.id,
        title: row.title || 'Publicação',
        caption: row.content || row.caption || '',
        imageUrl: row.image_url || '',
        mediaType: row.media_type || '',
        format: row.platform || 'POST',
        scheduledDate: row.scheduled_date,
        hour: row.hour ?? 19,
        timeString: normalizeTime(row.time_string, row.hour ?? 19),
        approvalStatus: row.approval_status || '',
      }),
    );
  }, []);

  const loadPublished = useCallback(async () => {
    const { data } = await supabase
      .from('instagram_media')
      .select('id, media_type, media_product_type, thumbnail_url, media_url, published_at, permalink')
      .order('published_at', { ascending: false })
      .limit(15);
    return (data ?? []).map(
      (row): PublishedTile => ({
        kind: 'published',
        id: row.id,
        imageUrl: (row.media_type === 'VIDEO' ? row.thumbnail_url : row.media_url ?? row.thumbnail_url) ?? '',
        mediaType: 'image',
        productType: row.media_product_type ?? '',
        publishedAt: row.published_at ?? '',
        permalink: row.permalink ?? '',
      }),
    );
  }, []);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const [scheduled, live] = await Promise.all([loadPosts(), loadPublished()]);
    if (busyRef.current) return;
    setPosts(scheduled);
    setPublished(live);
  }, [loadPosts, loadPublished]);

  useEffect(() => {
    let active = true;
    const run = () =>
      refresh()
        .then(() => active && setErrorMessage(''))
        .catch((error: unknown) => {
          if (!active) return;
          console.error('Não foi possível carregar a grade do feed:', error);
          setErrorMessage('Não foi possível carregar as publicações. Tente atualizar.');
        })
        .finally(() => active && setIsLoading(false));

    void run();
    fetch('/api/instagram/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { connected?: boolean; username?: string } | null) => {
        if (active && status?.connected && status.username) setUsername(status.username);
      })
      .catch(() => undefined);

    const channel = supabase
      .channel('catalog-instagram-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => void run())
      .subscribe((status) => active && setIsLive(status === 'SUBSCRIBED'));

    const onVisible = () => document.visibilityState === 'visible' && void run();
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(onVisible, 15_000);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
      setErrorMessage('');
    } catch (error) {
      console.error('Não foi possível atualizar a grade do feed:', error);
      setErrorMessage('Não foi possível atualizar as publicações. Tente novamente.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const ordered = useMemo(() => [...posts].sort(byNewest), [posts]);
  const visible = useMemo(
    () =>
      ordered.filter((post) =>
        filter === 'approved'
          ? post.approvalStatus === 'approved'
          : filter === 'pending'
            ? post.approvalStatus === 'pending' || post.approvalStatus === 'changes_requested'
            : true,
      ),
    [ordered, filter],
  );
  const canReorder = filter === 'all';
  const selected = selectedId === null ? null : ordered.find((post) => post.id === selectedId) ?? null;

  // Troca data e horário entre duas publicações (as datas do calendário continuam as mesmas).
  const swap = useCallback(async (aId: ScheduledTile['id'], bId: ScheduledTile['id'], { isUndo = false } = {}) => {
    const current = postsRef.current;
    const a = current.find((post) => post.id === aId);
    const b = current.find((post) => post.id === bId);
    if (!a || !b || a.id === b.id || busyRef.current) return;

    busyRef.current = true;
    const slotA = slotOf(a);
    const slotB = slotOf(b);
    setPosts((list) =>
      list.map((post) => (post.id === a.id ? { ...post, ...slotB } : post.id === b.id ? { ...post, ...slotA } : post)),
    );

    const toRow = (slot: Slot) => ({
      scheduled_date: slot.scheduledDate,
      hour: slot.hour,
      time_string: slot.timeString,
      day_index: mondayIndex(slot.scheduledDate),
    });

    try {
      const first = await supabase.from('posts').update(toRow(slotB)).eq('id', a.id);
      if (first.error) throw first.error;
      const second = await supabase.from('posts').update(toRow(slotA)).eq('id', b.id);
      if (second.error) {
        await supabase.from('posts').update(toRow(slotA)).eq('id', a.id);
        throw second.error;
      }
      setNotice(
        isUndo
          ? { text: 'Troca desfeita.' }
          : {
              text: `“${a.title}” foi para ${formatDay(slotB.scheduledDate)} às ${slotB.timeString} e “${b.title}” para ${formatDay(slotA.scheduledDate)} às ${slotA.timeString}.`,
              undo: [a.id, b.id],
            },
      );
    } catch (error) {
      console.error('Não foi possível trocar as datas:', error);
      setPosts((list) =>
        list.map((post) => (post.id === a.id ? { ...post, ...slotA } : post.id === b.id ? { ...post, ...slotB } : post)),
      );
      setNotice({ text: 'Não foi possível trocar as datas. Nada foi alterado; tente de novo.' });
    } finally {
      busyRef.current = false;
    }
  }, []);

  /* ---------------- arrastar com o mouse ---------------- */

  const onTilePointerDown = (event: ReactPointerEvent, id: ScheduledTile['id']) => {
    if (!canReorder || event.button !== 0 || event.pointerType === 'touch') return;
    pressRef.current = { id, x: event.clientX, y: event.clientY };
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (!drag && moved < DRAG_THRESHOLD_PX) return;

      const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>(
        '[data-feed-slot]',
      );
      const overRaw = target?.dataset.feedSlot ?? null;
      const over = overRaw === null ? null : (postsRef.current.find((post) => String(post.id) === overRaw)?.id ?? null);
      setDrag({ id: press.id, x: event.clientX, y: event.clientY, overId: over === press.id ? null : over });

      // Rola a área quando o cursor chega perto das bordas.
      const area = scrollRef.current?.getBoundingClientRect();
      if (area) {
        if (event.clientY < area.top + 56) scrollRef.current?.scrollBy({ top: -14 });
        else if (event.clientY > area.bottom - 56) scrollRef.current?.scrollBy({ top: 14 });
      }
    };

    const onUp = () => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press || !drag) return;
      suppressClickRef.current = true;
      if (drag.overId !== null) void swap(press.id, drag.overId);
      setDrag(null);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag) {
        pressRef.current = null;
        suppressClickRef.current = true;
        setDrag(null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [drag, swap]);

  useEffect(() => {
    document.body.style.cursor = drag ? 'grabbing' : '';
    document.body.style.userSelect = drag ? 'none' : '';
  }, [drag]);

  /* ---------------- prévia ampliada ---------------- */

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    else if (!selected && dialog.open) dialog.close();
  }, [selected]);

  const selectedIndex = selected ? ordered.findIndex((post) => post.id === selected.id) : -1;
  // Na grade, "anterior" é a publicação que sai antes (fica depois na ordem do perfil).
  const earlier = selectedIndex >= 0 ? ordered[selectedIndex + 1] : undefined;
  const later = selectedIndex >= 0 ? ordered[selectedIndex - 1] : undefined;

  const draggedPost = drag ? ordered.find((post) => post.id === drag.id) : undefined;
  const showPublished = filter === 'all';

  return (
    <section ref={scrollRef} aria-labelledby="feed-preview-title" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h3 id="feed-preview-title" className="text-lg font-semibold tracking-tight text-ink">
              {username ? `@${username}` : 'Prévia do perfil'}
            </h3>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">
              {canReorder
                ? 'Arraste uma publicação agendada sobre outra para trocar a data e o horário das duas. A mais recente aparece primeiro, como no perfil.'
                : 'Para reorganizar, volte ao filtro Todas.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`flex min-h-10 items-center gap-2 px-2 text-[11px] font-medium ${isLive ? 'text-status-success' : 'text-ink-muted'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-status-success' : 'bg-ink-muted/50'}`} aria-hidden="true" />
              {isLive ? 'Ao vivo' : 'Atualiza a cada 15 s'}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              aria-label="Atualizar publicações"
              className="flex min-h-10 min-w-10 items-center justify-center rounded-control border border-border bg-surface text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-2.5">
          <div className="flex rounded-control bg-surface-muted p-1" role="group" aria-label="Filtrar por aprovação">
            {(
              [
                ['all', 'Todas'],
                ['pending', 'Pendentes'],
                ['approved', 'Aprovadas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
                  filter === value ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs tabular-nums text-ink-muted" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'agendada' : 'agendadas'}
            {showPublished && published.length ? `, ${published.length} publicadas` : ''}
          </p>
        </div>

        {notice && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 text-xs text-ink">
            <p className="min-w-0">{notice.text}</p>
            <div className="flex shrink-0 items-center gap-1">
              {notice.undo && (
                <button
                  type="button"
                  onClick={() => notice.undo && void swap(notice.undo[0], notice.undo[1], { isUndo: true })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 font-semibold text-brand-plum hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                >
                  <Undo2 size={14} aria-hidden="true" /> Desfazer
                </button>
              )}
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() => setNotice(null)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-status-danger-border bg-status-danger-soft px-4 py-3 text-xs text-status-danger">
            <p>{errorMessage}</p>
            <button type="button" onClick={handleRefresh} className="min-h-9 font-semibold underline underline-offset-2">
              Tentar de novo
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-3 gap-0.5" aria-label="Carregando publicações">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="aspect-[3/4] bg-surface-muted" />
            ))}
          </div>
        ) : visible.length === 0 && (!showPublished || published.length === 0) ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-panel border border-dashed border-border-strong bg-surface px-6 text-center">
            <LayoutGrid size={22} className="text-ink-muted" aria-hidden="true" />
            <h4 className="mt-3 text-sm font-semibold text-ink">
              {filter === 'all' ? 'Nenhuma publicação agendada' : `Nenhuma publicação ${filter === 'approved' ? 'aprovada' : 'pendente'}`}
            </h4>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
              Agende publicações em Programar Post para ver aqui como o perfil vai ficar.
            </p>
          </div>
        ) : (
          <ol className="grid grid-cols-3 gap-0.5" aria-label="Grade do perfil, da publicação mais recente para a mais antiga">
            {visible.map((post) => {
              const approval = approvalOf(post.approvalStatus);
              const ApprovalIcon = approval.icon;
              const isDragged = drag?.id === post.id;
              const isTarget = drag?.overId === post.id;
              return (
                <li key={post.id} data-feed-slot={String(post.id)} className="relative">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`${post.title}, ${formatDay(post.scheduledDate)} às ${post.timeString}, ${approval.label}. Abrir prévia.`}
                    onPointerDown={(event) => onTilePointerDown(event, post.id)}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      setSelectedId(post.id);
                    }}
                    className={`group relative block aspect-[3/4] w-full overflow-hidden bg-surface-muted text-left transition-[opacity,filter] duration-150 ease-out focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
                      canReorder ? 'cursor-grab active:cursor-grabbing' : ''
                    } ${isDragged ? 'opacity-35' : ''}`}
                  >
                    <MediaPreview key={post.imageUrl} src={post.imageUrl} mediaType={post.mediaType} alt="" muted loop className="pointer-events-none h-full w-full object-cover" />

                    <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1">
                      {isVideoMedia(post.imageUrl, post.mediaType) && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                          <Film size={12} aria-hidden="true" />
                        </span>
                      )}
                      <span title={approval.label} className={`flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 ${approval.tone}`}>
                        <ApprovalIcon size={13} aria-hidden="true" />
                      </span>
                    </span>

                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white sm:text-[11px]">
                      {formatDay(post.scheduledDate)} {post.timeString}
                    </span>

                    {canReorder && (
                      <span className="pointer-events-none absolute left-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:flex">
                        <GripVertical size={13} aria-hidden="true" />
                      </span>
                    )}
                  </button>

                  {isTarget && (
                    <span className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center bg-brand-plum/25 pb-3 outline outline-2 -outline-offset-2 outline-brand-plum">
                      <span className="rounded-md bg-brand-plum px-2 py-1 text-[11px] font-semibold text-white">
                        Trocar com {formatDay(post.scheduledDate)}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}

            {showPublished &&
              published.map((item) => (
                <li key={item.id} className="relative">
                  <a
                    href={item.permalink || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Publicação de ${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('pt-BR') : 'data desconhecida'} no Instagram (abre em nova aba)`}
                    className="group relative block aspect-[3/4] overflow-hidden bg-surface-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : null}
                    <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                      {item.productType === 'REELS' ? <Film size={12} aria-hidden="true" /> : <Layers size={12} aria-hidden="true" />}
                    </span>
                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-ink sm:text-[11px]">
                      Publicado
                    </span>
                  </a>
                </li>
              ))}
          </ol>
        )}
      </div>

      {/* Miniatura que acompanha o cursor durante o arraste */}
      {drag && draggedPost && createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] w-28 overflow-hidden rounded-md shadow-[0_12px_32px_-8px_rgb(35_27_45/0.45)]"
          style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) rotate(-2deg)' }}
        >
          <MediaPreview src={draggedPost.imageUrl} mediaType={draggedPost.mediaType} alt="" className="aspect-[3/4] w-full object-cover" />
        </div>,
        document.body,
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="feed-post-preview-title"
        onCancel={(event) => {
          event.preventDefault();
          setSelectedId(null);
        }}
        onClose={() => setSelectedId(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedId(null);
        }}
        className="modal-dialog-enter m-auto max-h-[92dvh] w-[min(94vw,46rem)] overflow-hidden rounded-panel border border-border bg-surface p-0 text-ink"
      >
        {selected && (
          <div className="flex max-h-[92dvh] flex-col md:flex-row">
            <div className="flex min-h-0 items-center justify-center bg-surface-muted md:w-1/2">
              <MediaPreview
                key={selected.imageUrl}
                src={selected.imageUrl}
                mediaType={selected.mediaType}
                alt={selected.title}
                controls={isVideoMedia(selected.imageUrl, selected.mediaType)}
                muted={isVideoMedia(selected.imageUrl, selected.mediaType)}
                className="aspect-[4/5] max-h-[50dvh] w-full object-cover md:max-h-[80dvh]"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h3 id="feed-post-preview-title" className="text-sm font-semibold">{selected.title}</h3>
                  <p className="mt-1 text-xs capitalize text-ink-muted">
                    {formatLongDay(selected.scheduledDate)}, {selected.timeString}
                  </p>
                  <p className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${approvalOf(selected.approvalStatus).tone}`}>
                    {(() => {
                      const Icon = approvalOf(selected.approvalStatus).icon;
                      return <Icon size={13} aria-hidden="true" />;
                    })()}
                    {approvalOf(selected.approvalStatus).label}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fechar prévia"
                  onClick={() => setSelectedId(null)}
                  className="flex min-h-10 min-w-10 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                >
                  <X size={18} />
                </button>
              </div>

              {selected.caption && (
                <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink">{selected.caption}</p>
              )}

              <div className="mt-auto space-y-2 border-t border-border px-4 py-3">
                <p className="text-xs font-semibold text-ink">Mudar posição no feed</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!earlier}
                    onClick={() => earlier && void swap(selected.id, earlier.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control border border-border px-2 text-xs font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-40"
                  >
                    <ArrowLeft size={14} aria-hidden="true" />
                    {earlier ? `Trocar com ${formatDay(earlier.scheduledDate)}` : 'Já é a primeira'}
                  </button>
                  <button
                    type="button"
                    disabled={!later}
                    onClick={() => later && void swap(selected.id, later.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control border border-border px-2 text-xs font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-40"
                  >
                    {later ? `Trocar com ${formatDay(later.scheduledDate)}` : 'Já é a última'}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

export function CatalogModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !document.body.style.cursor) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-stretch justify-center bg-ink/60 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
        className="modal-surface-enter flex h-dvh w-full max-w-4xl flex-col overflow-hidden bg-surface sm:h-[90dvh] sm:rounded-panel sm:border sm:border-border"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LayoutGrid size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            <h2 id="catalog-title" className="truncate text-base font-semibold text-ink">Grade do feed</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar grade do feed"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-control text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
          >
            <X size={18} />
          </button>
        </div>
        <InstagramFeedPreview />
      </div>
    </div>
  );
}
