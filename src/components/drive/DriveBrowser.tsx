'use client';

import { OnScreen } from '@/components/drive/OnScreen';
import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Crop, Folder, FolderInput, HardDrive, Loader2, RefreshCw, Star, Users, X } from 'lucide-react';
import type { DriveEntry } from '@/app/api/drive/list/route';
import type { CoverCollectionDetail, CoverCollectionSummary, EditedImage } from '@/lib/covers';
import { DrivePhotoViewer } from '@/components/drive/DrivePhotoViewer';
import { coverFolderLabel, guessHouseFromFileName } from '@/lib/house';

// Navegação no Google Drive: escolher fotos (✓) e favoritar para capa (★); depois salvar numa pasta de casa.

type Source = 'root' | 'shared' | 'drives';
const SOURCES: { key: Source; label: string; icon: typeof HardDrive }[] = [
  { key: 'root', label: 'Meu Drive', icon: HardDrive },
  { key: 'shared', label: 'Compartilhados comigo', icon: Users },
  { key: 'drives', label: 'Drives compartilhados', icon: Folder },
];

interface Crumb { id: string; name: string }

export const driveThumb = (id: string, size = 400) => `/api/drive/thumb/${encodeURIComponent(id)}?s=${size}`;

export function DriveBrowser({
  collections,
  target,
  onSaved,
  onNotConnected,
}: {
  collections: CoverCollectionSummary[];
  /** Pasta de casa já escolhida (ao vir de "Adicionar fotos do Drive"). */
  target: CoverCollectionSummary | null;
  onSaved: (collection: CoverCollectionDetail) => void;
  onNotConnected: () => void;
}) {
  const [source, setSource] = useState<Source>('root');
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<DriveEntry[] | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [listError, setListError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Map<string, DriveEntry>>(new Map());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DriveEntry | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  // cortes feitos no editor antes de salvar na pasta (id do Drive → imagem cortada no R2)
  const [edits, setEdits] = useState<Map<string, EditedImage>>(new Map());

  const folderId = path.length ? path[path.length - 1].id : source;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/drive/list?folder=${encodeURIComponent(folderId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) return onNotConnected();
        if (!response.ok) throw new Error(data.error ?? String(response.status));
        setEntries(data.entries);
        setNextPage(data.nextPage);
        setListError('');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error('Falha ao abrir a pasta do Drive:', error);
        setEntries([]);
        setListError('Não foi possível abrir esta pasta. Tente de novo.');
      });
    return () => controller.abort();
  }, [folderId, onNotConnected]);

  const openFolder = (entry: DriveEntry) => {
    setEntries(null);
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
  };
  const goTo = (depth: number) => {
    if (depth === path.length) return;
    setEntries(null);
    setPath((current) => current.slice(0, depth));
  };
  const changeSource = (next: Source) => {
    if (next === source && path.length === 0) return;
    setEntries(null);
    setSource(next);
    setPath([]);
  };

  const loadMore = async () => {
    if (!nextPage) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/drive/list?folder=${encodeURIComponent(folderId)}&page=${encodeURIComponent(nextPage)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEntries((current) => [...(current ?? []), ...data.entries]);
      setNextPage(data.nextPage);
    } catch {
      setListError('Não foi possível carregar o restante da pasta.');
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleSelected = (entry: DriveEntry) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.set(entry.id, entry);
      return next;
    });
    // tirar da seleção também tira a estrela
    setFavorites((current) => {
      if (!current.has(entry.id) || !selected.has(entry.id)) return current;
      const next = new Set(current);
      next.delete(entry.id);
      return next;
    });
  };

  const toggleFavorite = (entry: DriveEntry) => {
    setSelected((current) => (current.has(entry.id) ? current : new Map(current).set(entry.id, entry)));
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  };

  const images = entries?.filter((entry) => entry.kind === 'image') ?? [];
  const folders = entries?.filter((entry) => entry.kind === 'folder') ?? [];
  const sourceLabel = SOURCES.find((item) => item.key === source)?.label ?? '';
  const allChosen = images.length > 0 && images.every((entry) => selected.has(entry.id));

  return (
    <div className="space-y-5 pb-28">
      {target && (
        <p className="rounded-control border border-status-info-border bg-status-info-soft px-4 py-3 text-sm text-status-info">
          Adicionando fotos em <strong>{coverFolderLabel(target.houseName, target.neighborhood, target.houseNumber)}</strong>.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Origem das pastas">
        {SOURCES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === source}
            onClick={() => changeSource(key)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
              key === source ? 'border-brand-plum bg-brand-plum text-white' : 'border-border bg-surface text-ink hover:bg-surface-muted'
            }`}
          >
            <Icon size={14} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Caminho da pasta" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          {path.length > 0 && (
            <button type="button" onClick={() => goTo(path.length - 1)} aria-label="Voltar uma pasta" className="mr-1 flex h-8 w-8 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={() => goTo(0)} className={`rounded px-1.5 py-1 ${path.length === 0 ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'}`}>{sourceLabel}</button>
          {path.map((crumb, index) => (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight size={14} className="shrink-0 text-ink-muted" aria-hidden="true" />
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                aria-current={index === path.length - 1 ? 'page' : undefined}
                className={`max-w-[16rem] truncate rounded px-1.5 py-1 ${index === path.length - 1 ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        {images.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setSelected((current) => {
                const next = new Map(current);
                for (const entry of images) {
                  if (allChosen) next.delete(entry.id);
                  else next.set(entry.id, entry);
                }
                return next;
              })
            }
            className="min-h-9 rounded-control px-3 text-xs font-semibold text-brand-plum hover:bg-surface-muted"
          >
            {allChosen ? 'Desmarcar todas desta pasta' : `Escolher todas (${images.length})`}
          </button>
        )}
      </div>

      {entries === null ? (
        <p className="flex items-center gap-2 py-12 text-sm text-ink-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Abrindo pasta…</p>
      ) : (
        <>
          {listError && <p role="alert" className="text-sm text-status-danger">{listError}</p>}

          {folders.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {folders.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openFolder(entry)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-control border border-border bg-surface px-3 text-left text-sm font-medium text-ink transition-colors hover:border-brand-plum/40 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    <Folder size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                    <span className="min-w-0 truncate">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {images.map((entry) => (
                <PhotoTile
                  key={entry.id}
                  name={entry.name}
                  src={edits.get(entry.id)?.url ?? driveThumb(entry.id)}
                  edited={edits.has(entry.id)}
                  selected={selected.has(entry.id)}
                  favorite={favorites.has(entry.id)}
                  onOpen={() => setPreview(entry)}
                  onSelect={() => toggleSelected(entry)}
                  onFavorite={() => toggleFavorite(entry)}
                />
              ))}
            </ul>
          )}

          {nextPage && (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-4 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-60">
              {loadingMore ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />} Carregar mais
            </button>
          )}

          {!listError && folders.length === 0 && images.length === 0 && <p className="py-12 text-sm text-ink-muted">Nenhuma pasta ou foto aqui.</p>}
        </>
      )}

      {selected.size > 0 && (
        <OnScreen>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3">
            <ul className="hidden min-w-0 flex-1 gap-2 overflow-x-auto sm:flex" aria-label="Fotos escolhidas">
              {[...selected.values()].map((entry) => (
                <li key={entry.id} className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor */}
                  <img src={edits.get(entry.id)?.url ?? driveThumb(entry.id, 200)} alt={entry.name} className="h-full w-full object-cover" />
                  {favorites.has(entry.id) && <Star size={12} fill="currentColor" className="absolute right-0.5 top-0.5 text-amber-400" aria-label="Favorita para capa" />}
                </li>
              ))}
            </ul>
            <p className="min-w-0 flex-1 text-xs text-ink-muted sm:flex-none sm:text-right">
              <span className="block font-semibold text-ink">{selected.size} {selected.size === 1 ? 'foto escolhida' : 'fotos escolhidas'}</span>
              {favorites.size} {favorites.size === 1 ? 'favorita' : 'favoritas'} para capa
            </p>
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-sm font-semibold text-white hover:bg-brand-plum-hover"
            >
              <FolderInput size={16} aria-hidden="true" /> {target ? 'Salvar na pasta' : 'Salvar na pasta da casa'}
            </button>
          </div>
        </div>
        </OnScreen>
      )}

      {preview && images.some((entry) => entry.id === preview.id) && (
        <DrivePhotoViewer
          items={images.map((entry) => ({ id: entry.id, name: entry.name, edited: edits.get(entry.id) ?? null }))}
          index={images.findIndex((entry) => entry.id === preview.id)}
          onIndex={(i) => setPreview(images[i])}
          onClose={() => setPreview(null)}
          selected={selected.has(preview.id)}
          favorite={favorites.has(preview.id)}
          onToggleSelect={() => toggleSelected(preview)}
          onToggleFavorite={() => toggleFavorite(preview)}
          onEdited={(edited) => {
            setEdits((current) => {
              const next = new Map(current);
              if (edited) next.set(preview.id, edited);
              else next.delete(preview.id);
              return next;
            });
            // foto cortada já entra na seleção
            if (edited) setSelected((current) => (current.has(preview.id) ? current : new Map(current).set(preview.id, preview)));
          }}
        />
      )}

      {saveOpen && (
        <OnScreen>
        <SaveDialog
          collections={collections}
          target={target}
          guessFrom={path.length ? path[path.length - 1].name : ''}
          photos={[...selected.values()].map((entry) => ({ id: entry.id, name: entry.name, width: entry.width, height: entry.height, favorite: favorites.has(entry.id), edited: edits.get(entry.id) }))}
          onClose={() => setSaveOpen(false)}
          onSaved={(collection) => {
            setSaveOpen(false);
            setSelected(new Map());
            setFavorites(new Set());
            setEdits(new Map());
            onSaved(collection);
          }}
        />
        </OnScreen>
      )}

    </div>
  );
}

export function PhotoTile({
  name,
  src,
  selected,
  favorite,
  approved = false,
  edited = false,
  onOpen,
  onSelect,
  onFavorite,
  selectLabel,
}: {
  name: string;
  src: string;
  selected: boolean;
  favorite: boolean;
  approved?: boolean;
  edited?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
  onFavorite: () => void;
  selectLabel?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver ${name} em tamanho grande`}
        className={`relative block aspect-[3/4] w-full overflow-hidden rounded-control bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
          selected && onSelect ? 'ring-[3px] ring-brand-plum' : ''
        }`}
      >
        {broken ? (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] leading-snug text-ink-muted">
            Sem prévia no Google Drive
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
        {edited && !approved && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Crop size={11} aria-hidden="true" /> Cortada
          </span>
        )}
        {approved && (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-status-success px-2 py-1 text-center text-[11px] font-semibold text-white">Capa aprovada</span>
        )}
      </button>
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={selectLabel ?? (selected ? `Tirar ${name} da seleção` : `Escolher ${name}`)}
          className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm transition-colors ${
            selected ? 'border-white bg-brand-plum text-white' : 'border-white/90 bg-black/25 text-transparent hover:bg-black/40'
          }`}
        >
          <Check size={15} strokeWidth={3} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `Tirar ${name} das favoritas para capa` : `Favoritar ${name} para capa`}
        title="Favorita para capa"
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors ${
          favorite ? 'bg-amber-400 text-white' : 'bg-black/25 text-white hover:bg-black/40'
        }`}
      >
        <Star size={15} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      <p className="mt-1.5 truncate text-[11px] text-ink-muted" title={name}>{name}</p>
    </li>
  );
}

function SaveDialog({
  collections,
  target,
  guessFrom,
  photos,
  onClose,
  onSaved,
}: {
  collections: CoverCollectionSummary[];
  target: CoverCollectionSummary | null;
  guessFrom: string;
  photos: { id: string; name: string; width?: number; height?: number; favorite: boolean; edited?: EditedImage }[];
  onClose: () => void;
  onSaved: (collection: CoverCollectionDetail) => void;
}) {
  // nome e número sugeridos pelo nome da pasta do Drive (ex.: "Casa 110 Vila dos Coqueiros")
  const guess = guessHouseFromFileName(guessFrom);
  const [mode, setMode] = useState<'new' | 'existing'>(target || (collections.length && !guess.number && !guess.name) ? 'existing' : 'new');
  const [collectionId, setCollectionId] = useState<number>(target?.id ?? collections[0]?.id ?? 0);
  const [houseName, setHouseName] = useState(guess.name);
  const [neighborhood, setNeighborhood] = useState('');
  const [houseNumber, setHouseNumber] = useState(guess.number);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (mode === 'new' && !houseName.trim() && !houseNumber.trim()) {
      setError('Informe o nome ou o número da casa.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/capa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'existing' ? { collectionId, photos } : { houseName, neighborhood, houseNumber, photos }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.collection) throw new Error(data.error ?? String(response.status));
      onSaved(data.collection);
    } catch (saveError) {
      console.error('Falha ao salvar as fotos na pasta:', saveError);
      setError('Não foi possível salvar. Confira se a migração das pastas de capa foi rodada e tente de novo.');
      setSaving(false);
    }
  };

  const input = 'min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum';

  return (
    <div
      onPointerDown={(event) => event.target === event.currentTarget && !saving && onClose()}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="save-cover-title" className="w-full max-w-md space-y-5 rounded-t-panel bg-surface p-5 sm:rounded-panel sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="save-cover-title" className="text-base font-semibold text-ink">Salvar na pasta da casa</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}, {photos.filter((photo) => photo.favorite).length} favoritas para capa.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {collections.length > 0 && !target && (
          <div role="radiogroup" aria-label="Pasta" className="grid grid-cols-2 gap-1 rounded-control bg-canvas p-1">
            {(['new', 'existing'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => setMode(option)}
                className={`min-h-9 rounded-[6px] text-xs font-semibold ${mode === option ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'}`}
              >
                {option === 'new' ? 'Nova pasta' : 'Pasta existente'}
              </button>
            ))}
          </div>
        )}

        {mode === 'existing' ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink">Pasta</span>
            <select value={collectionId} onChange={(event) => setCollectionId(Number(event.target.value))} disabled={Boolean(target)} className={input}>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{coverFolderLabel(collection.houseName, collection.neighborhood, collection.houseNumber)}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-ink">Nome da casa</span>
                <input value={houseName} onChange={(event) => setHouseName(event.target.value)} placeholder="Ex.: Casa Jacarandá" className={input} autoFocus />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-ink">Número</span>
                <input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} inputMode="numeric" placeholder="110" className={`${input} tabular-nums`} />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-ink">Bairro</span>
              <input value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} placeholder="Ex.: Vila dos Coqueiros" className={input} />
            </label>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-control px-4 text-sm font-semibold text-ink-muted hover:bg-surface-muted">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-control bg-brand-plum px-5 text-sm font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-60">
            {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
