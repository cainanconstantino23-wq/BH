'use client';

import { OnScreen } from '@/components/drive/OnScreen';
import { PublishStatusTag } from '@/components/PublishStatusTag';
import { PublishResultDialog, cancelScheduledPublish, publishToInstagram, type PublishResult } from '@/components/PublishResultDialog';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BellRing, CalendarPlus, Check, Crop, ChevronLeft, ChevronRight, Clock3, Copy, FolderOpen, FolderPlus, Link2, Maximize2, Loader2, RefreshCw, Trash2, Unplug, X, XCircle } from 'lucide-react';
import { APPROVER_LABEL, APPROVER_NAME, approverLines, formatLongStamp, formatStamp, photoLimit, photoStamp, type CollectionKind, type CoverCollectionDetail, type CoverCollectionSummary, type CoverPhoto, type CollectionPostInfo } from '@/lib/covers';
import { describeActivity } from '@/components/team/TeamPanel';
import { CROPS_SAVED_ACTION, SAVED_TO_DRIVE_ACTION } from '@/lib/coverDrive';
import { coverFolderLabel, houseLabel } from '@/lib/house';
import { useTeam } from '@/lib/team';
import { DriveBrowser, PhotoTile, driveThumb } from '@/components/drive/DriveBrowser';
import { DrivePhotoViewer } from '@/components/drive/DrivePhotoViewer';
import { ApprovedPhotoLightbox } from '@/components/drive/ApprovedPhotoLightbox';
import type { CropSize } from '@/components/capa/ApproverPhotoViewer';
import { uploadImage } from '@/lib/uploadImage';
import CreatePostModal, { type ApprovedPostInput, type SavedPostInfo } from '@/components/CreatePostModal';
import { supabase } from '@/lib/supabase';

const photoSrc = (photo: CoverPhoto, size = 400) => photo.edited?.url ?? driveThumb(photo.driveId, size);

// Aprovação de capa: o social media escolhe no Google Drive as fotos do feed/story e favorita candidatas a capa;
// as fotos ficam em pastas por casa; um link mostra só as favoritas para a aprovadora escolher a capa.
// mode 'fotos' (aba Aprovação fotos): mesmo fluxo, para o social media organizar antes de enviar para aprovação —
// das ~50 fotos da casa no Drive, separa as 15 do carrossel e marca entre elas as capas.

const COPY = {
  capa: {
    title: 'Aprovação de capa',
    intro: 'Fotos do Google Drive separadas por casa, com as favoritas para a capa do feed.',
  },
  fotos: {
    title: 'Aprovação fotos',
    intro: 'Organize as fotos de cada casa antes de enviar para aprovação: as 15 do carrossel e, entre elas, as capas.',
  },
} as const;

// a aba que abriu o login do Google, para voltar a ela depois de conectar o Drive
export const DRIVE_RETURN_KEY = 'bh-drive-return-tab';

type Status =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; configured: boolean; connected: boolean; expired?: boolean; email?: string | null; canConnect: boolean };

type View = { name: 'folders' } | { name: 'drive'; target: CoverCollectionSummary | null } | { name: 'folder'; id: number };

export function CoverApprovalPanel({
  notice,
  mode = 'capa',
  onOpenCalendar,
}: {
  notice?: { tone: 'success' | 'error'; text: string } | null;
  mode?: CollectionKind;
  /** Abre o Calendário de posts (botão da confirmação depois de agendar). */
  onOpenCalendar?: () => void;
}) {
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [collections, setCollections] = useState<CoverCollectionSummary[] | null>(null);
  const [collectionsError, setCollectionsError] = useState(false);
  const [view, setView] = useState<View>({ name: 'folders' });
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(
    () =>
      fetch('/api/drive/status', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          setStatus({ state: 'ready', ...(await response.json()) });
        })
        .catch(() => setStatus({ state: 'error' })),
    [],
  );

  const loadCollections = useCallback(
    () =>
      fetch(`/api/capa?tipo=${mode}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          setCollections((await response.json()).collections);
          setCollectionsError(false);
        })
        .catch(() => {
          setCollections([]);
          setCollectionsError(true);
        }),
    [mode],
  );

  useEffect(() => {
    void loadStatus();
    void loadCollections();
  }, [loadStatus, loadCollections]);

  const onNotConnected = useCallback(() => void loadStatus(), [loadStatus]);

  const disconnect = async () => {
    setDisconnecting(true);
    await fetch('/api/drive/status', { method: 'DELETE' }).catch(() => undefined);
    setDisconnecting(false);
    setView({ name: 'folders' });
    void loadStatus();
  };

  const connected = status.state === 'ready' && status.connected;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">{COPY[mode].title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{COPY[mode].intro}</p>
        </div>
        {connected && status.state === 'ready' && (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-soft px-2.5 py-1 font-medium text-status-success">
              <Check size={13} aria-hidden="true" /> Drive: {status.email ?? 'conectado'}
            </span>
            {status.canConnect && (
              <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 font-semibold hover:bg-surface-muted hover:text-ink disabled:opacity-50">
                <Unplug size={14} aria-hidden="true" /> Desconectar
              </button>
            )}
          </div>
        )}
      </div>

      <HowItWorks mode={mode} />

      {notice && (
        <p role="status" className={`rounded-control border px-4 py-3 text-sm ${notice.tone === 'success' ? 'border-status-success-border bg-status-success-soft text-status-success' : 'border-status-danger-border bg-status-danger-soft text-status-danger'}`}>
          {notice.text}
        </p>
      )}

      {status.state === 'ready' && !status.connected && <ConnectCard status={status} mode={mode} />}
      {status.state === 'error' && (
        <p className="text-sm text-ink">
          Não foi possível verificar a conexão com o Drive.{' '}
          <button type="button" onClick={() => void loadStatus()} className="font-semibold text-brand-plum underline underline-offset-2">Tentar de novo</button>
        </p>
      )}

      {mode === 'fotos' && (view.name === 'folders' || view.name === 'folder') && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.7fr)]">
          <FolderQueue
            collections={collections}
            error={collectionsError}
            canAdd={connected}
            selectedId={view.name === 'folder' ? view.id : null}
            onOpen={(id) => {
              setView({ name: 'folder', id });
              // em tela estreita o detalhe fica abaixo da fila: rola até ele
              if (window.innerWidth < 1280) {
                window.requestAnimationFrame(() => document.getElementById('foto-detalhe')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }
            }}
            onAdd={() => setView({ name: 'drive', target: null })}
          />
          <div id="foto-detalhe" className="min-w-0 scroll-mt-4 rounded-panel border border-border bg-surface p-4 sm:p-6">
            {view.name === 'folder' ? (
              <FolderDetail
                mode={mode}
                onOpenCalendar={onOpenCalendar}
                key={view.id}
                id={view.id}
                canAddFromDrive={connected}
                post={collections?.find((c) => c.id === view.id)?.post ?? null}
                onChanged={() => void loadCollections()}
                onBack={() => {
                  void loadCollections();
                  setView({ name: 'folders' });
                }}
                onAddFromDrive={(summary) => setView({ name: 'drive', target: summary })}
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
                <FolderOpen size={30} className="text-ink-muted" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink">Escolha uma casa na fila</p>
                <p className="max-w-sm text-xs leading-relaxed text-ink-muted">As fotos, as capas, o link de aprovação e a publicação de cada casa aparecem aqui.</p>
                {connected && (
                  <button type="button" onClick={() => setView({ name: 'drive', target: null })} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover">
                    <FolderPlus size={15} aria-hidden="true" /> Escolher fotos no Drive
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode !== 'fotos' && view.name === 'folders' && (
        <FolderGrid
          collections={collections}
          error={collectionsError}
          canAdd={connected}
          onOpen={(id) => setView({ name: 'folder', id })}
          onAdd={() => setView({ name: 'drive', target: null })}
        />
      )}

      {view.name === 'drive' && connected && (
        <>
          <BackLink
            label={view.target ? 'Voltar para a pasta' : 'Voltar para as pastas'}
            onClick={() => setView(view.target ? { name: 'folder', id: view.target.id } : { name: 'folders' })}
          />
          <DriveBrowser
            mode={mode}
            collections={collections ?? []}
            target={view.target}
            onNotConnected={onNotConnected}
            onSaved={(collection) => {
              void loadCollections();
              setView({ name: 'folder', id: collection.id });
            }}
          />
        </>
      )}

      {mode !== 'fotos' && view.name === 'folder' && (
        <FolderDetail
          post={collections?.find((c) => c.id === view.id)?.post ?? null}
          onChanged={() => void loadCollections()}
          mode={mode}
          onOpenCalendar={onOpenCalendar}
          key={view.id}
          id={view.id}
          canAddFromDrive={connected}
          onBack={() => {
            void loadCollections();
            setView({ name: 'folders' });
          }}
          onAddFromDrive={(summary) => setView({ name: 'drive', target: summary })}
        />
      )}
    </div>
  );
}

function HowItWorks({ mode }: { mode: CollectionKind }) {
  const steps = mode === 'fotos' ? [
    { title: 'Abra a casa no Drive', text: 'Conecte o Google Drive e entre na pasta da casa. Ex.: de 50 fotos, marque com ✓ as 15 do carrossel.' },
    { title: 'Marque as capas', text: 'Entre as 15 escolhidas, marque com ★ as fotos que podem ser capa. Tudo fica numa pasta por casa: nome, bairro e número.' },
    { title: 'Envie para aprovação', text: 'Com o carrossel organizado, gere o link das capas e mande para a Thereza. A resposta aparece aqui.' },
  ] : [
    { title: 'Escolha no Drive', text: 'Abra a pasta da casa no Google Drive e marque com ✓ as fotos candidatas a capa. Salve com nome, número e bairro da casa.' },
    { title: 'Envie o link', text: 'Gere o link e mande para a Thereza. Ela vê cada foto em tela grande, corta, passa para a próxima e aprova a seleção.' },
    { title: 'Salve no Drive', text: 'Quando ela aprovar, chega uma notificação. Abra a casa e salve as capas aprovadas numa pasta nova no Drive, com o registro.' },
  ];
  return (
    <section aria-label="Como funciona" className="rounded-panel border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Como funciona</h2>
      <ol className="mt-3 grid gap-4 sm:grid-cols-3 sm:gap-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-plum text-xs font-semibold text-white tabular-nums">{index + 1}</span>
            <div>
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConnectCard({ status, mode }: { status: Extract<Status, { state: 'ready' }>; mode: CollectionKind }) {
  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-panel border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-ink">{status.expired ? 'Reconecte o Google Drive' : 'Conecte o Google Drive'}</h2>
      <p className="text-sm leading-relaxed text-ink-muted">
        {!status.configured
          ? 'Falta configurar as credenciais do Google no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).'
          : status.expired
            ? 'O acesso ao Drive expirou ou foi removido. Conecte de novo para continuar escolhendo fotos.'
            : 'Para escolher fotos, conecte o Drive. O BH Analytics lê as fotos e só grava quando você pede para salvar as capas aprovadas numa pasta nova da casa: não altera nem apaga nada. A conexão vale para toda a equipe.'}
      </p>
      {status.configured && status.canConnect && (
        <a
          href="/api/auth/google/login"
          onClick={() => {
            try {
              sessionStorage.setItem(DRIVE_RETURN_KEY, mode);
            } catch {
              // sem sessionStorage: volta para a Aprovação de capa
            }
          }}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control bg-brand-plum px-4 text-sm font-semibold text-white hover:bg-brand-plum-hover">
          {status.expired ? 'Reconectar Google Drive' : 'Conectar Google Drive'}
        </a>
      )}
      {status.configured && !status.canConnect && <p className="text-xs text-ink-muted">Peça a um administrador para conectar o Drive.</p>}
    </section>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-9 items-center gap-1 rounded-control pr-3 text-sm font-medium text-ink-muted hover:text-ink">
      <ChevronLeft size={16} aria-hidden="true" /> {label}
    </button>
  );
}

function FolderGrid({
  collections,
  error,
  canAdd,
  onOpen,
  onAdd,
}: {
  collections: CoverCollectionSummary[] | null;
  error: boolean;
  canAdd: boolean;
  onOpen: (id: number) => void;
  onAdd: () => void;
}) {
  return (
    <section aria-labelledby="cover-folders-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cover-folders-title" className="text-lg font-semibold text-ink">Pastas das casas</h2>
        {canAdd && (
          <button type="button" onClick={onAdd} className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover">
            <FolderPlus size={15} aria-hidden="true" /> Escolher fotos no Drive
          </button>
        )}
      </div>

      {collections === null ? (
        <p className="flex items-center gap-2 py-8 text-sm text-ink-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Carregando pastas…</p>
      ) : error ? (
        <p className="text-sm text-status-danger">Não foi possível carregar as pastas. Confira se a migração das pastas de capa foi rodada no Supabase.</p>
      ) : collections.length === 0 ? (
        <p className="rounded-panel border border-dashed border-border px-5 py-10 text-center text-sm text-ink-muted">
          Nenhuma pasta ainda. Use &ldquo;Escolher fotos no Drive&rdquo; para começar.
        </p>
      ) : (
        <div className="space-y-6">
          {[
            // pasta aprovada = a aprovadora respondeu e escolheu ao menos uma capa
            { key: 'aprovadas', title: 'Aprovadas', items: collections.filter((c) => c.responded && c.approvedCount > 0), approved: true },
            { key: 'outras', title: 'Aguardando aprovação', items: collections.filter((c) => !(c.responded && c.approvedCount > 0)), approved: false },
          ].filter((group) => group.items.length > 0).map(({ key, title, items, approved }) => (
            <section key={key} aria-label={title} className={approved ? 'space-y-3 rounded-panel border border-status-success-border bg-status-success-soft/60 p-4' : 'space-y-3'}>
              <h3 className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${approved ? 'text-status-success' : 'text-ink-muted'}`}>
                {approved ? <Check size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
                {title}
                <span className="tabular-nums">· {items.length}</span>
              </h3>
              {/* uma linha por casa, só o nome (sem foto) */}
              <ul className={`divide-y overflow-hidden rounded-panel border bg-surface ${approved ? 'divide-status-success-border border-status-success-border' : 'divide-border border-border'}`}>
                {items.map((collection) => {
                  const house = houseLabel(collection.houseName, collection.houseNumber) || 'Sem nome';
                  const status = collection.responded
                    ? { text: collection.approvedCount ? 'Aprovada' : 'Respondida', className: 'bg-status-success-soft text-status-success' }
                    : collection.shareToken
                      ? { text: 'Aguardando', className: 'bg-surface-muted text-ink' }
                      : { text: 'Sem link', className: 'text-ink-muted' };
                  return (
                    <li key={collection.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(collection.id)}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-plum"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{house}</span>
                          {collection.neighborhood && <span className="block truncate text-xs text-ink-muted">{collection.neighborhood}</span>}
                        </span>
                        <span className="hidden shrink-0 text-xs tabular-nums text-ink-muted sm:inline">
                          {collection.photoCount} {collection.photoCount === 1 ? 'foto' : 'fotos'}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.text}</span>
                        <ChevronRight size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

// Fila da Aprovação fotos: as casas em grupos (aprovadas no topo), como a fila da Aprovação vídeos.
function FolderQueue({
  collections,
  error,
  canAdd,
  selectedId,
  onOpen,
  onAdd,
}: {
  collections: CoverCollectionSummary[] | null;
  error: boolean;
  canAdd: boolean;
  selectedId: number | null;
  onOpen: (id: number) => void;
  onAdd: () => void;
}) {
  const isApproved = (c: CoverCollectionSummary) => c.responded && c.approvedCount > 0;
  const groups = collections
    ? [
        { key: 'aprovadas', title: 'Aprovadas', tone: 'approved' as const, items: collections.filter(isApproved) },
        { key: 'aguardando', title: 'Aguardando aprovação', tone: 'waiting' as const, items: collections.filter((c) => !isApproved(c) && Boolean(c.shareToken)) },
        { key: 'preparo', title: 'Em preparação', tone: 'draft' as const, items: collections.filter((c) => !isApproved(c) && !c.shareToken) },
      ].filter((group) => group.items.length > 0)
    : [];

  const when = (date: string | null, hour: number | null) => {
    if (!date) return '';
    const [, month, day] = date.split('-');
    return `${day}/${month}${hour !== null ? ` às ${String(hour).padStart(2, '0')}:00` : ''}`;
  };

  const line = (c: CoverCollectionSummary) => {
    const planned = c.plannedDate ? `Planejado ${when(c.plannedDate, c.plannedHour)}` : 'Sem data planejada';
    if (isApproved(c)) {
      return { text: c.post ? (c.post.scheduledDate ? `Post para ${when(c.post.scheduledDate, c.post.hour)}` : 'Post criado, sem data') : planned, tone: 'text-ink' };
    }
    if (c.responded) return { text: 'Respondida sem capa: veja o comentário', tone: 'text-status-warning' };
    return { text: `${planned} · ${c.photoCount} de ${photoLimit('fotos')} · ${c.favoriteCount} ★`, tone: c.plannedDate ? 'text-ink-muted' : 'text-status-warning' };
  };

  const badge = (c: CoverCollectionSummary) =>
    isApproved(c)
      ? { text: 'Aprovada', icon: <Check size={11} aria-hidden="true" />, cls: 'border border-status-success-border bg-status-success-soft text-status-success' }
      : c.responded
        ? { text: 'Respondida', icon: <Clock3 size={11} aria-hidden="true" />, cls: 'border border-status-warning-border bg-status-warning-soft text-status-warning' }
        : c.shareToken
          ? { text: 'Aguardando', icon: <Clock3 size={11} aria-hidden="true" />, cls: 'bg-canvas text-brand-plum' }
          : { text: 'Em preparação', icon: <FolderOpen size={11} aria-hidden="true" />, cls: 'bg-surface-muted text-ink-muted' };

  return (
    <section aria-labelledby="fotos-fila-title" className="overflow-hidden rounded-panel border border-border bg-surface xl:self-start">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-canvas p-4">
        <h2 id="fotos-fila-title" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Fila de aprovação</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-semibold text-brand-plum tabular-nums">{collections?.length ?? 0}</span>
          {canAdd && (
            <button type="button" onClick={onAdd} aria-label="Escolher fotos no Drive" title="Escolher fotos no Drive" className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-plum text-white hover:bg-brand-plum-hover">
              <FolderPlus size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[640px] overflow-y-auto">
        {collections === null ? (
          <p className="flex items-center justify-center gap-2 p-8 text-xs text-ink-muted"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Carregando…</p>
        ) : error ? (
          <p className="p-6 text-xs text-status-danger">Não foi possível carregar as casas.</p>
        ) : groups.length === 0 ? (
          <p className="p-8 text-center text-xs text-ink-muted">Nenhuma casa ainda. Use &ldquo;Escolher fotos no Drive&rdquo; para começar.</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-label={group.title}>
              <h3 className={`sticky top-0 z-10 flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wide ${
                group.tone === 'approved' ? 'bg-status-success-soft text-status-success' : 'bg-canvas text-ink-muted'
              }`}>
                <span className="flex items-center gap-1.5">
                  {group.tone === 'approved' ? <Check size={13} aria-hidden="true" /> : group.tone === 'waiting' ? <Clock3 size={13} aria-hidden="true" /> : <FolderOpen size={13} aria-hidden="true" />}
                  {group.title}
                </span>
                <span className="tabular-nums">{group.items.length}</span>
              </h3>
              <ul className="divide-y divide-border">
                {group.items.map((c) => {
                  const selected = c.id === selectedId;
                  const info = line(c);
                  const tag = badge(c);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onOpen(c.id)}
                        className={`flex min-h-[76px] w-full items-center gap-3 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-plum ${
                          selected
                            ? 'border-l-4 border-brand-plum bg-surface-muted/70'
                            : group.tone === 'approved'
                              ? 'border-l-4 border-status-success bg-status-success-soft/50 hover:bg-status-success-soft'
                              : 'hover:bg-canvas/70'
                        }`}
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-control bg-canvas">
                          {c.coverDriveId ? (
                            // eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor
                            <img src={c.coverEditedUrl ?? driveThumb(c.coverDriveId, 200)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <FolderOpen size={18} className="m-auto mt-3.5 text-ink-muted" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug text-ink">
                              {coverFolderLabel(c.houseName, c.neighborhood, c.houseNumber) || 'Sem nome'}
                            </span>
                            <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tag.cls}`}>
                              {tag.icon} {tag.text}
                            </span>
                          </div>
                          <p className={`mt-1 truncate text-xs ${info.tone}`}>{info.text}</p>
                          {/* aprovação no selo acima; aqui a publicação no Instagram */}
                          <div className="mt-1.5">
                            <PublishStatusTag
                              state={c.post?.status === 'published' ? 'published' : c.post?.status === 'scheduled' ? 'scheduled' : 'none'}
                              date={c.post?.scheduledDate}
                              hour={c.post?.hour}
                              noneLabel={c.post?.scheduledDate ? 'No calendário, sem agendar' : isApproved(c) ? 'Pronta para publicar' : 'Não publicado'}
                            />
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function FolderDetail({
  mode,
  onOpenCalendar,
  id,
  canAddFromDrive,
  onBack,
  onAddFromDrive,
  onChanged,
  post = null,
}: {
  mode: CollectionKind;
  onOpenCalendar?: () => void;
  id: number;
  canAddFromDrive: boolean;
  onBack: () => void;
  /** A pasta mudou (fotos, link, resposta, post): a fila recarrega. */
  onChanged?: () => void;
  /** Post programado a partir desta pasta (da listagem): agendado, no ar ou só no calendário. */
  post?: CollectionPostInfo | null;
  onAddFromDrive: (summary: CoverCollectionSummary) => void;
}) {
  const team = useTeam();
  const [collection, setCollection] = useState<CoverCollectionDetail | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<CoverPhoto | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  // Programar post com as fotos aprovadas (baixadas como arquivo para o modal do Programar Post)
  const [preparing, setPreparing] = useState('');
  const [scheduleFiles, setScheduleFiles] = useState<File[] | null>(null);
  const [scheduled, setScheduled] = useState(false);
  // andamento no centro da tela: aprovar → publicar no Instagram
  const [publishing, setPublishing] = useState<PublishResult | null>(null);
  // post já programado a partir desta pasta, aberto na tela de postagem (formato, legenda, data, horário)
  const [editPost, setEditPost] = useState<ApprovedPostInput | null>(null);
  const [openingPost, setOpeningPost] = useState(false);

  const openPostEditor = async (postId: number) => {
    setOpeningPost(true);
    const { data: row } = await supabase
      .from('posts')
      .select('id, image_url, media_type, media_items, content, caption, house_name, house_number, platform, scheduled_date, hour')
      .eq('id', postId)
      .maybeSingle();
    setOpeningPost(false);
    if (!row) {
      setError('Não foi possível abrir o post. Atualize a página e tente de novo.');
      return;
    }
    const items = Array.isArray(row.media_items)
      ? (row.media_items as { url?: unknown; type?: unknown }[])
          .filter((item) => typeof item?.url === 'string' && item.url)
          .map((item) => ({ url: item.url as string, isVideo: item.type === 'video' }))
      : [];
    setEditPost({
      id: Number(row.id),
      mediaUrl: row.image_url ?? '',
      isVideo: row.media_type === 'video',
      media: items.length ? items : undefined,
      caption: row.content || row.caption || '',
      houseName: row.house_name ?? '',
      houseNumber: row.house_number ?? '',
      platform: row.platform ?? undefined,
      scheduledDate: row.scheduled_date ?? undefined,
      hour: typeof row.hour === 'number' ? row.hour : null,
    });
  };

  const afterPostCreated = async (postId: number | undefined, publishNow: boolean, saved?: SavedPostInfo) => {
    if (!postId) {
      setError('Não foi possível confirmar o post salvo. Confira no Calendário de posts.');
      return;
    }
    setPublishing({ state: 'working', text: publishNow ? 'Marcando como aprovado…' : 'Confirmando o agendamento…' });
    // capa aprovada pela Thereza: o post já entra como aprovado (o servidor confere)
    const approve = await fetch(`/api/capa/${id}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    }).catch(() => null);
    if (!publishNow) {
      // agendado: mostra no centro da tela o que ficou gravado (data, hora, aprovado e se publica sozinho)
      if (saved) setPublishing({ state: 'scheduled', ...saved, approved: Boolean(approve?.ok) });
      else setPublishing(null);
      if (!approve?.ok) setError('O post foi salvo, mas não foi possível marcar como aprovado. Tente programar de novo ou avise quem administra a equipe.');
      return;
    }
    if (!approve?.ok) {
      setPublishing({ state: 'error', text: 'O post foi salvo, mas não foi possível marcar como aprovado. Tente programar de novo ou avise quem administra a equipe.' });
      return;
    }

    setPublishing({ state: 'working', text: 'Publicando no Instagram… vídeos e carrosséis podem levar alguns minutos.' });
    setPublishing(await publishToInstagram(postId));
  };

  const schedule = async (photos: CoverPhoto[]) => {
    setScheduled(false);
    setError('');
    try {
      const files: File[] = [];
      for (const [index, photo] of photos.entries()) {
        setPreparing(`Preparando foto ${index + 1} de ${photos.length}…`);
        const response = await fetch(photo.edited?.url ?? `/api/drive/file/${encodeURIComponent(photo.driveId)}`);
        if (!response.ok) throw new Error(`foto ${photo.name}: ${response.status}`);
        const blob = await response.blob();
        const base = photo.name.replace(/\.[^.]+$/, '') || 'foto';
        files.push(new File([blob], photo.edited ? `${base}-${photo.edited.width}x${photo.edited.height}.jpg` : photo.name, { type: blob.type || 'image/jpeg' }));
      }
      setScheduleFiles(files);
    } catch (prepareError) {
      console.error('Falha ao preparar as fotos para programar:', prepareError);
      setError('Não foi possível preparar as fotos. Confira a conexão com o Drive e tente de novo.');
    } finally {
      setPreparing('');
    }
  };

  const shareUrl = (token: string) => `${window.location.origin}/capa/${token}`;

  // a fila ao lado acompanha as mudanças da pasta (e o post criado/publicado a partir dela)
  useEffect(() => {
    if (collection) onChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a pasta muda
  }, [collection]);

  useEffect(() => {
    fetch(`/api/capa/${id}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCollection(data.collection);
        if (data.collection.shareToken) setLink(shareUrl(data.collection.shareToken));
      })
      .catch(() => setError('Não foi possível abrir esta pasta.'));
  }, [id]);

  const patch = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/capa/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.collection) setCollection(data.collection);
    else setError('Não foi possível salvar a alteração.');
  };

  const makeLink = async (renew = false) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/capa/${id}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renew }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const url = shareUrl(data.token);
      setLink(url);
      await navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined);
    } catch {
      setError('Não foi possível gerar o link.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Apagar esta pasta? As fotos continuam no Google Drive; só a seleção é apagada.')) return;
    const response = await fetch(`/api/capa/${id}`, { method: 'DELETE' });
    if (response.ok) onBack();
    else setError('Não foi possível apagar a pasta.');
  };

  if (!collection) {
    return (
      <div className="space-y-4">
        <BackLink label="Voltar para as pastas" onClick={onBack} />
        {error ? <p className="text-sm text-status-danger">{error}</p> : <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Abrindo pasta…</p>}
      </div>
    );
  }

  const favorites = collection.photos.filter((photo) => photo.favorite);
  // Aprovação de capa: toda foto da pasta é candidata a capa (sem ★); Aprovação fotos: só as capas marcadas
  const candidates = mode === 'capa' ? collection.photos : favorites;
  const approved = collection.photos.filter((photo) => photo.approved);
  const respondedWhen = collection.respondedAt
    ? new Date(collection.respondedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const approvedHint = scheduled
    ? 'Post salvo e aprovado. Ele aparece no calendário e na Grade do feed (lá também dá para publicar).'
    : !collection.responded
      ? link ? `Aguardando a aprovação da ${APPROVER_NAME} pelo link.` : `Gere o link e envie para a ${APPROVER_NAME}.`
      : approved.length === 0
        ? `Respondido${respondedWhen ? ` em ${respondedWhen}` : ''}, sem capa escolhida.`
        : `${approved.length === 1 ? 'Capa escolhida' : `${approved.length} capas escolhidas`}${respondedWhen ? ` em ${respondedWhen}` : ''}. Já dá para programar o post.`;
  const label = coverFolderLabel(collection.houseName, collection.neighborhood, collection.houseNumber) || 'Sem nome';
  const limit = photoLimit(mode);
  const carousel = limit !== null;
  const full = carousel && collection.photos.length >= limit;

  return (
    <div className="space-y-6">
      <BackLink label="Voltar para as pastas" onClick={onBack} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">{label}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {carousel
              ? `${collection.photos.length} de ${limit} fotos do carrossel · ${favorites.length} ${favorites.length === 1 ? 'capa' : 'capas'}`
              : `${collection.photos.length} ${collection.photos.length === 1 ? 'foto candidata' : 'fotos candidatas'} a capa`}
          </p>
          {/* data planejada: enquanto não vira post, a pasta aparece na Grade do feed nessa data */}
          {mode === 'fotos' && !post && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink"><CalendarPlus size={15} aria-hidden="true" /> Planejado para</span>
              {team.can('editar_publicacoes') || team.can('criar_publicacoes') || team.can('reagendar_publicacoes') ? (
                <>
                  <input
                    type="date"
                    value={collection.plannedDate ?? ''}
                    onChange={(event) => event.target.value && void patch({ plannedDate: event.target.value, plannedHour: collection.plannedHour ?? 19 })}
                    aria-label="Data planejada"
                    className="min-h-9 rounded-control border border-border bg-surface px-2.5 text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  />
                  <select
                    value={collection.plannedHour ?? 19}
                    onChange={(event) => collection.plannedDate && void patch({ plannedDate: collection.plannedDate, plannedHour: Number(event.target.value) })}
                    disabled={!collection.plannedDate}
                    aria-label="Horário planejado"
                    className="min-h-9 rounded-control border border-border bg-surface px-2.5 text-sm tabular-nums text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                  {!collection.plannedDate && <span className="text-xs text-status-warning">Defina a data para aparecer na Grade do feed.</span>}
                </>
              ) : (
                <span className="tabular-nums text-ink">{collection.plannedDate ? `${collection.plannedDate.split('-').reverse().join('/')} às ${String(collection.plannedHour ?? 19).padStart(2, '0')}:00` : 'sem data'}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAddFromDrive && !full && (
            <button type="button" onClick={() => onAddFromDrive(collection)} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-3.5 text-xs font-semibold text-ink hover:bg-surface-muted">
              <FolderPlus size={15} aria-hidden="true" /> Adicionar fotos do Drive
            </button>
          )}
          {team.can('apagar_publicacoes') && (
            <button type="button" onClick={() => void remove()} className="inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-xs font-semibold text-ink-muted hover:bg-status-danger-soft hover:text-status-danger">
              <Trash2 size={15} aria-hidden="true" /> Apagar pasta
            </button>
          )}
        </div>
      </div>

      {/* Destaque: aprovado pela Thereza, logo no topo, com programar / agendado / publicado */}
      {approved.length > 0 && (() => {
        // capa aprovada primeiro, depois as demais fotos da pasta (carrossel, até 20)
        const postPhotos = [...approved, ...collection.photos.filter((photo) => !photo.approved)].slice(0, 20);
        const others = postPhotos.length - approved.length;
        const when = post?.scheduledDate
          ? `${post.scheduledDate.split('-').reverse().slice(0, 2).join('/')}${post.hour !== null ? ` às ${String(post.hour).padStart(2, '0')}:00` : ''}`
          : '';
        const title =
          post?.status === 'published' ? 'Publicado no Instagram'
          : post?.status === 'scheduled' ? 'Aprovado e agendado'
          : mode === 'fotos' ? (postPhotos.length > 1 ? 'Carrossel aprovado' : 'Foto aprovada')
          : 'Capa aprovada';
        const runOnPost = async (action: () => Promise<PublishResult>, working: string) => {
          setPublishing({ state: 'working', text: working });
          setPublishing(await action());
        };
        return (
          <section aria-label={title} className="space-y-3 rounded-panel border-2 border-status-success-border bg-status-success-soft p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-semibold text-status-success">
                  <Check size={18} strokeWidth={2.5} aria-hidden="true" /> {title}
                </h3>
                <p className="mt-1 text-sm text-ink">
                  {post?.status === 'published' ? (
                    <>
                      No ar no Instagram.{' '}
                      {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="font-semibold text-brand-plum underline underline-offset-2">Ver no Instagram</a>}
                    </>
                  ) : post?.status === 'scheduled' ? (
                    `Vai para o Instagram em ${when}.`
                  ) : post?.status === 'saved' ? (
                    when
                      ? `Está no calendário para ${when}, mas ainda não foi agendado no Instagram.`
                      : 'Post criado, ainda sem data. Agende quando quiser.'
                  ) : (
                    `${approved.length === 1 ? 'Capa escolhida' : `${approved.length} capas escolhidas`}${respondedWhen ? ` em ${respondedWhen}` : ''}. Pronto para programar: a capa aprovada vai primeiro.`
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!post && team.can('criar_publicacoes') && (
                  <button
                    type="button"
                    onClick={() => void schedule(postPhotos)}
                    disabled={Boolean(preparing)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-60"
                  >
                    {preparing ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CalendarPlus size={15} aria-hidden="true" />}
                    {others > 0 ? `Programar carrossel: capa + ${others} ${others === 1 ? 'foto' : 'fotos'}` : 'Programar post com a capa'}
                  </button>
                )}
                {(post?.status === 'saved' || post?.status === 'scheduled') && team.can('editar_publicacoes') && team.can('reagendar_publicacoes') && (
                  <button
                    type="button"
                    onClick={() => void openPostEditor(post.id)}
                    disabled={openingPost}
                    className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-60"
                  >
                    {openingPost ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CalendarPlus size={15} aria-hidden="true" />}
                    {post.status === 'scheduled' ? 'Editar publicação' : 'Agendar publicação'}
                  </button>
                )}
                {post?.status === 'scheduled' && (team.can('publicar_instagram') || team.can('reagendar_publicacoes')) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Cancelar o agendamento? Não vai mais ser publicado sozinho no Instagram.')) return;
                      void runOnPost(() => cancelScheduledPublish(post.id), 'Cancelando o agendamento…');
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-control border border-status-danger-border bg-surface px-4 text-xs font-semibold text-status-danger hover:bg-status-danger-soft"
                  >
                    <XCircle size={15} aria-hidden="true" /> Cancelar agendamento
                  </button>
                )}
              </div>
            </div>
            {preparing && <p role="status" className="text-xs text-ink-muted">{preparing}</p>}
          </section>
        );
      })()}

      {/* Resposta da aprovadora (Aprovação de capa): o que ela escolheu, cortou ou acrescentou, com data, e a confirmação da equipe */}
      {mode === 'capa' && collection.responded && (
        <ApproverAnswer
          collection={collection}
          canConfirm={team.can('editar_publicacoes') || team.can('criar_publicacoes')}
          onChange={setCollection}
          onConfirm={async () => {
            const response = await fetch(`/api/capa/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.collection) setCollection(data.collection);
            else setError(data.error === 'migration_pending' ? 'Falta rodar a migração 20261118_capa_thereza.sql no Supabase para registrar a confirmação.' : 'Não foi possível confirmar as capas.');
          }}
        />
      )}

      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}

      {/* Passos 1, 2 e 3: depois que a Thereza responde, ficam juntos e fechados num só lugar (a resposta está no botão acima) */}
      <StepsGroup
        collapsed={mode === 'capa' && collection.responded}
        summary={`${collection.photos.length} ${collection.photos.length === 1 ? 'foto enviada' : 'fotos enviadas'} · link · ${approved.length} ${approved.length === 1 ? 'aprovada' : 'aprovadas'}`}
      >
      {/* 1. Todas as fotos escolhidas no Drive */}
      <section aria-labelledby="cover-all" className="space-y-3">
        <SectionTitle
          id="cover-all"
          step={1}
          title={carousel ? 'Fotos do carrossel' : 'Fotos para aprovação'}
          hint={
            carousel
              ? `${collection.photos.length} de ${limit} escolhidas no Drive${full ? ' (carrossel completo)' : ''}. Toque na ★ para marcar como capa.`
              : `${collection.photos.length} escolhidas no Drive. Todas são candidatas a capa e aparecem no link da ${APPROVER_NAME}. Toque numa foto para ver, cortar ou tirar da pasta.`
          }
        />
        {collection.photos.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma foto nesta pasta.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {collection.photos.map((photo) => (
              <PhotoTile
                key={photo.driveId}
                name={photo.name}
                src={photoSrc(photo)}
                edited={Boolean(photo.edited)}
                badge={photo.favoritedByApprover ? `Adicionada por ${APPROVER_NAME}` : undefined}
                meta={photoStamp(photo)}
                selected
                favorite={photo.favorite}
                onOpen={() => setPreview(photo)}
                onFavorite={carousel ? () => void patch({ photo: photo.driveId, favorite: !photo.favorite }) : undefined}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 2. Capas marcadas (Aprovação fotos) + link */}
      <section aria-labelledby="cover-favorites" className="space-y-3 border-t border-border pt-6">
        <SectionTitle
          id="cover-favorites"
          step={2}
          title={carousel ? 'Capas' : 'Link de aprovação'}
          hint={carousel ? 'Marcadas entre as fotos do carrossel. Só estas aparecem no link de aprovação.' : `Mande o link para a ${APPROVER_NAME}: ela vê as fotos em tela grande, corta, e aprova a seleção.`}
        />
        {!carousel ? null : favorites.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma favorita ainda. Marque a ★ nas fotos acima.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {favorites.map((photo) => (
              <PhotoTile
                key={photo.driveId}
                name={photo.name}
                src={photoSrc(photo)}
                edited={Boolean(photo.edited)}
                badge={photo.favoritedByApprover ? `Adicionada por ${APPROVER_NAME}` : undefined}
                meta={photoStamp(photo)}
                selected
                favorite
                onOpen={() => setPreview(photo)}
                onFavorite={() => void patch({ photo: photo.driveId, favorite: false })}
              />
            ))}
          </ul>
        )}
        {/* Link para a aprovadora */}
        <section className="rounded-panel border border-border bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Link2 size={16} className="text-brand-plum" aria-hidden="true" /> Link para aprovação da capa</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {carousel
                  ? `Mostra as ${favorites.length} capas marcadas. Quem abrir escolhe a capa e pode comentar, sem login.`
                  : `Mostra as ${candidates.length} fotos. Quem abrir vê cada foto grande, corta, tira o que não quiser e aprova a seleção, sem login. Você recebe uma notificação quando ela aprovar.`}
              </p>
            </div>
            {team.can('enviar_link_aprovacao') && (
              link ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
                    className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover"
                  >
                    {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Link copiado' : 'Copiar link'}
                  </button>
                  <button type="button" onClick={() => void makeLink(true)} disabled={busy} title="Gerar um link novo (o antigo para de funcionar)" aria-label="Gerar um link novo" className="flex min-h-10 min-w-10 items-center justify-center rounded-control border border-border text-ink-muted hover:bg-surface-muted disabled:opacity-50">
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void makeLink()}
                  disabled={busy || candidates.length === 0}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} Gerar link
                </button>
              )
            )}
          </div>
          {link && <p className="mt-3 break-all rounded-control bg-canvas px-3 py-2 font-mono text-[11px] text-ink-muted">{link}</p>}
          {candidates.length === 0 && <p className="mt-3 text-xs text-status-warning">{carousel ? 'Marque pelo menos uma capa (★) para gerar o link.' : 'Escolha pelo menos uma foto no Drive para gerar o link.'}</p>}
        </section>
      </section>

      {/* 3. Aprovadas pela Thereza */}
      <section aria-labelledby="cover-approved" className="space-y-3 border-t border-border pt-6">
        <SectionTitle id="cover-approved" step={3} title="Aprovadas pela Thereza" hint={approvedHint} />
        {approved.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
              {approved.map((photo) => (
                <PhotoTile
                  key={photo.driveId}
                  name={photo.name}
                  src={photoSrc(photo)}
                  edited={Boolean(photo.edited)}
                  badge={photo.favoritedByApprover ? `Adicionada por ${APPROVER_NAME}` : undefined}
                  meta={photoStamp(photo)}
                  selected
                  favorite
                  approved
                  onOpen={() => setPreview(photo)}
                  onFavorite={carousel ? () => void patch({ photo: photo.driveId, favorite: false }) : undefined}
                />
              ))}
            </ul>
          </>
        )}
        {collection.responded && collection.feedback && (
          <blockquote className="max-w-2xl border-l-2 border-status-success pl-3 text-sm leading-relaxed text-ink">&ldquo;{collection.feedback}&rdquo;</blockquote>
        )}
      </section>
      </StepsGroup>

      {/* 4. Registro: quem fez o quê e quando, para conferência */}
      <section aria-labelledby="cover-history" className="space-y-3 border-t border-border pt-6">
        <SectionTitle
          id="cover-history"
          step={4}
          title="Registro"
          hint={`Tudo o que foi feito nesta pasta, com data e hora.${collection.linkCreatedAt ? ` Link atual gerado por ${collection.linkCreatedBy ?? '—'} em ${formatStamp(collection.linkCreatedAt)}.` : ''}`}
        />
        {collection.history.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma ação registrada ainda. As próximas ações aparecem aqui.</p>
        ) : (
          <ol className="max-w-3xl divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {collection.history.map((entry) => {
              const { icon: Icon, tone, text, note } = describeActivity({
                id: entry.id,
                created_at: entry.createdAt,
                actor_label: entry.actor,
                action: entry.action,
                entity_type: 'capa',
                details: entry.details,
              });
              return (
                <li key={entry.id} className="flex gap-3 px-4 py-3">
                  <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{text}</p>
                    {note && <p className="mt-1 border-l-2 border-border pl-2 text-xs text-ink-muted">{note}</p>}
                  </div>
                  <time dateTime={entry.createdAt} className="shrink-0 text-xs tabular-nums text-ink-muted">{formatStamp(entry.createdAt)}</time>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {preview && collection.photos.some((photo) => photo.driveId === preview.driveId) && (() => {
        const photos = collection.photos;
        const index = photos.findIndex((photo) => photo.driveId === preview.driveId);
        const current = photos[index];
        return (
          <DrivePhotoViewer
            items={photos.map((photo) => ({ id: photo.driveId, name: photo.name, edited: photo.edited }))}
            index={index}
            onIndex={(i) => setPreview(photos[i])}
            onClose={() => setPreview(null)}
            favorite={current.favorite}
            onToggleFavorite={mode === 'capa' ? undefined : () => void patch({ photo: current.driveId, favorite: !current.favorite })}
            onEdited={(edited) => void patch({ photo: current.driveId, edited })}
            extraActions={
              <button
                type="button"
                onClick={() => {
                  const next = photos[index + 1] ?? photos[index - 1] ?? null;
                  void patch({ photo: current.driveId, remove: true });
                  setPreview(next);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-semibold text-ink hover:bg-status-danger-soft hover:text-status-danger"
              >
                <Trash2 size={14} aria-hidden="true" /> Tirar da pasta
              </button>
            }
          />
        );
      })()}

      {editPost && (
        <CreatePostModal
          isOpen
          approvedPost={editPost}
          allowPublishNow={team.can('publicar_instagram')}
          onClose={() => setEditPost(null)}
          onPostCreated={(postId, publishNow, saved) => {
            void (async () => {
              if (publishNow && postId) {
                setPublishing({ state: 'working', text: 'Publicando no Instagram… carrosséis podem levar alguns minutos.' });
                setPublishing(await publishToInstagram(postId));
              } else if (saved) {
                setPublishing({ state: 'scheduled', ...saved, approved: true });
              }
            })();
          }}
        />
      )}

      {publishing && (
        <PublishResultDialog result={publishing} label={label} onClose={() => { setPublishing(null); onChanged?.(); }} onOpenCalendar={onOpenCalendar} />
      )}

      {scheduleFiles && (
        <OnScreen>
          <CreatePostModal
            isOpen
            initialFiles={scheduleFiles}
            initialHouse={{ name: [collection.houseName, collection.neighborhood].filter(Boolean).join(' · '), number: collection.houseNumber }}
            initialSchedule={collection.plannedDate ? { date: collection.plannedDate, hour: collection.plannedHour } : undefined}
            onClose={() => setScheduleFiles(null)}
            allowPublishNow={team.can('publicar_instagram')}
            onPostCreated={(postId, publishNow, saved) => {
              setScheduleFiles(null);
              setScheduled(true);
              void afterPostCreated(postId, Boolean(publishNow), saved);
            }}
          />
        </OnScreen>
      )}

    </div>
  );
}


function SectionTitle({ id, step, title, hint }: { id: string; step: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink tabular-nums">{step}</span>
      <div>
        <h3 id={id} className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
      </div>
    </div>
  );
}

/** Passos 1, 2 e 3 da pasta. collapsed = a aprovação já voltou: tudo fica num bloco fechado, que abre ao clicar. */
function StepsGroup({ collapsed, summary, children }: { collapsed: boolean; summary: string; children: ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="group rounded-panel border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-panel px-4 py-3 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum [&::-webkit-details-marker]:hidden">
        <ChevronRight size={18} className="shrink-0 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Preparação e envio (passos 1, 2 e 3)</span>
          <span className="block text-xs text-ink-muted">{summary}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-ink-muted group-open:hidden">Mostrar</span>
        <span className="hidden shrink-0 text-xs font-semibold text-ink-muted group-open:inline">Esconder</span>
      </summary>
      <div className="space-y-6 border-t border-border px-4 pb-5 pt-5">{children}</div>
    </details>
  );
}

const SAVE_ERRORS: Record<string, string> = {
  drive_write_missing: 'O Google Drive está conectado só para leitura. Um administrador precisa reconectar o Drive (Desconectar → Conectar) para permitir salvar.',
  drive_not_connected: 'O acesso ao Google Drive expirou. Reconecte o Drive e tente de novo.',
  house_folder_missing: 'Não achei no Drive a pasta da casa de onde vieram as fotos.',
  not_answered: `A ${APPROVER_NAME} ainda não aprovou nenhuma capa.`,
};

function ApproverAnswer({
  collection,
  canConfirm,
  onConfirm,
  onChange,
}: {
  collection: CoverCollectionDetail;
  canConfirm: boolean;
  onConfirm: () => Promise<void>;
  onChange: (collection: CoverCollectionDetail) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  // foto aberta em tela grande (índice em `touched`), para ver antes de salvar no Drive
  const [viewing, setViewing] = useState<number | null>(null);
  // a resposta abre numa janela por cima da pasta (a página da casa já tem os passos 1, 2, 3)
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && viewing === null) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, viewing]);
  // linhas da resposta + corte refeito pela equipe (a foto continua na lista mesmo depois de recortada)
  const answerLines = (photo: CoverPhoto) => [
    ...approverLines(photo),
    ...(photo.edited && photo.editedBy && photo.editedBy !== APPROVER_LABEL && photo.editedAt
      ? [`Corte ajustado por ${photo.editedBy} em ${formatLongStamp(photo.editedAt)}`]
      : []),
  ];
  const touched = collection.photos.filter((photo) => photo.approved || approverLines(photo).length > 0);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const patchPhoto = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/capa/${collection.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok && data.collection) {
      onChange(data.collection);
      return true;
    }
    return false;
  };
  const saveCrop = async (photo: CoverPhoto, file: File, size: CropSize) => {
    setCropSaving(true);
    setCropError(null);
    try {
      const url = await uploadImage(file);
      const ok = await patchPhoto({ photo: photo.driveId, edited: { url, width: size.width, height: size.height, label: size.label } });
      if (!ok) setCropError('Não foi possível salvar o corte. Tente de novo.');
      return ok;
    } catch (error) {
      console.error('Falha ao salvar o corte:', error);
      setCropError('Não foi possível salvar o corte. Tente de novo.');
      return false;
    } finally {
      setCropSaving(false);
    }
  };
  const undoCrop = async (photo: CoverPhoto) => {
    setCropSaving(true);
    if (!(await patchPhoto({ photo: photo.driveId, edited: null }))) setCropError('Não foi possível voltar para a original.');
    setCropSaving(false);
  };
  const chosen = collection.photos.filter((photo) => photo.approved);
  // cada vez que salvou no Drive (registro da pasta), do mais recente para o mais antigo
  const savedToDrive = collection.history.filter((entry) => entry.action === SAVED_TO_DRIVE_ACTION || entry.action === CROPS_SAVED_ACTION);
  // destaque "Nova" até as capas aprovadas irem para o Drive
  const isNew = savedToDrive.length === 0;

  const saveToDrive = async () => {
    setSaving(true);
    setSaveMessage(null);
    const response = await fetch(`/api/capa/${collection.id}/drive`, { method: 'POST' }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSaving(false);
    if (response?.ok) {
      if (data.collection) onChange(data.collection);
      const failed: string[] = data.failed ?? [];
      setSaveMessage(
        failed.length
          ? { tone: 'error', text: `Pasta criada, mas ${failed.length} ${failed.length === 1 ? 'foto não foi salva' : 'fotos não foram salvas'}: ${failed.join(', ')}.` }
          : { tone: 'success', text: `Salvo no Drive na pasta “${data.folder?.name}”.` },
      );
    } else {
      setSaveMessage({ tone: 'error', text: SAVE_ERRORS[data.error] ?? 'Não foi possível salvar no Drive. Tente de novo.' });
    }
  };
  return (
    <>
      {/* Botão de destaque na pasta: abre a resposta com as fotos aprovadas e as ações */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`group flex w-full items-center gap-3 rounded-panel border-2 p-3 text-left shadow-md transition hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum sm:p-4 ${
          isNew ? 'border-amber-400 bg-status-warning-soft' : 'border-status-success-border bg-status-success-soft'
        }`}
      >
        <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${isNew ? 'bg-amber-400' : 'bg-status-success'}`}>
          {isNew ? <BellRing size={20} aria-hidden="true" /> : <Check size={20} strokeWidth={2.5} aria-hidden="true" />}
          {isNew && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-amber-500 motion-reduce:animate-none" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
            {isNew ? `A ${APPROVER_NAME} respondeu` : `Resposta da ${APPROVER_NAME}`}
            {isNew && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Nova</span>}
          </span>
          <span className="mt-0.5 block text-sm text-ink-muted">
            {chosen.length > 0 ? `${chosen.length} ${chosen.length === 1 ? 'capa aprovada' : 'capas aprovadas'}` : 'Nenhuma capa escolhida'} · {formatLongStamp(collection.respondedAt)}
            {savedToDrive.length > 0 ? ' · já salva no Drive' : ''}
          </span>
        </span>
        {/* miniaturas das aprovadas */}
        <span className="hidden shrink-0 -space-x-3 sm:flex" aria-hidden="true">
          {chosen.slice(0, 4).map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor
            <img key={photo.driveId} src={photoSrc(photo, 200)} alt="" className="h-12 w-10 rounded-control object-cover ring-2 ring-surface" />
          ))}
        </span>
        <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white group-hover:bg-brand-plum-hover">
          Ver resposta <ChevronRight size={15} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <OnScreen>
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="approver-answer"
      className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-t-panel bg-surface p-4 shadow-2xl sm:rounded-panel sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="order-last ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted sm:hidden">
            <X size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0">
          <h3 id="approver-answer" className="text-lg font-semibold text-ink">
            Resposta da {APPROVER_NAME}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            Enviada em {formatLongStamp(collection.respondedAt)}
            {chosen.length > 0 ? ` · ${chosen.length} ${chosen.length === 1 ? 'capa escolhida' : 'capas escolhidas'}` : ' · nenhuma capa escolhida'}
          </p>
          {collection.feedback && <p className="mt-2 rounded-control bg-surface-muted px-3 py-2 text-sm text-ink">&ldquo;{collection.feedback}&rdquo;</p>}
          </div>
        </div>
        {collection.confirmedAt ? (
          <p className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-status-success-soft px-3 py-1.5 text-xs font-semibold text-status-success">
            <Check size={14} strokeWidth={2.5} aria-hidden="true" /> Confirmado por {collection.confirmedBy} em {formatLongStamp(collection.confirmedAt)}
          </p>
        ) : (
          canConfirm && (
            <button
              type="button"
              disabled={chosen.length === 0 || confirming}
              onClick={async () => {
                setConfirming(true);
                await onConfirm();
                setConfirming(false);
              }}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
            >
              {confirming ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
              Confirmar capas
            </button>
          )
        )}
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted sm:flex">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {/* Salvar no Drive: sempre cria uma pasta nova "Capas aprovadas por Thereza em ..." na pasta da casa */}
      {chosen.length > 0 && (
        <div className="space-y-2 rounded-control bg-surface-muted px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-muted">
              Salve as capas aprovadas{chosen.some((photo) => photo.edited) ? ' (com os cortes)' : ''} numa pasta nova na pasta da casa no Drive, com o registro da aprovação.
            </p>
            {canConfirm && (
              <button
                type="button"
                onClick={() => void saveToDrive()}
                disabled={saving}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-4 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FolderPlus size={15} aria-hidden="true" />}
                {saving ? 'Salvando no Drive…' : savedToDrive.length ? 'Salvar de novo no Drive' : 'Salvar no Drive'}
              </button>
            )}
          </div>
          {saveMessage && (
            <p role={saveMessage.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${saveMessage.tone === 'error' ? 'text-status-danger' : 'text-status-success'}`}>
              {saveMessage.text}
            </p>
          )}
          {savedToDrive.length > 0 && (
            <ul className="space-y-1 text-xs text-ink-muted">
              {savedToDrive.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-2">
                  <span>
                    Salvo por {entry.actor} em {formatLongStamp(entry.createdAt)}
                    {typeof entry.details.pasta_drive === 'string' ? ` · “${entry.details.pasta_drive}”` : ''}
                  </span>
                  {typeof entry.details.link === 'string' && entry.details.link.startsWith('https://drive.google.com/') && (
                    <a href={entry.details.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline">
                      <FolderOpen size={13} aria-hidden="true" /> Abrir no Drive
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {touched.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {touched.map((photo, i) => (
            <li key={photo.driveId} className="flex gap-3">
              <button
                type="button"
                onClick={() => setViewing(i)}
                aria-label={`Ver ${photo.name} em tela grande`}
                className="group relative h-32 w-24 shrink-0 overflow-hidden rounded-control ring-1 ring-border transition hover:ring-2 hover:ring-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                <img src={photoSrc(photo, 400)} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100" aria-hidden="true">
                  <Maximize2 size={16} />
                </span>
              </button>
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-ink">{photo.name}</p>
                <ul className="mt-1 space-y-0.5 text-ink-muted">
                  {answerLines(photo).map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="mt-1 flex gap-3">
                  <button type="button" onClick={() => setViewing(i)} className="font-semibold text-ink underline-offset-2 hover:underline">
                    Ver foto
                  </button>
                  {canConfirm && (
                    <button type="button" onClick={() => setViewing(i)} className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline">
                      <Crop size={12} aria-hidden="true" /> Ajustar corte
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {viewing !== null && touched[viewing] && (
        <ApprovedPhotoLightbox
          photos={touched}
          index={viewing}
          onIndex={setViewing}
          onClose={() => {
            setViewing(null);
            setCropError(null);
          }}
          details={answerLines}
          onSaveCrop={canConfirm ? saveCrop : undefined}
          onUndoCrop={canConfirm ? undoCrop : undefined}
          saving={cropSaving}
          error={cropError}
        />
      )}
    </section>
          </div>
        </OnScreen>
      )}
    </>
  );
}
