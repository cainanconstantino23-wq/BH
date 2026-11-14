'use client';

import { OnScreen } from '@/components/drive/OnScreen';
import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Check, ChevronLeft, Copy, FolderOpen, FolderPlus, Link2, Loader2, RefreshCw, Trash2, Unplug } from 'lucide-react';
import type { CoverCollectionDetail, CoverCollectionSummary, CoverPhoto } from '@/lib/covers';
import { coverFolderLabel } from '@/lib/house';
import { useTeam } from '@/lib/team';
import { DriveBrowser, PhotoTile, driveThumb } from '@/components/drive/DriveBrowser';
import { DrivePhotoViewer } from '@/components/drive/DrivePhotoViewer';
import CreatePostModal from '@/components/CreatePostModal';

const photoSrc = (photo: CoverPhoto, size = 400) => photo.edited?.url ?? driveThumb(photo.driveId, size);

// Aprovação de capa: o social media escolhe no Google Drive as fotos do feed/story e favorita candidatas a capa;
// as fotos ficam em pastas por casa; um link mostra só as favoritas para a aprovadora escolher a capa.

type Status =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; configured: boolean; connected: boolean; expired?: boolean; email?: string | null; canConnect: boolean };

type View = { name: 'folders' } | { name: 'drive'; target: CoverCollectionSummary | null } | { name: 'folder'; id: number };

export function CoverApprovalPanel({ notice }: { notice?: { tone: 'success' | 'error'; text: string } | null }) {
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
      fetch('/api/capa', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          setCollections((await response.json()).collections);
          setCollectionsError(false);
        })
        .catch(() => {
          setCollections([]);
          setCollectionsError(true);
        }),
    [],
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
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">Aprovação de capa</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">Fotos do Google Drive separadas por casa, com as favoritas para a capa do feed.</p>
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

      <HowItWorks />

      {notice && (
        <p role="status" className={`rounded-control border px-4 py-3 text-sm ${notice.tone === 'success' ? 'border-status-success-border bg-status-success-soft text-status-success' : 'border-status-danger-border bg-status-danger-soft text-status-danger'}`}>
          {notice.text}
        </p>
      )}

      {status.state === 'ready' && !status.connected && <ConnectCard status={status} />}
      {status.state === 'error' && (
        <p className="text-sm text-ink">
          Não foi possível verificar a conexão com o Drive.{' '}
          <button type="button" onClick={() => void loadStatus()} className="font-semibold text-brand-plum underline underline-offset-2">Tentar de novo</button>
        </p>
      )}

      {view.name === 'folders' && (
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

      {view.name === 'folder' && (
        <FolderDetail
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

function HowItWorks() {
  const steps = [
    { title: 'Escolha no Drive', text: 'O social media abre as pastas do Google Drive e escolhe as fotos do feed e do story. Ex.: de 50 fotos, separa 15.' },
    { title: 'Favorite a capa', text: 'Entre as escolhidas, marque com ★ as candidatas a capa. Tudo fica numa pasta por casa: nome, bairro e número.' },
    { title: 'Envie o link', text: 'Gere o link da pasta e mande para a Thereza. Ela vê só as favoritas e escolhe a capa. A resposta aparece aqui.' },
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

function ConnectCard({ status }: { status: Extract<Status, { state: 'ready' }> }) {
  return (
    <section className="flex max-w-xl flex-col gap-3 rounded-panel border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-ink">{status.expired ? 'Reconecte o Google Drive' : 'Conecte o Google Drive'}</h2>
      <p className="text-sm leading-relaxed text-ink-muted">
        {!status.configured
          ? 'Falta configurar as credenciais do Google no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).'
          : status.expired
            ? 'O acesso ao Drive expirou ou foi removido. Conecte de novo para continuar escolhendo fotos.'
            : 'Para escolher fotos, conecte o Drive. O BH Analytics só lê: não altera, não apaga e não envia nada. A conexão vale para toda a equipe.'}
      </p>
      {status.configured && status.canConnect && (
        <a href="/api/auth/google/login" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control bg-brand-plum px-4 text-sm font-semibold text-white hover:bg-brand-plum-hover">
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
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {collections.map((collection) => (
            <li key={collection.id}>
              <button
                type="button"
                onClick={() => onOpen(collection.id)}
                className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-plum"
              >
                <div className="relative aspect-square overflow-hidden rounded-panel border border-border bg-surface-muted">
                  {collection.coverDriveId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor
                    <img src={collection.coverEditedUrl ?? driveThumb(collection.coverDriveId, 500)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <FolderOpen size={32} className="absolute inset-0 m-auto text-ink-muted" aria-hidden="true" />
                  )}
                  {collection.responded ? (
                    <span className="absolute left-2 top-2 rounded-full bg-status-success px-2 py-0.5 text-[11px] font-semibold text-white">
                      {collection.approvedCount ? 'Capa escolhida' : 'Respondido'}
                    </span>
                  ) : collection.shareToken ? (
                    <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-semibold text-ink">Aguardando</span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                  {coverFolderLabel(collection.houseName, collection.neighborhood, collection.houseNumber) || 'Sem nome'}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {collection.photoCount} {collection.photoCount === 1 ? 'foto' : 'fotos'} · {collection.favoriteCount} ★
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FolderDetail({
  id,
  canAddFromDrive,
  onBack,
  onAddFromDrive,
}: {
  id: number;
  canAddFromDrive: boolean;
  onBack: () => void;
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
  const [publishing, setPublishing] = useState<
    | { state: 'working'; text: string }
    | { state: 'done'; permalink: string | null }
    | { state: 'processing' }
    | { state: 'error'; text: string }
    | null
  >(null);

  const afterPostCreated = async (postId: number | undefined, publishNow: boolean) => {
    if (!postId) return;
    setPublishing(publishNow ? { state: 'working', text: 'Marcando como aprovado…' } : null);
    // capa aprovada pela Thereza: o post já entra como aprovado (o servidor confere)
    const approve = await fetch(`/api/capa/${id}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    }).catch(() => null);
    if (!approve?.ok) {
      const text = 'O post foi salvo, mas não foi possível marcar como aprovado. Aprove na aba Aprovação e publique pela Grade do feed.';
      if (publishNow) setPublishing({ state: 'error', text });
      else setError(text);
      return;
    }
    if (!publishNow) return;

    setPublishing({ state: 'working', text: 'Publicando no Instagram… vídeos e carrosséis podem levar alguns minutos.' });
    try {
      const response = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      const result = (await response.json().catch(() => ({}))) as { status?: string; message?: string; permalink?: string | null };
      if (result.status === 'published') setPublishing({ state: 'done', permalink: result.permalink ?? null });
      else if (result.status === 'processing') setPublishing({ state: 'processing' });
      else setPublishing({ state: 'error', text: result.message ?? 'Não foi possível publicar.' });
    } catch {
      setPublishing({ state: 'error', text: 'Sem conexão com o servidor. O post ficou salvo e aprovado: publique pela Grade do feed.' });
    }
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
  const approved = collection.photos.filter((photo) => photo.approved);
  const respondedWhen = collection.respondedAt
    ? new Date(collection.respondedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const approvedHint = scheduled
    ? 'Post salvo e aprovado. Ele aparece no calendário e na Grade do feed (lá também dá para publicar).'
    : !collection.responded
      ? link ? 'Aguardando a escolha pelo link.' : 'Gere o link nas favoritas e envie para a Thereza.'
      : approved.length === 0
        ? `Respondido${respondedWhen ? ` em ${respondedWhen}` : ''}, sem capa escolhida.`
        : `${approved.length === 1 ? 'Capa escolhida' : `${approved.length} capas escolhidas`}${respondedWhen ? ` em ${respondedWhen}` : ''}. Já dá para programar o post.`;
  const label = coverFolderLabel(collection.houseName, collection.neighborhood, collection.houseNumber) || 'Sem nome';

  return (
    <div className="space-y-6">
      <BackLink label="Voltar para as pastas" onClick={onBack} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">{label}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {collection.photos.length} {collection.photos.length === 1 ? 'foto escolhida' : 'fotos escolhidas'} · {favorites.length} {favorites.length === 1 ? 'favorita' : 'favoritas'} para capa
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAddFromDrive && (
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

      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}

      {/* 1. Todas as fotos escolhidas no Drive */}
      <section aria-labelledby="cover-all" className="space-y-3">
        <SectionTitle id="cover-all" step={1} title="Todas as fotos" hint={`${collection.photos.length} escolhidas no Drive. Toque na ★ para favoritar como capa.`} />
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
                selected
                favorite={photo.favorite}
                onOpen={() => setPreview(photo)}
                onFavorite={() => void patch({ photo: photo.driveId, favorite: !photo.favorite })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 2. Favoritas do Social Media + link */}
      <section aria-labelledby="cover-favorites" className="space-y-3 border-t border-border pt-6">
        <SectionTitle
          id="cover-favorites"
          step={2}
          title="Favoritas para capa"
          hint="Escolhidas pelo Social Media. Só estas aparecem no link de aprovação."
        />
        {favorites.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma favorita ainda. Marque a ★ nas fotos acima.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {favorites.map((photo) => (
              <PhotoTile
                key={photo.driveId}
                name={photo.name}
                src={photoSrc(photo)}
                edited={Boolean(photo.edited)}
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
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">Mostra só as {favorites.length} favoritas. Quem abrir escolhe a capa e pode comentar, sem login.</p>
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
                  disabled={busy || favorites.length === 0}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} Gerar link
                </button>
              )
            )}
          </div>
          {link && <p className="mt-3 break-all rounded-control bg-canvas px-3 py-2 font-mono text-[11px] text-ink-muted">{link}</p>}
          {favorites.length === 0 && <p className="mt-3 text-xs text-status-warning">Favorite pelo menos uma foto (★) para gerar o link.</p>}
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
                  selected
                  favorite
                  approved
                  onOpen={() => setPreview(photo)}
                  onFavorite={() => void patch({ photo: photo.driveId, favorite: false })}
                />
              ))}
            </ul>
          </>
        )}
        {collection.responded && collection.feedback && (
          <blockquote className="max-w-2xl border-l-2 border-status-success pl-3 text-sm leading-relaxed text-ink">&ldquo;{collection.feedback}&rdquo;</blockquote>
        )}
        {approved.length > 0 && team.can('criar_publicacoes') && (
          <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Programar ou publicar o post</p>
              <p className="mt-0.5 text-xs text-ink-muted">Abre o Programar Post com a casa e as fotos (capa aprovada primeiro). Lá você escolhe Agendar ou Publicar agora no Instagram.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void schedule(approved)}
                disabled={Boolean(preparing)}
                className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-3.5 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
              >
                <CalendarPlus size={15} aria-hidden="true" /> Só a capa
              </button>
              {collection.photos.length > approved.length && (
                <button
                  type="button"
                  onClick={() => void schedule([...approved, ...collection.photos.filter((photo) => !photo.approved)].slice(0, 20))}
                  disabled={Boolean(preparing)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-60"
                >
                  {preparing ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CalendarPlus size={15} aria-hidden="true" />}
                  Carrossel: capa + {Math.min(collection.photos.length, 20) - approved.length} fotos
                </button>
              )}
            </div>
          </div>
        )}
        {preparing && <p role="status" className="text-xs text-ink-muted">{preparing}</p>}
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
            onToggleFavorite={() => void patch({ photo: current.driveId, favorite: !current.favorite })}
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

      {publishing && (
        <OnScreen>
          <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${publishing.state === 'working' ? 'bg-ink/40' : 'bg-ink/30'}`}>
            <div role="status" aria-live="assertive" className="toast-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-panel bg-surface px-7 py-6 text-center shadow-2xl">
              {publishing.state === 'working' && (
                <>
                  <Loader2 size={30} className="animate-spin text-brand-plum motion-reduce:animate-none" aria-hidden="true" />
                  <p className="text-sm font-semibold text-ink">{publishing.text}</p>
                </>
              )}
              {publishing.state === 'done' && (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-success text-white"><Check size={26} strokeWidth={3} aria-hidden="true" /></span>
                  <p className="text-base font-semibold text-ink">Publicado no Instagram</p>
                  {publishing.permalink && (
                    <a href={publishing.permalink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-plum underline underline-offset-2">Ver o post</a>
                  )}
                </>
              )}
              {publishing.state === 'processing' && (
                <p className="text-sm text-ink">O Instagram ainda está processando a mídia. Abra o post na <strong>Grade do feed</strong> em instantes e clique em <strong>Concluir publicação</strong>.</p>
              )}
              {publishing.state === 'error' && (
                <>
                  <p className="text-base font-semibold text-ink">Não foi possível publicar</p>
                  <p className="text-sm leading-relaxed text-ink-muted">{publishing.text}</p>
                </>
              )}
              {publishing.state !== 'working' && (
                <button type="button" autoFocus onClick={() => setPublishing(null)} className="mt-1 min-h-10 rounded-control bg-brand-plum px-5 text-sm font-semibold text-white hover:bg-brand-plum-hover">
                  OK
                </button>
              )}
            </div>
          </div>
        </OnScreen>
      )}

      {scheduleFiles && (
        <OnScreen>
          <CreatePostModal
            isOpen
            initialFiles={scheduleFiles}
            initialHouse={{ name: [collection.houseName, collection.neighborhood].filter(Boolean).join(' · '), number: collection.houseNumber }}
            onClose={() => setScheduleFiles(null)}
            allowPublishNow={team.can('publicar_instagram')}
            onPostCreated={(postId, publishNow) => {
              setScheduleFiles(null);
              setScheduled(true);
              void afterPostCreated(postId, Boolean(publishNow));
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
