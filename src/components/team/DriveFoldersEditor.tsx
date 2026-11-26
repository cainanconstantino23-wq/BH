'use client';

import { useEffect, useState } from 'react';
import { Check, Folder, Search, X } from 'lucide-react';
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
  const add = (hit: DriveFolderHit) => {
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
              placeholder="Buscar pasta pelo nome…"
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
