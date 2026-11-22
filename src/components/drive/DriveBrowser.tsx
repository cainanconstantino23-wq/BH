'use client';

import { OnScreen } from '@/components/drive/OnScreen';
import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Crop, Folder, FolderInput, Loader2, Plus, RefreshCw, Search, Star, Users, X } from 'lucide-react';
import type { DriveFolderHit } from '@/app/api/drive/search/route';
import type { DriveEntry } from '@/app/api/drive/list/route';
import { photoLimit, type CollectionKind, type CoverCollectionDetail, type CoverCollectionSummary, type EditedImage } from '@/lib/covers';
import { DrivePhotoViewer } from '@/components/drive/DrivePhotoViewer';
import { DEFAULT_NEIGHBORHOODS, coverFolderLabel, guessHouseFromFileName, neighborhoodOptions } from '@/lib/house';

// Navegação no Google Drive: escolher fotos (✓); depois salvar numa pasta de casa.
// Aprovação de capa (mode 'capa'): toda foto escolhida é candidata a capa (sem ★).
// Aprovação fotos (mode 'fotos'): no máximo 15 fotos (as do carrossel) e, entre elas, as capas marcadas com ★.

// só "Compartilhados comigo": Meu Drive e drives compartilhados bloqueados (src/lib/google/driveAccess.ts)
type Source = 'shared';
const SOURCES: { key: Source; label: string; icon: typeof Users }[] = [{ key: 'shared', label: 'Compartilhados comigo', icon: Users }];

interface Crumb { id: string; name: string }

export const driveThumb = (id: string, size = 400) => `/api/drive/thumb/${encodeURIComponent(id)}?s=${size}`;

export function DriveBrowser({
  mode = 'capa',
  collections,
  target,
  onSaved,
  onNotConnected,
}: {
  mode?: CollectionKind;
  collections: CoverCollectionSummary[];
  /** Pasta de casa já escolhida (ao vir de "Adicionar fotos do Drive"). */
  target: CoverCollectionSummary | null;
  onSaved: (collection: CoverCollectionDetail) => void;
  onNotConnected: () => void;
}) {
  const source: Source = 'shared';
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
  // busca em tudo de "Compartilhados comigo": pastas e fotos pelo nome
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ folders: DriveFolderHit[]; images: DriveEntry[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const isSearch = query.trim().length >= 2;

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/drive/search?tudo=1&q=${encodeURIComponent(text)}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          setHits(response.ok ? { folders: data.folders ?? [], images: data.images ?? [] } : { folders: [], images: [] });
        })
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setSearching(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const folderId = path.length ? path[path.length - 1].id : source;
  const limit = photoLimit(mode);
  // vagas que sobram na pasta da casa (ao adicionar numa pasta que já tem fotos)
  const room = limit === null ? Infinity : Math.max(0, limit - (target?.photoCount ?? 0));
  const [limitNotice, setLimitNotice] = useState(false);
  const isFull = (current: Map<string, DriveEntry>) => current.size >= room;

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
    if (isSearch) {
      // resultado da busca: abre a pasta direto (caminho a partir de "Compartilhados comigo")
      const hit = hits?.folders.find((row) => row.id === entry.id);
      setQuery('');
      setHits(null);
      setEntries(null);
      setPath([{ id: entry.id, name: hit?.name ?? entry.name }]);
      return;
    }
    setEntries(null);
    setPath((current) => [...current, { id: entry.id, name: entry.name }]);
  };
  const goTo = (depth: number) => {
    if (depth === path.length) return;
    setEntries(null);
    setPath((current) => current.slice(0, depth));
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
    if (!selected.has(entry.id) && isFull(selected)) {
      setLimitNotice(true);
      return;
    }
    setLimitNotice(false);
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
    if (!selected.has(entry.id) && isFull(selected)) {
      setLimitNotice(true);
      return;
    }
    setSelected((current) => (current.has(entry.id) ? current : new Map(current).set(entry.id, entry)));
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  };

  const images = isSearch ? hits?.images ?? [] : entries?.filter((entry) => entry.kind === 'image') ?? [];
  const folders: DriveEntry[] = isSearch
    ? (hits?.folders ?? []).map((hit) => ({ id: hit.id, name: hit.parentName ? `${hit.name} — em ${hit.parentName}` : hit.name, kind: 'folder' }))
    : entries?.filter((entry) => entry.kind === 'folder') ?? [];
  const sourceLabel = SOURCES.find((item) => item.key === source)?.label ?? '';
  const allChosen = images.length > 0 && images.every((entry) => selected.has(entry.id));
  const carousel = mode === 'fotos';

  return (
    <div className="space-y-5 pb-28">
      {target && (
        <p className="rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-info-line,#ccd7e4)] bg-[var(--g-info-soft,#edf2f8)] px-4 py-3 text-sm text-[var(--g-info,#40556f)]">
          Adicionando fotos em <strong>{coverFolderLabel(target.houseName, target.neighborhood, target.houseNumber)}</strong>.
          {limit !== null && ` Cabem mais ${room} de ${limit} fotos no carrossel.`}
        </p>
      )}
      {carousel && !target && (
        <p className="text-sm text-[var(--g-fg3,#746e68)]">
          Abra a pasta da casa no Drive, marque com ✓ as {limit} fotos do carrossel e, entre elas, marque com ★ as capas.
        </p>
      )}
      {limitNotice && (
        <p role="alert" className="rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-warning-line,#f0d99f)] bg-[var(--g-warning-soft,#fff5dc)] px-4 py-3 text-sm text-[var(--g-warning,#825310)]">
          O carrossel já tem {limit} fotos. Tire uma da seleção para escolher outra.
        </p>
      )}

      <label className="relative block max-w-xl">
        <span className="sr-only">Buscar no Drive</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--g-fg3,#746e68)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value.trim().length < 2) setHits(null);
          }}
          placeholder="Buscar pastas e fotos em Compartilhados comigo"
          className="min-h-11 w-full rounded-full border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] pl-10 pr-10 text-sm text-[var(--g-fg,#302d34)] placeholder:text-[var(--g-fg3,#746e68)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--g-accent,#231b2d)]"
        />
        {searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-[var(--g-fg3,#746e68)]" aria-label="Buscando" />}
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isSearch ? (
          <p className="text-sm font-semibold text-[var(--g-fg,#302d34)]">
            {hits === null ? 'Buscando…' : `${hits.folders.length} ${hits.folders.length === 1 ? 'pasta' : 'pastas'} e ${hits.images.length} ${hits.images.length === 1 ? 'foto' : 'fotos'} com “${query.trim()}”`}
          </p>
        ) : (
        <nav aria-label="Caminho da pasta" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          {path.length > 0 && (
            <button type="button" onClick={() => goTo(path.length - 1)} aria-label="Voltar uma pasta" className="mr-1 flex h-8 w-8 items-center justify-center rounded-[var(--g-r-control,0.75rem)] text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-fill,#f3f0e9)] hover:text-[var(--g-fg,#302d34)]">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={() => goTo(0)} className={`rounded px-1.5 py-1 ${path.length === 0 ? 'font-semibold text-[var(--g-fg,#302d34)]' : 'text-[var(--g-fg3,#746e68)] hover:text-[var(--g-fg,#302d34)]'}`}>{sourceLabel}</button>
          {path.map((crumb, index) => (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight size={14} className="shrink-0 text-[var(--g-fg3,#746e68)]" aria-hidden="true" />
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                aria-current={index === path.length - 1 ? 'page' : undefined}
                className={`max-w-[16rem] truncate rounded px-1.5 py-1 ${index === path.length - 1 ? 'font-semibold text-[var(--g-fg,#302d34)]' : 'text-[var(--g-fg3,#746e68)] hover:text-[var(--g-fg,#302d34)]'}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        )}
        {images.length > 0 && (allChosen || selected.size + images.filter((entry) => !selected.has(entry.id)).length <= room) && (
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
            className="min-h-9 rounded-[var(--g-r-control,0.75rem)] px-3 text-xs font-semibold text-[var(--g-accent,#231b2d)] hover:bg-[var(--g-fill,#f3f0e9)]"
          >
            {allChosen ? 'Desmarcar todas desta pasta' : `Escolher todas (${images.length})`}
          </button>
        )}
      </div>

      {!isSearch && entries === null ? (
        <p className="flex items-center gap-2 py-12 text-sm text-[var(--g-fg3,#746e68)]"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Abrindo pasta…</p>
      ) : (
        <>
          {listError && <p role="alert" className="text-sm text-[var(--g-danger,#a52626)]">{listError}</p>}

          {folders.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {folders.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openFolder(entry)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] px-3 text-left text-sm font-medium text-[var(--g-fg,#302d34)] transition-colors hover:border-[var(--g-accent,#231b2d)]/40 hover:bg-[var(--g-fill,#f3f0e9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--g-accent,#231b2d)]"
                  >
                    <Folder size={18} className="shrink-0 text-[var(--g-fg3,#746e68)]" aria-hidden="true" />
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
                  onFavorite={carousel ? () => toggleFavorite(entry) : undefined}
                />
              ))}
            </ul>
          )}

          {nextPage && !isSearch && (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] px-4 text-xs font-semibold text-[var(--g-fg,#302d34)] hover:bg-[var(--g-fill,#f3f0e9)] disabled:opacity-60">
              {loadingMore ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />} Carregar mais
            </button>
          )}

          {!listError && folders.length === 0 && images.length === 0 && (!isSearch || hits !== null) && <p className="py-12 text-sm text-[var(--g-fg3,#746e68)]">{isSearch ? 'Nada encontrado com esse nome.' : 'Nenhuma pasta ou foto aqui.'}</p>}
        </>
      )}

      {selected.size > 0 && (
        <OnScreen>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3">
            <ul className="hidden min-w-0 flex-1 gap-2 overflow-x-auto sm:flex" aria-label="Fotos escolhidas">
              {[...selected.values()].map((entry) => (
                <li key={entry.id} className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--g-fill,#f3f0e9)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor */}
                  <img src={edits.get(entry.id)?.url ?? driveThumb(entry.id, 200)} alt={entry.name} className="h-full w-full object-cover" />
                  {favorites.has(entry.id) && <Star size={12} fill="currentColor" className="absolute right-0.5 top-0.5 text-amber-400" aria-label="Favorita para capa" />}
                </li>
              ))}
            </ul>
            <p className="min-w-0 flex-1 text-xs text-[var(--g-fg3,#746e68)] sm:flex-none sm:text-right">
              {carousel ? (
                <>
                  <span className="block font-semibold text-[var(--g-fg,#302d34)] tabular-nums">{selected.size + (target?.photoCount ?? 0)} de {limit} fotos do carrossel</span>
                  {favorites.size} {favorites.size === 1 ? 'capa marcada' : 'capas marcadas'}
                </>
              ) : (
                <>
                  <span className="block font-semibold text-[var(--g-fg,#302d34)]">{selected.size} {selected.size === 1 ? 'foto escolhida' : 'fotos escolhidas'}</span>
                  candidatas a capa
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-accent,#231b2d)] px-4 text-sm font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)]"
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
          onToggleFavorite={carousel ? () => toggleFavorite(preview) : undefined}
          onEdited={(edited) => {
            setEdits((current) => {
              const next = new Map(current);
              if (edited) next.set(preview.id, edited);
              else next.delete(preview.id);
              return next;
            });
            // foto cortada já entra na seleção (se ainda couber no carrossel)
            if (edited) setSelected((current) => (current.has(preview.id) || isFull(current) ? current : new Map(current).set(preview.id, preview)));
          }}
        />
      )}

      {saveOpen && (
        <OnScreen>
        <SaveDialog
          mode={mode}
          collections={collections}
          target={target}
          guessFrom={path.length ? path[path.length - 1].name : ''}
          photos={[...selected.values()].map((entry) => ({ id: entry.id, name: entry.name, width: entry.width, height: entry.height, favorite: !carousel || favorites.has(entry.id), edited: edits.get(entry.id) }))}
          onClose={() => setSaveOpen(false)}
          onSaved={(collection) => {
            setSaveOpen(false);
            setSelected(new Map());
            setFavorites(new Set());
            setEdits(new Map());
            setLimitNotice(false);
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
  badge,
  meta,
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
  /** Etiqueta sobre a foto (ex.: "Adicionada por Thereza"). */
  badge?: string;
  /** Linha do registro abaixo do nome (quem e quando). */
  meta?: string;
  onOpen: () => void;
  onSelect?: () => void;
  /** undefined = sem estrela (Aprovação de capa: toda foto é candidata a capa) */
  onFavorite?: () => void;
  selectLabel?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver ${name} em tamanho grande`}
        className={`relative block aspect-[3/4] w-full overflow-hidden rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-fill,#f3f0e9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--g-accent,#231b2d)] ${
          selected && onSelect ? 'ring-[3px] ring-[var(--g-accent,#231b2d)]' : ''
        }`}
      >
        {broken ? (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] leading-snug text-[var(--g-fg3,#746e68)]">
            Sem prévia no Google Drive
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        )}
        {badge && !approved && (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-amber-400 px-2 py-1 text-center text-[11px] font-semibold text-white">{badge}</span>
        )}
        {edited && !approved && !badge && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Crop size={11} aria-hidden="true" /> Cortada
          </span>
        )}
        {approved && (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-[var(--g-success,#17633b)] px-2 py-1 text-center text-[11px] font-semibold text-white">Capa aprovada</span>
        )}
      </button>
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={selectLabel ?? (selected ? `Tirar ${name} da seleção` : `Escolher ${name}`)}
          className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm transition-colors ${
            selected ? 'border-white bg-[var(--g-accent,#231b2d)] text-white' : 'border-white/90 bg-black/25 text-transparent hover:bg-black/40'
          }`}
        >
          <Check size={15} strokeWidth={3} aria-hidden="true" />
        </button>
      )}
      {onFavorite && (
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
      )}
      <p className="mt-1.5 truncate text-[11px] text-[var(--g-fg3,#746e68)]" title={name}>{name}</p>
      {meta && <p className="truncate text-[11px] tabular-nums text-[var(--g-fg3,#746e68)]" title={meta}>{meta}</p>}
    </li>
  );
}

function SaveDialog({
  mode,
  collections,
  target,
  guessFrom,
  photos,
  onClose,
  onSaved,
}: {
  mode: CollectionKind;
  collections: CoverCollectionSummary[];
  target: CoverCollectionSummary | null;
  guessFrom: string;
  photos: { id: string; name: string; width?: number; height?: number; favorite: boolean; edited?: EditedImage }[];
  onClose: () => void;
  onSaved: (collection: CoverCollectionDetail) => void;
}) {
  // nome e número sugeridos pelo nome da pasta do Drive (ex.: "Casa 110 Vila dos Coqueiros")
  const guess = guessHouseFromFileName(guessFrom);
  const [choice, setChoice] = useState<'new' | 'existing'>(target || (collections.length && !guess.number && !guess.name) ? 'existing' : 'new');
  const [collectionId, setCollectionId] = useState<number>(target?.id ?? collections[0]?.id ?? 0);
  const [houseName, setHouseName] = useState(guess.name);
  const [neighborhood, setNeighborhood] = useState('');
  const [houseNumber, setHouseNumber] = useState(guess.number);
  // data planejada da publicação: o post já aparece na Grade do feed nessa data (planejamento do mês)
  const askDate = mode === 'fotos' && choice === 'new';
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedHour, setPlannedHour] = useState(19);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (choice === 'new' && !houseName.trim() && !houseNumber.trim()) {
      setError('Informe o nome ou o número da casa.');
      return;
    }
    if (askDate && !plannedDate) {
      setError('Escolha a data planejada para publicar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/capa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          choice === 'existing'
            ? { collectionId, photos }
            : { houseName, neighborhood, houseNumber, photos, kind: mode, ...(askDate ? { plannedDate, plannedHour } : {}) },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (data.error === 'too_many') {
        setError(`O carrossel da casa aceita no máximo ${data.limit} fotos${typeof data.current === 'number' ? ` e esta pasta já tem ${data.current}` : ''}. Tire algumas da seleção.`);
        setSaving(false);
        return;
      }
      if (!response.ok || !data.collection) throw new Error(data.error ?? String(response.status));
      onSaved(data.collection);
    } catch (saveError) {
      console.error('Falha ao salvar as fotos na pasta:', saveError);
      setError('Não foi possível salvar. Confira se a migração das pastas de capa foi rodada e tente de novo.');
      setSaving(false);
    }
  };

  const input = 'min-h-11 w-full rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] px-3 text-sm text-[var(--g-fg,#302d34)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--g-accent,#231b2d)]';

  return (
    <div
      onPointerDown={(event) => event.target === event.currentTarget && !saving && onClose()}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--g-fg,#302d34)]/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="save-cover-title" className="w-full max-w-md space-y-5 rounded-t-[var(--g-r-panel,1rem)] bg-[var(--g-sheet,#fffefa)] p-5 sm:rounded-[var(--g-r-panel,1rem)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="save-cover-title" className="text-base font-semibold text-[var(--g-fg,#302d34)]">Salvar na pasta da casa</h2>
            <p className="mt-1 text-sm text-[var(--g-fg3,#746e68)]">
              {mode === 'fotos'
                ? `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}, ${photos.filter((photo) => photo.favorite).length} capas.`
                : `${photos.length} ${photos.length === 1 ? 'foto candidata' : 'fotos candidatas'} a capa.`}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-[var(--g-r-control,0.75rem)] text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-fill,#f3f0e9)]">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {collections.length > 0 && !target && (
          <div role="radiogroup" aria-label="Pasta" className="grid grid-cols-2 gap-1 rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-canvas,#f7f5f0)] p-1">
            {(['new', 'existing'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={choice === option}
                onClick={() => setChoice(option)}
                className={`min-h-9 rounded-[6px] text-xs font-semibold ${choice === option ? 'bg-[var(--g-sheet,#fffefa)] text-[var(--g-fg,#302d34)] shadow-xs' : 'text-[var(--g-fg3,#746e68)] hover:text-[var(--g-fg,#302d34)]'}`}
              >
                {option === 'new' ? 'Nova pasta' : 'Pasta existente'}
              </button>
            ))}
          </div>
        )}

        {choice === 'existing' ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--g-fg,#302d34)]">Pasta</span>
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
                <span className="text-xs font-semibold text-[var(--g-fg,#302d34)]">Nome da casa</span>
                <input value={houseName} onChange={(event) => setHouseName(event.target.value)} placeholder="Ex.: Casa Jacarandá" className={input} autoFocus />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-[var(--g-fg,#302d34)]">Número</span>
                <input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} inputMode="numeric" placeholder="110" className={`${input} tabular-nums`} />
              </label>
            </div>
            <NeighborhoodPicker value={neighborhood} onChange={setNeighborhood} inputClass={input} />
            {askDate && (
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-semibold text-[var(--g-fg,#302d34)]">Quando planejamos publicar</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(event) => setPlannedDate(event.target.value)}
                    aria-label="Data planejada"
                    className={`${input} tabular-nums`}
                  />
                  <select value={plannedHour} onChange={(event) => setPlannedHour(Number(event.target.value))} aria-label="Horário planejado" className={`${input} tabular-nums`}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-[var(--g-fg3,#746e68)]">O post já aparece na Grade do feed nessa data. Dá para mudar depois.</p>
              </fieldset>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-[var(--g-danger,#a52626)]">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-[var(--g-r-control,0.75rem)] px-4 text-sm font-semibold text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-fill,#f3f0e9)]">Cancelar</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-accent,#231b2d)] px-5 text-sm font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)] disabled:opacity-60">
            {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bairro: escolhe entre os já criados (Quadrado, Rio da Barra e os das pastas salvas) ou cria um novo. */
function NeighborhoodPicker({ value, onChange, inputClass }: { value: string; onChange: (value: string) => void; inputClass: string }) {
  const [options, setOptions] = useState<string[]>(DEFAULT_NEIGHBORHOODS);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/capa/bairros', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { neighborhoods?: string[] };
        if (data.neighborhoods?.length) setOptions(data.neighborhoods);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const createNew = () => {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    setOptions((current) => neighborhoodOptions([...current, name]));
    // se já existia com outra grafia (ex.: "quadrado"), usa a que já está na lista
    onChange(neighborhoodOptions([...options, name]).find((option) => option.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0) ?? name);
    setDraft('');
    setCreating(false);
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
      active ? 'border-[var(--g-accent,#231b2d)] bg-[var(--g-accent,#231b2d)] text-white' : 'border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] text-[var(--g-fg,#302d34)] hover:bg-[var(--g-fill,#f3f0e9)]'
    }`;

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold text-[var(--g-fg,#302d34)]">Bairro</legend>
      <div role="radiogroup" aria-label="Bairro" className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(value === option ? '' : option)} className={chip(value === option)}>
            {value === option && <Check size={13} aria-hidden="true" />} {option}
          </button>
        ))}
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-[var(--g-line,#e8e4dc)] px-3.5 text-xs font-semibold text-[var(--g-fg3,#746e68)] hover:border-[var(--g-accent,#231b2d)] hover:text-[var(--g-fg,#302d34)]">
            <Plus size={13} aria-hidden="true" /> Novo bairro
          </button>
        )}
      </div>
      {creating && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createNew();
              } else if (event.key === 'Escape') {
                setCreating(false);
              }
            }}
            placeholder="Nome do bairro"
            aria-label="Nome do novo bairro"
            maxLength={120}
            autoFocus
            className={inputClass}
          />
          <button type="button" onClick={createNew} disabled={!draft.trim()} className="min-h-11 shrink-0 rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-accent,#231b2d)] px-4 text-xs font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)] disabled:opacity-50">
            Criar
          </button>
          <button type="button" onClick={() => setCreating(false)} aria-label="Cancelar novo bairro" className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-[var(--g-r-control,0.75rem)] text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-fill,#f3f0e9)]">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </fieldset>
  );
}
