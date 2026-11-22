'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Images, RefreshCw, Search } from 'lucide-react';
import type { PrioritizedRow } from '@/lib/postagens';
import { matchSavedHouse, type MatchableHouse } from '@/lib/house';
import type { CoverStudioRequest } from '@/components/capas/CoverStudio';
import { DRIVE_RETURN_KEY } from '@/components/drive/CoverApprovalPanel';

// Tabela de postagens: a planilha "POSTAGENS INSTA 2025" do Drive, em ordem de prioridade (só leitura).

interface Payload {
  file: { id: string; name: string; modifiedTime: string | null };
  rows: PrioritizedRow[];
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: Payload }
  | { status: 'error'; code: string };

const shortDate = (value: string | null) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

function since(days: number | null) {
  if (days === null) return { text: 'Nunca postada', tone: 'bg-status-danger-soft text-status-danger' };
  if (days < 0) return { text: 'Programada', tone: 'bg-status-success-soft text-status-success' };
  if (days < 31) return { text: days <= 1 ? 'Hoje / ontem' : `Há ${days} dias`, tone: 'bg-status-success-soft text-status-success' };
  const months = Math.floor(days / 30.44);
  const text = months >= 12 ? `Há ${Math.floor(months / 12)} ${months >= 24 ? 'anos' : 'ano'}${months % 12 ? ` e ${months % 12} m` : ''}` : `Há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  return { text, tone: months >= 6 ? 'bg-status-danger-soft text-status-danger' : 'bg-status-warning-soft text-status-warning' };
}

const ERRORS: Record<string, { title: string; text: string; reconnect?: boolean }> = {
  drive_not_connected: {
    title: 'Reconecte o Google Drive',
    text: 'A planilha fica no Drive. O acesso expirou ou ainda não foi feito.',
    reconnect: true,
  },
  file_not_found: {
    title: 'Planilha não encontrada',
    text: 'Não achamos no Drive um arquivo com o nome "POSTAGENS INSTA 2025". Confira o nome ou se a conta conectada tem acesso a ele.',
  },
  sheet_not_found: { title: 'Aba POSTAGENS não encontrada', text: 'O arquivo foi achado, mas não tem uma aba chamada POSTAGENS.' },
};

/** Nome da casa como link: casa com capas salvas abre direto nela no "Selecionar capas"; sem capas, busca o nome no Drive. */
function HouseLink({ casa, houseId, onOpen, className = '' }: { casa: string; houseId: number | null; onOpen?: (request: CoverStudioRequest) => void; className?: string }) {
  if (!onOpen) return <span className={className}>{casa}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen({ houseId, search: casa })}
      title={houseId ? 'Abrir as capas desta casa' : 'Procurar a pasta desta casa no Drive'}
      className={`group inline-flex items-center gap-1.5 text-left underline-offset-4 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {casa}
      {houseId ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-accent no-underline">
          <Images size={11} aria-hidden="true" /> Capas
        </span>
      ) : (
        <ArrowUpRight size={14} className="shrink-0 text-ink-muted group-hover:text-accent" aria-hidden="true" />
      )}
    </button>
  );
}

export function PostagensTable({ onOpenCovers }: { onOpenCovers?: (request: CoverStudioRequest) => void } = {}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [savedHouses, setSavedHouses] = useState<MatchableHouse[]>([]);

  // casas já salvas no "Selecionar capas" (kind 'capa'), para ligar cada linha da planilha à casa
  useEffect(() => {
    fetch('/api/capa?tipo=capa', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSavedHouses(((data?.collections ?? []) as (MatchableHouse & { favoriteCount: number })[]).filter((row) => row.favoriteCount > 0)))
      .catch(() => undefined);
  }, []);
  const [query, setQuery] = useState('');
  const [atualizado, setAtualizado] = useState('');
  const [qualif, setQualif] = useState('');
  const [showBlocked, setShowBlocked] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/postagens', { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
      if (!response.ok || !body.rows || !body.file) setState({ status: 'error', code: body.error ?? 'read_failed' });
      else setState({ status: 'ready', data: { file: body.file, rows: body.rows } });
    } catch {
      setState({ status: 'error', code: 'read_failed' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a planilha ao abrir a aba
    void load();
  }, [load]);

  const rows = useMemo(() => (state.status === 'ready' ? state.data.rows : []), [state]);
  const options = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { atualizado: unique(rows.map((r) => r.atualizado)), qualif: unique(rows.map((r) => r.qualif)) };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    return rows
      .map((row, index) => ({ row, rank: index + 1 }))
      .filter(({ row }) =>
        (!needle || row.casa.toLocaleLowerCase('pt-BR').includes(needle) || row.atualizado.toLocaleLowerCase('pt-BR').includes(needle)) &&
        (!atualizado || row.atualizado === atualizado) &&
        (!qualif || row.qualif === qualif) &&
        (showBlocked || !row.bloqueada),
      );
  }, [rows, query, atualizado, qualif, showBlocked]);

  const houseIds = useMemo(() => new Map(rows.map((row) => [row.line, matchSavedHouse(row.casa, row.atualizado, savedHouses)])), [rows, savedHouses]);

  const control = 'min-h-10 rounded-control border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[34px]">Tabela de postagens</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            As casas da planilha {state.status === 'ready' ? `"${state.data.file.name}"` : 'POSTAGENS INSTA 2025'} em ordem de prioridade: primeiro as que nunca foram postadas, depois as que estão há mais tempo sem post. As marcadas para não publicar ficam no fim.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          {state.status === 'ready' && state.data.file.modifiedTime && (
            <span>
              Planilha alterada em{' '}
              {new Date(state.data.file.modifiedTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={state.status === 'loading'}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
          >
            <RefreshCw size={14} aria-hidden="true" className={state.status === 'loading' ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {state.status === 'loading' && <p role="status" className="text-sm text-ink-muted">Lendo a planilha no Drive…</p>}

      {state.status === 'error' && (
        <section className="flex max-w-xl flex-col gap-3 cartao rounded-panel p-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{ERRORS[state.code]?.title ?? 'Não foi possível ler a planilha'}</h2>
          <p className="text-sm leading-relaxed text-ink-muted">{ERRORS[state.code]?.text ?? 'Tente de novo em alguns instantes.'}</p>
          {ERRORS[state.code]?.reconnect && (
            <a
              href="/api/auth/google/login"
              onClick={() => {
                try {
                  sessionStorage.setItem(DRIVE_RETURN_KEY, 'postagens');
                } catch {
                  // sem sessionStorage
                }
              }}
              className="inline-flex min-h-11 w-fit items-center rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Reconectar Google Drive
            </a>
          )}
        </section>
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">Buscar casa</span>
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar casa" className={`${control} w-full pl-9`} />
            </label>
            <label className="min-w-0 basis-48">
              <span className="sr-only">Atualizado</span>
              <select value={atualizado} onChange={(e) => setAtualizado(e.target.value)} className={`${control} w-full`}>
                <option value="">Todos os condomínios</option>
                {options.atualizado.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="min-w-0 basis-48">
              <span className="sr-only">Qualif. corretoras</span>
              <select value={qualif} onChange={(e) => setQualif(e.target.value)} className={`${control} w-full`}>
                <option value="">Todas as qualificações</option>
                {options.qualif.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="inline-flex min-h-10 items-center gap-2 px-1 text-sm text-ink-muted">
              <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} className="h-4 w-4 accent-brand-plum" />
              Mostrar as que não podem ser publicadas
            </label>
          </div>

          <p className="text-xs text-ink-muted">
            {filtered.length} de {rows.length} casas
          </p>

          {/* Tela larga: tabela */}
          <div className="hidden overflow-x-auto cartao rounded-panel lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-3 font-semibold">#</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Casa</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Última postagem</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Observações</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Qualif. corretoras</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Entrada no site</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Postagens</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ row, rank }) => {
                  const badge = since(row.diasSemPostar);
                  return (
                    <tr key={row.line} className={`border-t border-border align-top ${row.bloqueada ? 'opacity-55' : ''}`}>
                      <td className="px-3 py-3 tabular-nums text-ink-muted">{rank}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink"><HouseLink casa={row.casa} houseId={houseIds.get(row.line) ?? null} onOpen={onOpenCovers} /></p>
                        <p className="text-xs text-ink-muted">{row.atualizado}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <p className="tabular-nums text-ink">{shortDate(row.ultimaPostagem)}</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>{badge.text}</span>
                      </td>
                      <td className="max-w-64 px-3 py-3 text-ink-muted">{row.observacoes || '—'}</td>
                      <td className="max-w-56 px-3 py-3 text-ink-muted">{row.qualif || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink-muted">{shortDate(row.entradaSite)}</td>
                      <td className="px-3 py-3">
                        <PostList row={row} open={open === row.line} onToggle={() => setOpen(open === row.line ? null : row.line)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Celular / tela estreita: cartões */}
          <ul className="space-y-3 lg:hidden">
            {filtered.map(({ row, rank }) => {
              const badge = since(row.diasSemPostar);
              return (
                <li key={row.line} className={`cartao rounded-panel p-4 ${row.bloqueada ? 'opacity-55' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs tabular-nums text-ink-muted">#{rank} · {row.atualizado}</p>
                      <p className="mt-0.5 font-medium text-ink"><HouseLink casa={row.casa} houseId={houseIds.get(row.line) ?? null} onOpen={onOpenCovers} /></p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>{badge.text}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div><dt className="text-ink-muted">Última postagem</dt><dd className="tabular-nums text-ink">{shortDate(row.ultimaPostagem)}</dd></div>
                    <div><dt className="text-ink-muted">Entrada no site</dt><dd className="tabular-nums text-ink">{shortDate(row.entradaSite)}</dd></div>
                    {row.qualif && <div className="col-span-2"><dt className="text-ink-muted">Qualif. corretoras</dt><dd className="text-ink">{row.qualif}</dd></div>}
                    {row.observacoes && <div className="col-span-2"><dt className="text-ink-muted">Observações</dt><dd className="text-ink">{row.observacoes}</dd></div>}
                  </dl>
                  <div className="mt-3">
                    <PostList row={row} open={open === row.line} onToggle={() => setOpen(open === row.line ? null : row.line)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function PostList({ row, open, onToggle }: { row: PrioritizedRow; open: boolean; onToggle: () => void }) {
  if (row.postagens.length === 0) return <span className="text-xs text-ink-muted">Nenhuma postagem</span>;
  const first = row.postagens[0];
  const last = row.postagens[row.postagens.length - 1];
  return (
    <div className="text-xs">
      <button type="button" onClick={onToggle} aria-expanded={open} className="text-left text-ink hover:text-brand-plum">
        <span className="tabular-nums">1ª {shortDate(first)}</span>
        {row.postagens.length > 1 && <span className="tabular-nums"> → última {shortDate(last)}</span>}
        <span className="ml-1 font-semibold text-brand-plum">· {row.postagens.length}</span>
      </button>
      {open && (
        <ol className="mt-2 space-y-0.5 tabular-nums text-ink-muted">
          {row.postagens.map((date, index) => (
            <li key={`${date}-${index}`}>{index + 1}ª · {shortDate(date)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
