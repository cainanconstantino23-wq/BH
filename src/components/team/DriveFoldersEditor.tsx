'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, Folder, Search, X } from 'lucide-react';
import type { DriveFolderHit } from '@/app/api/drive/search/route';
import type { DriveFolder } from '@/lib/google/driveScope';

// Tela Equipe: o que a pessoa vê do Google Drive (team_members.drive_folders).
// Tudo = null; "Só estas pastas" = lista (vazia = nada do Drive). A regra é aplicada no servidor (src/lib/google/driveAccess.ts).

const sameFolders = (a: DriveFolder[] | null, b: DriveFolder[] | null) =>
  a === b || (a !== null && b !== null && a.length === b.length && a.every((folder, index) => folder.id === b[index].id));

export function DriveFoldersEditor({
  value,
  onSave,
  busy,
  idPrefix,
}: {
  value: DriveFolder[] | null;
  onSave: (next: DriveFolder[] | null) => void;
  busy: boolean;
  idPrefix: string;
}) {
  const [draft, setDraft] = useState<DriveFolder[] | null>(value);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DriveFolderHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const restricted = draft !== null;
  const text = query.trim();

  useEffect(() => {
    // com menos de 2 letras a lista nem aparece (ver o render); não precisa limpar aqui
    if (!restricted || text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const response = await fetch(`/api/drive/search?q=${encodeURIComponent(text)}`, { cache: 'no-store', signal: controller.signal });
        const body = (await response.json().catch(() => ({}))) as { folders?: DriveFolderHit[] };
        if (!response.ok) throw new Error(String(response.status));
        setHits(body.folders ?? []);
      } catch {
        if (!controller.signal.aborted) setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [restricted, text]);

  const chosen = new Set((draft ?? []).map((folder) => folder.id));
  const add = (hit: DriveFolder) => {
    if (chosen.has(hit.id)) return;
    setDraft([...(draft ?? []), { id: hit.id, name: hit.name }]);
    setQuery('');
  };
  const removeFolder = (id: string) => setDraft((draft ?? []).filter((folder) => folder.id !== id));
  const changed = !sameFolders(draft, value);

  const segment = (active: boolean) =>
    `min-h-9 rounded-control border px-3 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
      active ? 'border-brand-plum bg-accent text-white' : 'border-border bg-surface text-ink hover:bg-surface-muted'
    }`;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-ink">Acesso ao Google Drive</p>
        <p className="text-xs text-ink-muted">Quem fica em “Só estas pastas” não vê o resto do Drive nem a Tabela de postagens.</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Acesso ao Google Drive">
          <button type="button" disabled={busy} aria-pressed={!restricted} onClick={() => setDraft(null)} className={segment(!restricted)}>
            Tudo
          </button>
          <button type="button" disabled={busy} aria-pressed={restricted} onClick={() => setDraft(draft ?? [])} className={segment(restricted)}>
            Só estas pastas
          </button>
        </div>
      </div>

      {restricted && (
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-drive-search`} className="sr-only">
            Buscar pasta do Drive pelo nome
          </label>
          <div className="relative max-w-md">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              id={`${idPrefix}-drive-search`}
              type="search"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pasta pelo nome (ou navegue abaixo)…"
              autoComplete="off"
              className="min-h-9 w-full rounded-control border border-border bg-surface pl-8 pr-3 text-xs text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
          {text.length >= 2 && (
            <div aria-live="polite" className="max-w-md">
              {searching && <p className="text-xs text-ink-muted">Buscando…</p>}
              {!searching && searchError && <p className="text-xs text-status-danger">Não foi possível buscar no Drive. Confira se ele está conectado.</p>}
              {!searching && !searchError && hits.length === 0 && <p className="text-xs text-ink-muted">Nenhuma pasta com esse nome.</p>}
              {!searching && hits.length > 0 && (
                <ul className="divide-y divide-border overflow-hidden rounded-control border border-border bg-surface">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        disabled={chosen.has(hit.id)}
                        onClick={() => add(hit)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-muted disabled:opacity-50"
                      >
                        <Folder size={14} aria-hidden="true" className="shrink-0 text-ink-muted" />
                        <span className="min-w-0 truncate font-medium text-ink">{hit.name}</span>
                        {hit.parentName && <span className="min-w-0 truncate text-ink-muted">· {hit.parentName}</span>}
                        {chosen.has(hit.id) && <Check size={13} aria-hidden="true" className="ml-auto shrink-0 text-status-success" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {text.length < 2 && <FolderBrowser chosen={chosen} onPick={add} busy={busy} />}

          {draft.length === 0 ? (
            <p className="text-xs text-status-warning">Nenhuma pasta escolhida: a pessoa não verá nada do Drive.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {draft.map((folder) => (
                <li key={folder.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface pl-3 pr-1 text-xs text-ink">
                  <Folder size={13} aria-hidden="true" className="text-ink-muted" />
                  <span className="max-w-[16rem] truncate">{folder.name}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeFolder(folder.id)}
                    aria-label={`Tirar a pasta ${folder.name}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {changed && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(draft)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Check size={14} aria-hidden="true" /> Salvar acesso ao Drive
        </button>
      )}
    </div>
  );
}

interface ListResult {
  key: string;
  folders: DriveFolder[];
  nextPage: string | null;
  error: boolean;
}

const listUrl = (folder: string, page?: string | null) =>
  `/api/drive/list?folder=${encodeURIComponent(folder)}${page ? `&page=${encodeURIComponent(page)}` : ''}`;

async function fetchFolders(folder: string, page?: string | null): Promise<{ folders: DriveFolder[]; nextPage: string | null }> {
  const response = await fetch(listUrl(folder, page), { cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as { entries?: { id: string; name: string; kind: string }[]; nextPage?: string | null };
  if (!response.ok) throw new Error(String(response.status));
  return {
    folders: (body.entries ?? []).filter((entry) => entry.kind === 'folder').map(({ id, name }) => ({ id, name })),
    nextPage: body.nextPage ?? null,
  };
}

/** Navega nas pastas do Drive (a partir de "Compartilhados comigo") para escolher quais liberar. */
function FolderBrowser({ chosen, onPick, busy }: { chosen: ReadonlySet<string>; onPick: (folder: DriveFolder) => void; busy: boolean }) {
  const [path, setPath] = useState<DriveFolder[]>([]);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const current = path.at(-1)?.id ?? 'shared';
  const loading = result?.key !== current;

  useEffect(() => {
    let active = true;
    fetchFolders(current)
      .then((data) => active && setResult({ key: current, ...data, error: false }))
      .catch(() => active && setResult({ key: current, folders: [], nextPage: null, error: true }));
    return () => {
      active = false;
    };
  }, [current]);

  const loadMore = async () => {
    if (!result?.nextPage) return;
    setLoadingMore(true);
    try {
      const data = await fetchFolders(current, result.nextPage);
      setResult((prev) => (prev && prev.key === current ? { ...prev, folders: [...prev.folders, ...data.folders], nextPage: data.nextPage } : prev));
    } catch {
      setResult((prev) => (prev ? { ...prev, nextPage: null, error: true } : prev));
    } finally {
      setLoadingMore(false);
    }
  };

  const crumb = 'rounded px-1 py-0.5 font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="max-w-xl overflow-hidden rounded-control border border-border bg-surface">
      <nav aria-label="Caminho no Drive" className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-xs text-ink-muted">
        <button type="button" onClick={() => setPath([])} className={crumb}>
          Compartilhados comigo
        </button>
        {path.map((folder, index) => (
          <span key={folder.id} className="inline-flex items-center gap-1">
            <ChevronRight size={12} aria-hidden="true" />
            <button type="button" onClick={() => setPath(path.slice(0, index + 1))} className={`${crumb} max-w-[12rem] truncate`}>
              {folder.name}
            </button>
          </span>
        ))}
      </nav>

      {path.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2 text-xs">
          <span className="min-w-0 truncate text-ink">
            Pasta aberta: <strong className="font-semibold">{path.at(-1)?.name}</strong>
          </span>
          <PickButton folder={path.at(-1)!} chosen={chosen} onPick={onPick} busy={busy} label="Escolher esta pasta" />
        </div>
      )}

      <div aria-live="polite" className="max-h-72 overflow-y-auto">
        {loading && <p className="px-3 py-3 text-xs text-ink-muted">Carregando pastas…</p>}
        {!loading && result?.error && result.folders.length === 0 && (
          <p className="px-3 py-3 text-xs text-status-danger">Não foi possível abrir o Drive. Confira se ele está conectado.</p>
        )}
        {!loading && !result?.error && result?.folders.length === 0 && (
          <p className="px-3 py-3 text-xs text-ink-muted">{path.length ? 'Nenhuma subpasta aqui.' : 'Nenhuma pasta compartilhada com a conta conectada.'}</p>
        )}
        {!loading && result && result.folders.length > 0 && (
          <ul className="divide-y divide-border">
            {result.folders.map((folder) => (
              <li key={folder.id} className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setPath([...path, folder])}
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left text-xs hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                  title="Abrir a pasta"
                >
                  <Folder size={14} aria-hidden="true" className="shrink-0 text-ink-muted" />
                  <span className="min-w-0 truncate font-medium text-ink">{folder.name}</span>
                  <ChevronRight size={13} aria-hidden="true" className="ml-auto shrink-0 text-ink-muted" />
                </button>
                <PickButton folder={folder} chosen={chosen} onPick={onPick} busy={busy} label="Escolher" />
              </li>
            ))}
          </ul>
        )}
        {!loading && result?.nextPage && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="w-full border-t border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
          >
            {loadingMore ? 'Carregando…' : 'Mostrar mais pastas'}
          </button>
        )}
      </div>
    </div>
  );
}

function PickButton({ folder, chosen, onPick, busy, label }: { folder: DriveFolder; chosen: ReadonlySet<string>; onPick: (folder: DriveFolder) => void; busy: boolean; label: string }) {
  const picked = chosen.has(folder.id);
  return (
    <button
      type="button"
      disabled={busy || picked}
      onClick={() => onPick(folder)}
      aria-label={picked ? `${folder.name} já escolhida` : `${label}: ${folder.name}`}
      className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[11px] font-semibold disabled:cursor-default ${
        picked ? 'border-status-success-border bg-status-success-soft text-status-success' : 'border-border text-ink hover:bg-surface-muted disabled:opacity-50'
      }`}
    >
      {picked ? (
        <>
          <Check size={12} aria-hidden="true" /> Escolhida
        </>
      ) : (
        label
      )}
    </button>
  );
}
