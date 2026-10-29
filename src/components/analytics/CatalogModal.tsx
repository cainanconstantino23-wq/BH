'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CalendarDays, LayoutGrid, Play, RefreshCw, X } from 'lucide-react';
import { MediaPreview } from '@/components/MediaPreview';
import { isVideoMedia } from '@/lib/media';

type FeedStatusFilter = 'all' | 'pending' | 'approved';

interface FeedPost {
  id: string | number;
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

interface FeedPostRow extends Record<string, unknown> {
  id: string | number;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  media_url?: string | null;
  platform?: string | null;
  scheduled_date: string;
  time_string?: string | null;
  hour?: number | null;
  approval_status?: string | null;
  media_type?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const formatFeedDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
    .format(new Date(year, month - 1, day));
};

const getApprovalLabel = (status: string) => {
  if (status === 'approved') return 'Aprovado';
  if (status === 'pending') return 'Aguardando aprovação';
  if (status === 'changes_requested') return 'Ajustes solicitados';
  if (status === 'rejected') return 'Reprovado';
  return 'Não enviado para aprovação';
};

function InstagramFeedPreview() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [filter, setFilter] = useState<FeedStatusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const postPreviewDialogRef = useRef<HTMLDialogElement>(null);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .not('scheduled_date', 'is', null)
      .order('scheduled_date', { ascending: true })
      .order('hour', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as unknown as FeedPostRow[];
    return rows.map((row): FeedPost => ({
      id: row.id,
      title: row.title || 'Publicação',
      caption: row.content || '',
      imageUrl: row.image_url || row.media_url || '',
      mediaType: row.media_type || '',
      format: row.platform || 'POST',
      scheduledDate: row.scheduled_date,
      timeString: row.time_string || `${String(row.hour ?? 19).padStart(2, '0')}:00`,
      hour: row.hour ?? 19,
      approvalStatus: row.approval_status || '',
    }));
  }, []);

  useEffect(() => {
    const dialog = postPreviewDialogRef.current;
    if (!dialog) return;

    if (selectedPost && !dialog.open) dialog.showModal();
    else if (!selectedPost && dialog.open) dialog.close();
  }, [selectedPost]);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const scheduledPosts = await loadPosts();
        if (!active) return;
        setPosts(scheduledPosts);
        setErrorMessage('');
      } catch (error) {
        if (!active) return;
        console.error('Não foi possível carregar a grade do feed:', error);
        setErrorMessage('Não foi possível carregar as publicações agendadas. Tente atualizar novamente.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void refresh();

    const channel = supabase
      .channel('catalog-instagram-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        void refresh();
      })
      .subscribe((status) => {
        if (active) setIsLive(status === 'SUBSCRIBED');
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15_000);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, [loadPosts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const scheduledPosts = await loadPosts();
      setPosts(scheduledPosts);
      setErrorMessage('');
    } catch (error) {
      console.error('Não foi possível atualizar a grade do feed:', error);
      setErrorMessage('Não foi possível atualizar as publicações. Tente novamente.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const visiblePosts = posts.filter((post) => {
    if (filter === 'approved') return post.approvalStatus === 'approved';
    if (filter === 'pending') {
      return post.approvalStatus === 'pending' || post.approvalStatus === 'changes_requested';
    }
    return true;
  });

  return (
    <section aria-labelledby="feed-preview-title" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas">
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Pré-visualização do Instagram</p>
            <h3 id="feed-preview-title" className="text-xl font-semibold tracking-tight text-ink">Grade do feed</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Veja a sequência prevista das publicações e acompanhe o estado de aprovação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex min-h-11 items-center gap-2 px-2 text-[11px] font-medium ${isLive ? 'text-status-success' : 'text-ink-muted'}`}>
              <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-status-success' : 'bg-ink-muted/50'}`} aria-hidden="true" />
              {isLive ? 'Atualização ao vivo' : 'Sincroniza a cada 15 s'}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              aria-label="Atualizar publicações agendadas"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-border bg-surface text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar publicações por aprovação">
            {([
              ['all', 'Todas'],
              ['pending', 'Pendentes'],
              ['approved', 'Aprovadas'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
                  filter === value
                    ? 'border-brand-plum bg-brand-plum text-white'
                    : 'border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted" aria-live="polite">
            {visiblePosts.length} {visiblePosts.length === 1 ? 'publicação' : 'publicações'}
          </p>
        </div>

        {errorMessage && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-status-danger-border bg-status-danger-soft px-4 py-3 text-xs text-status-danger">
            <p>{errorMessage}</p>
            <button type="button" onClick={handleRefresh} className="min-h-11 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-danger">
              Tentar novamente
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label="Carregando publicações">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="aspect-square animate-pulse bg-surface-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : visiblePosts.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label="Grade cronológica de publicações agendadas">
            {visiblePosts.map((post) => (
              <button
                key={post.id}
                type="button"
                aria-label={`Ampliar publicação ${post.title}, ${formatFeedDate(post.scheduledDate)} às ${post.timeString}`}
                aria-haspopup="dialog"
                onClick={() => setSelectedPost(post)}
                className="group relative aspect-square overflow-hidden bg-surface-muted text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              >
                <MediaPreview
                  key={post.imageUrl}
                  src={post.imageUrl}
                  mediaType={post.mediaType}
                  alt={post.title}
                  muted
                  loop
                  className="h-full w-full object-cover"
                />
                {isVideoMedia(post.imageUrl, post.mediaType) && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-plum/70 text-white">
                      <Play size={16} fill="currentColor" aria-hidden="true" />
                    </span>
                  </span>
                )}
                <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full bg-brand-plum/85 px-2 py-1 text-[9px] font-semibold text-white sm:left-2 sm:top-2 sm:text-[10px]">
                  {getApprovalLabel(post.approvalStatus)}
                </span>
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-2 pt-8 text-white sm:px-3 sm:pb-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-semibold sm:text-xs">{post.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[9px] text-white/85 sm:text-[10px]">
                      <CalendarDays size={11} aria-hidden="true" />
                      {formatFeedDate(post.scheduledDate)}
                      <span aria-hidden="true">·</span>
                      {post.timeString}
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-white/15 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-wide sm:text-[9px]">
                    {post.format}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border-strong bg-surface px-6 text-center">
            <LayoutGrid size={24} className="text-ink-muted" aria-hidden="true" />
            <h4 className="mt-3 text-sm font-semibold text-ink">
              {filter === 'all' ? 'Ainda não há publicações agendadas' : `Nenhuma publicação ${filter === 'approved' ? 'aprovada' : 'pendente'}`}
            </h4>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
              Agende conteúdos para visualizar aqui como a sequência do feed ficará no Instagram.
            </p>
          </div>
        )}
      </div>
      <dialog
        ref={postPreviewDialogRef}
        aria-labelledby="feed-post-preview-title"
        onCancel={(event) => {
          event.preventDefault();
          setSelectedPost(null);
        }}
        onClose={() => setSelectedPost(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedPost(null);
        }}
        className="modal-dialog-enter m-auto max-h-[92dvh] w-[min(94vw,48rem)] overflow-hidden rounded-panel border border-border bg-canvas p-0 text-ink"
      >
        {selectedPost && (
          <div className="flex max-h-[92dvh] flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 id="feed-post-preview-title" className="truncate text-sm font-semibold">{selectedPost.title}</h3>
                <p className="mt-1 text-xs text-ink-muted">
                  {formatFeedDate(selectedPost.scheduledDate)} às {selectedPost.timeString} · {getApprovalLabel(selectedPost.approvalStatus)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar prévia ampliada"
                onClick={() => setSelectedPost(null)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-muted p-3 sm:p-5">
              <MediaPreview
                key={selectedPost.imageUrl}
                src={selectedPost.imageUrl}
                mediaType={selectedPost.mediaType || (isVideoMedia(selectedPost.imageUrl) ? 'video' : '')}
                alt={selectedPost.title}
                controls={isVideoMedia(selectedPost.imageUrl, selectedPost.mediaType)}
                autoPlay={isVideoMedia(selectedPost.imageUrl, selectedPost.mediaType)}
                muted={isVideoMedia(selectedPost.imageUrl, selectedPost.mediaType)}
                className="max-h-[70dvh] max-w-full object-contain"
              />
            </div>
            {selectedPost.caption && (
              <p className="max-h-28 overflow-y-auto whitespace-pre-wrap border-t border-border px-4 py-3 text-sm leading-relaxed sm:px-5">
                {selectedPost.caption}
              </p>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}

export function CatalogModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="modal-surface-enter flex h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between bg-brand-plum px-4 py-3 text-white sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-control bg-brand-lime p-2 text-brand-plum">
              <LayoutGrid size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold">Grade do feed</h2>
              <p className="text-xs text-white/70">Pré-visualização das publicações agendadas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar grade do feed"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime"
          >
            <X size={20} />
          </button>
        </div>
        <InstagramFeedPreview />
      </div>
    </div>
  );
}
