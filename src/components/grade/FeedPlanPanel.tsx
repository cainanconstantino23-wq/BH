'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronLeft, Copy, FolderPlus, LayoutGrid, Link2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { DriveBrowser, driveThumb } from '@/components/drive/DriveBrowser';
import { useTeam } from '@/lib/team';
import { coverFolderLabel } from '@/lib/house';
import { APPROVER_NAME, formatLongStamp, type CoverCollectionSummary } from '@/lib/covers';
import {
  DEFAULT_POST_HOUR,
  PLAN_DAY_OPTIONS,
  PLAN_STATUS_LABEL,
  addDays,
  periodLabel,
  postDates,
  replaceHouse,
  shortDay,
  toLayout,
  type FeedPlanDetail,
  type FeedPlanSummary,
  type PlanCandidate,
  type PlanHouse,
} from '@/lib/feedPlan';
import { FeedGridEditor, type LibraryHouse } from '@/components/grade/FeedGridEditor';
import { OnScreen } from '@/components/drive/OnScreen';
import { AppleThemeToggle, SF_FONT, appleMesh, useAppleTheme } from '@/components/apple/appleTheme';

// Aba "Aprovação da grade": a social media monta a grade do feed dos próximos 15 (ou 30) dias
// com as casas (pastas da Aprovação de capa) e manda um link só para a Thereza aprovar.

const STATUS_TONE: Record<FeedPlanSummary['status'], string> = {
  rascunho: 'bg-[var(--g-fill,#f3f0e9)] text-[var(--g-fg3,#746e68)]',
  enviado: 'bg-[var(--g-warning-soft,#fff5dc)] text-[var(--g-warning,#825310)]',
  aprovado: 'bg-[var(--g-success-soft,#eaf6ee)] text-[var(--g-success,#17633b)]',
};

const teamImage = (candidate: PlanCandidate, size: number) => candidate.editedUrl ?? driveThumb(candidate.driveId, size);
const folderLabel = (folder: CoverCollectionSummary) => coverFolderLabel(folder.houseName, folder.neighborhood, folder.houseNumber) || 'Sem nome';
/** amanhã, no fuso da Bahia */
const tomorrow = () => addDays(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' }), 1);

export function FeedPlanPanel() {
  const [view, setView] = useState<{ name: 'list' } | { name: 'new' } | { name: 'plan'; id: number }>({ name: 'list' });
  // padrão Apple, como a "Selecionar capas" e o link da Thereza: claro por padrão, escuro pelo sol/lua
  // claro = tema do painel (Fim de tarde no Quadrado, sem caixa nem degradê próprio); escuro = caixa escura Apple
  const { theme, toggle } = useAppleTheme('bh-grade-equipe-tema', 'quadrado');
  const dark = theme === 'dark';
  return (
    <div style={SF_FONT} className={`relative isolate text-[var(--fg)] antialiased transition-colors duration-300 ${dark ? 'overflow-hidden rounded-[28px] bg-[var(--bg)]' : ''}`}>
      {dark && <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ background: appleMesh }} />}
      <div className={`absolute right-0 top-0 z-10 ${dark ? 'right-4 top-4 sm:right-6 sm:top-6' : ''}`}><AppleThemeToggle theme={theme} onToggle={toggle} /></div>
    <div className={`space-y-6 ${dark ? 'p-4 pt-16 sm:p-8 sm:pt-8 sm:pr-20' : 'pt-12 sm:pt-0 sm:pr-14'}`}>
      {view.name === 'list' && <PlanList onNew={() => setView({ name: 'new' })} onOpen={(id) => setView({ name: 'plan', id })} />}
      {view.name === 'new' && <NewPlan onBack={() => setView({ name: 'list' })} onCreated={(id) => setView({ name: 'plan', id })} />}
      {view.name === 'plan' && <PlanDetail id={view.id} onBack={() => setView({ name: 'list' })} />}
    </div>
    </div>
  );
}

function BackLink({ onClick, label = 'Voltar para as grades' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--g-fg3,#746e68)] hover:text-[var(--g-fg,#302d34)]">
      <ChevronLeft size={16} aria-hidden="true" /> {label}
    </button>
  );
}

const MIGRATION_TEXT = 'Falta rodar a migração 20261119_grade_quinzena.sql no Supabase (SQL Editor) para usar a Aprovação da grade.';

function PlanList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: number) => void }) {
  const team = useTeam();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; plans: FeedPlanSummary[] }>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetch('/api/grade', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok) setState({ status: 'ready', plans: data.plans ?? [] });
        else setState({ status: 'error', text: data.error === 'migration_pending' ? MIGRATION_TEXT : 'Não foi possível carregar as grades.' });
      })
      .catch(() => active && setState({ status: 'error', text: 'Não foi possível carregar as grades.' }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-labelledby="plans-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="plans-title" className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--g-fg,#302d34)] sm:text-[34px]">Aprovação da grade</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--g-fg3,#746e68)]">
            Monte a grade do feed dos próximos dias com as casas e as capas candidatas, e mande um link só para a {APPROVER_NAME}.
            Ela vê como o feed vai ficar, troca posições, capas e casas, e aprova. 1 post por dia; domingo é Reels.
          </p>
        </div>
        {team.can('criar_publicacoes') && (
          <button type="button" onClick={onNew} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--g-accent,#231b2d)] px-5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_20px_-10px_var(--g-accent,#231b2d)] transition-[transform,background-color] duration-150 hover:bg-[var(--g-accent-hover,#352a42)] active:scale-[0.97]">
            <Plus size={15} aria-hidden="true" /> Nova grade
          </button>
        )}
      </div>

      {state.status === 'loading' && <p role="status" className="text-sm text-[var(--g-fg3,#746e68)]">Carregando…</p>}
      {state.status === 'error' && <p role="alert" className="rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-warning-soft,#fff5dc)] px-3 py-2 text-sm text-[var(--g-warning,#825310)]">{state.text}</p>}
      {state.status === 'ready' && state.plans.length === 0 && (
        <p className="rounded-[var(--g-r-panel,1rem)] border border-dashed border-[var(--g-line2,#d9d2c8)] p-6 text-center text-sm text-[var(--g-fg3,#746e68)]">Nenhuma grade ainda. Comece por “Nova grade”.</p>
      )}
      {state.status === 'ready' && state.plans.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.plans.map((plan) => (
            <li key={plan.id}>
              <button type="button" onClick={() => onOpen(plan.id)} className="flex w-full flex-col gap-2.5 rounded-[20px] border border-white/80 bg-[var(--g-sheet,#fffefa)]/90 p-5 text-left shadow-[0_1px_2px_rgb(var(--sombra,59_42_44)/0.05),0_14px_36px_-22px_rgb(var(--sombra,59_42_44)/0.3)] backdrop-blur-xl transition-[transform,box-shadow] duration-200 ease-out active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0_1px_2px_rgb(var(--sombra,59_42_44)/0.06),0_18px_40px_-20px_rgb(var(--sombra,59_42_44)/0.38)]">
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-[var(--g-fg,#302d34)] tabular-nums">
                    <CalendarRange size={16} className="text-[var(--g-accent,#231b2d)]" aria-hidden="true" /> {periodLabel(plan.startDate, plan.days)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
                </span>
                <span className="text-[13px] text-[var(--g-fg3,#746e68)] tabular-nums">
                  {plan.days} dias · {plan.houseCount} {plan.houseCount === 1 ? 'casa' : 'casas'}
                  {plan.respondedAt ? ` · aprovada em ${formatLongStamp(plan.respondedAt)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewPlan({ onBack, onCreated }: { onBack: () => void; onCreated: (id: number) => void }) {
  const [startDate, setStartDate] = useState(tomorrow);
  const [days, setDays] = useState<number>(PLAN_DAY_OPTIONS[0]);
  // horário dos posts: por enquanto fixo (19h), sem a caixa de escolher
  const hour = DEFAULT_POST_HOUR;
  const [folders, setFolders] = useState<CoverCollectionSummary[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // escolher fotos no Drive sem sair da Nova grade: cria a pasta da casa (Aprovação de capa) e já a põe na grade
  const [picking, setPicking] = useState(false);
  const [checkingDrive, setCheckingDrive] = useState(false);
  const needed = postDates(startDate, days).length;

  const loadFolders = useCallback(
    () =>
      fetch('/api/capa?tipo=capa', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => setFolders((data.collections ?? data.folders ?? []) as CoverCollectionSummary[]))
        .catch(() => setFolders([])),
    [],
  );
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const notConnected = useCallback(() => {
    setPicking(false);
    setError('O Google Drive não está conectado. Conecte na aba Aprovação fotos e volte aqui.');
  }, []);

  const openDrive = async () => {
    setError('');
    setCheckingDrive(true);
    const status = await fetch('/api/drive/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    setCheckingDrive(false);
    if (status?.connected) setPicking(true);
    else notConnected();
  };

  if (picking) {
    return (
      <section aria-label="Escolher fotos no Drive" className="space-y-5">
        <BackLink label="Voltar para a nova grade" onClick={() => setPicking(false)} />
        <div>
          <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.022em] text-[var(--g-fg,#302d34)]">Escolher fotos no Drive</h2>
          <p className="mt-1 text-sm text-[var(--g-fg3,#746e68)]">
            Abra a pasta da casa, marque com ✓ as fotos que podem ser capa e salve com o nome, número e bairro. A casa volta para a nova grade já escolhida.
          </p>
        </div>
        <DriveBrowser
          mode="capa"
          collections={folders ?? []}
          target={null}
          onNotConnected={notConnected}
          onSaved={(collection) => {
            void loadFolders();
            // casa nova (ou pasta existente que recebeu fotos) entra na grade, no fim da ordem
            setSelected((current) => (current.includes(collection.id) ? current : [...current, collection.id]));
            setPicking(false);
          }}
        />
      </section>
    );
  }

  const toggle = (id: number) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const create = async () => {
    setSaving(true);
    setError('');
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, days, hour, collectionIds: selected }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setSaving(false);
    if (response?.ok && data.id) onCreated(Number(data.id));
    else setError(data.error === 'migration_pending' ? MIGRATION_TEXT : 'Não foi possível criar a grade.');
  };


  return (
    <section aria-labelledby="new-plan-title" className="space-y-5">
      <BackLink onClick={onBack} />
      <div>
        <h2 id="new-plan-title" className="text-[28px] font-bold leading-[1.1] tracking-[-0.022em] text-[var(--g-fg,#302d34)]">Nova grade</h2>
        <p className="mt-1 text-sm text-[var(--g-fg3,#746e68)]">Escolha o período e, pelo Drive, as fotos candidatas a capa de cada casa, na ordem em que devem entrar.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-[var(--g-r-panel,1rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] p-4">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-[var(--g-fg,#302d34)]">Começa em</span>
          <input type="date" value={startDate} onChange={(event) => event.target.value && setStartDate(event.target.value)} className="min-h-10 rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] px-3 tabular-nums text-[var(--g-fg,#302d34)]" />
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1 font-semibold text-[var(--g-fg,#302d34)]">Período</legend>
          <div className="flex gap-2">
            {PLAN_DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={`min-h-10 rounded-[var(--g-r-control,0.75rem)] px-4 text-xs font-semibold ${days === option ? 'bg-[var(--g-accent,#231b2d)] text-white' : 'border border-[var(--g-line,#e8e4dc)] text-[var(--g-fg,#302d34)] hover:bg-[var(--g-fill,#f3f0e9)]'}`}
              >
                {option} dias
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-[var(--g-fg3,#746e68)]">
          {periodLabel(startDate, days)}: <strong className="text-[var(--g-fg,#302d34)]">{needed} dias de post</strong> e {days - needed} {days - needed === 1 ? 'domingo' : 'domingos'} de Reels.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-[var(--g-fg,#302d34)]">Casas ({selected.length} escolhidas)</h3>
            {selected.length > 0 && (
            <button
              type="button"
              onClick={() => void openDrive()}
              disabled={checkingDrive}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] px-3 text-xs font-semibold text-[var(--g-fg,#302d34)] hover:bg-[var(--g-fill,#f3f0e9)] disabled:opacity-50"
            >
              {checkingDrive ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FolderPlus size={14} aria-hidden="true" />} Escolher fotos no Drive
            </button>
            )}
          </div>
          <p className={`text-xs ${selected.length < needed ? 'text-[var(--g-warning,#825310)]' : 'text-[var(--g-fg3,#746e68)]'}`}>
            {selected.length < needed
              ? `Faltam ${needed - selected.length} para preencher todos os dias (dá para criar assim e completar depois).`
              : selected.length > needed
                ? `${selected.length - needed} ${selected.length - needed === 1 ? 'fica' : 'ficam'} na reserva: a ${APPROVER_NAME} pode trocar por elas.`
                : 'Todos os dias preenchidos.'}
          </p>
        </div>
        {/* só as casas escolhidas agora pelo Drive, sem fotos: ordem, dia e nome */}
        {selected.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[var(--g-r-panel,1rem)] border border-dashed border-[var(--g-line2,#d9d2c8)] px-5 py-10 text-center">
            <p className="max-w-sm text-sm text-[var(--g-fg3,#746e68)]">Nenhuma casa ainda. Abra a pasta de cada casa no Drive e marque as fotos que podem ser capa.</p>
            <button
              type="button"
              onClick={() => void openDrive()}
              disabled={checkingDrive}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--g-accent,#231b2d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] transition-transform px-5 text-sm font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)] disabled:opacity-50"
            >
              {checkingDrive ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FolderPlus size={16} aria-hidden="true" />} Escolher fotos no Drive
            </button>
          </div>
        ) : (
          <ol className="divide-y divide-[var(--g-line,#e8e4dc)] overflow-hidden rounded-[var(--g-r-panel,1rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)]">
            {selected.map((id, order) => {
              const folder = (folders ?? []).find((item) => item.id === id);
              const date = postDates(startDate, days)[order];
              return (
                <li key={id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--g-accent,#231b2d)] px-1.5 text-xs font-bold tabular-nums text-white">{order + 1}</span>
                  <span className="w-20 shrink-0 text-xs font-semibold tabular-nums text-[var(--g-fg3,#746e68)]">{date ? shortDay(date) : 'Reserva'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--g-fg,#302d34)]">{folder ? folderLabel(folder) : 'Casa'}</span>
                  {folder && <span className="hidden shrink-0 text-xs tabular-nums text-[var(--g-fg3,#746e68)] sm:inline">{folder.photoCount} {folder.photoCount === 1 ? 'foto' : 'fotos'}</span>}
                  <button type="button" onClick={() => toggle(id)} aria-label={`Tirar ${folder ? folderLabel(folder) : 'a casa'} da grade`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--g-r-control,0.75rem)] text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-danger-soft,#fff0ef)] hover:text-[var(--g-danger,#a52626)]">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-[var(--g-danger,#a52626)]">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void create()}
          disabled={saving || selected.length === 0}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--g-accent,#231b2d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] transition-transform px-5 text-xs font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <LayoutGrid size={15} aria-hidden="true" />} Montar a grade
        </button>
      </div>
    </section>
  );
}

function PlanDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const team = useTeam();
  const canEdit = team.can('criar_publicacoes') || team.can('editar_publicacoes');
  const [plan, setPlan] = useState<FeedPlanDetail | null>(null);
  const [houses, setHouses] = useState<PlanHouse[]>([]);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<CoverCollectionSummary[] | null>(null);
  // escolher no Drive uma casa nova para um dia (o "+" do dia livre ou "Trocar a casa")
  const [pickingDate, setPickingDate] = useState<string | null>(null);
  const [driveFolders, setDriveFolders] = useState<CoverCollectionSummary[]>([]);
  // todas as casas já preparadas na Aprovação de capa (busca ao escolher a casa de um dia)
  const [library, setLibrary] = useState<LibraryHouse[]>([]);
  const loadLibrary = useCallback(
    () =>
      fetch('/api/capa?tipo=capa', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) =>
          setLibrary(
            ((data.collections ?? []) as CoverCollectionSummary[])
              .filter((folder) => folder.photoCount > 0)
              .map((folder) => ({
                collectionId: folder.id,
                label: folderLabel(folder),
                imageUrl: folder.coverEditedUrl ?? (folder.coverDriveId ? driveThumb(folder.coverDriveId, 300) : null),
                photoCount: folder.photoCount,
                cropped: Boolean(folder.coverEditedUrl),
              })),
          ),
        )
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);
  const saveTimer = useRef<number | null>(null);

  const apply = useCallback((next: FeedPlanDetail) => {
    setPlan(next);
    setHouses(next.houses);
    setLink(next.shareToken ? `${window.location.origin}/grade/${next.shareToken}` : null);
  }, []);

  useEffect(() => {
    fetch(`/api/grade/${id}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.plan) apply(data.plan);
        else setError(data.error === 'migration_pending' ? MIGRATION_TEXT : 'Não foi possível abrir a grade.');
      })
      .catch(() => setError('Não foi possível abrir a grade.'));
  }, [id, apply]);

  const patchPlan = async (body: Record<string, unknown>): Promise<FeedPlanDetail | null> => {
    const response = await fetch(`/api/grade/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok && data.plan) {
      apply(data.plan);
      return data.plan as FeedPlanDetail;
    }
    setError('Não foi possível salvar a mudança.');
    return null;
  };
  const patch = async (body: Record<string, unknown>) => Boolean(await patchPlan(body));

  const openDrivePicker = async (date: string) => {
    setError('');
    const status = await fetch('/api/drive/status', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
    if (!status?.connected) return setError('O Google Drive não está conectado. Conecte na aba Aprovação fotos e volte aqui.');
    const data = await fetch('/api/capa?tipo=capa', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({}));
    setDriveFolders((data.collections ?? []) as CoverCollectionSummary[]);
    setPickingDate(date);
  };

  /** Casa salva pelo Drive: entra no plano (se ainda não estava) e vai para o dia escolhido. */
  const placeFromDrive = async (collectionId: number, date: string) => {
    setPickingDate(null);
    // grava antes o que ainda estava para salvar, para não perder
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await patchPlan({ layout: toLayout(houses) });
    }
    let current = houses;
    if (!current.some((house) => house.collectionId === collectionId)) {
      const updated = await patchPlan({ addCollectionIds: [collectionId] });
      if (!updated) return;
      current = updated.houses;
    }
    setSaveState('saving');
    if (await patchPlan({ layout: toLayout(replaceHouse(current, date, collectionId)) })) setSaveState('saved');
    void loadLibrary();
  };

  const change = (next: PlanHouse[]) => {
    setHouses(next);
    setSaveState('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await patch({ layout: toLayout(next) });
      setSaveState('saved');
    }, 700);
  };

  const makeLink = async (renew = false) => {
    setBusy(true);
    const response = await fetch(`/api/grade/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renew }) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok || !data.token) return setError('Não foi possível gerar o link.');
    const url = `${window.location.origin}/grade/${data.token}`;
    setLink(url);
    setPlan((current) => (current && current.status === 'rascunho' ? { ...current, status: 'enviado' } : current));
    await navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined);
  };

  const openAdd = async () => {
    const data = await fetch('/api/capa?tipo=capa', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({}));
    const inPlan = new Set(houses.map((house) => house.collectionId));
    setAdding(((data.collections ?? data.folders ?? []) as CoverCollectionSummary[]).filter((folder) => folder.photoCount > 0 && !inPlan.has(folder.id)));
  };

  const remove = async () => {
    if (!plan || !window.confirm(`Apagar a grade de ${periodLabel(plan.startDate, plan.days)}? As pastas das casas continuam.`)) return;
    const response = await fetch(`/api/grade/${id}`, { method: 'DELETE' }).catch(() => null);
    if (response?.ok) onBack();
    else setError('Não foi possível apagar a grade.');
  };

  if (!plan) {
    return (
      <div className="space-y-4">
        <BackLink onClick={onBack} />
        {error ? <p role="alert" className="rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-warning-soft,#fff5dc)] px-3 py-2 text-sm text-[var(--g-warning,#825310)]">{error}</p> : <p role="status" className="text-sm text-[var(--g-fg3,#746e68)]">Carregando…</p>}
      </div>
    );
  }

  if (pickingDate) {
    return (
      <section aria-label="Escolher casa no Drive" className="space-y-5">
        <BackLink label="Voltar para a grade" onClick={() => setPickingDate(null)} />
        <div>
          <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.022em] text-[var(--g-fg,#302d34)]">Casa para {shortDay(pickingDate)}</h2>
          <p className="mt-1 text-sm text-[var(--g-fg3,#746e68)]">Abra a pasta da casa no Drive, marque com ✓ as fotos que podem ser capa e salve com o nome, número e bairro. Ela entra na grade neste dia.</p>
        </div>
        <DriveBrowser
          mode="capa"
          collections={driveFolders}
          target={null}
          onNotConnected={() => {
            setPickingDate(null);
            setError('O Google Drive não está conectado. Conecte na aba Aprovação fotos e volte aqui.');
          }}
          onSaved={(collection) => void placeFromDrive(collection.id, pickingDate)}
        />
      </section>
    );
  }

  const scheduled = houses.filter((house) => house.slotDate).sort((a, b) => a.slotDate!.localeCompare(b.slotDate!));
  const freeDays = postDates(plan.startDate, plan.days).length - scheduled.length;

  return (
    <div className="space-y-6">
      <BackLink onClick={onBack} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-[28px] font-bold leading-[1.1] tracking-[-0.022em] text-[var(--g-fg,#302d34)]">
            Grade de {periodLabel(plan.startDate, plan.days)}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
          </h2>
          <p className="mt-1 text-sm text-[var(--g-fg3,#746e68)]">
            {plan.days} dias · posts às {String(plan.hour).padStart(2, '0')}:00 · {scheduled.length} {scheduled.length === 1 ? 'casa' : 'casas'} na grade
            {freeDays > 0 ? ` · ${freeDays} ${freeDays === 1 ? 'dia livre' : 'dias livres'}` : ''}
            {saveState === 'saving' ? ' · salvando…' : saveState === 'saved' ? ' · salvo' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" onClick={() => void openAdd()} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] px-3.5 text-xs font-semibold text-[var(--g-fg,#302d34)] hover:bg-[var(--g-fill,#f3f0e9)]">
              <Plus size={15} aria-hidden="true" /> Adicionar casas
            </button>
          )}
          {team.can('apagar_publicacoes') && (
            <button type="button" onClick={() => void remove()} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--g-r-control,0.75rem)] px-3 text-xs font-semibold text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-danger-soft,#fff0ef)] hover:text-[var(--g-danger,#a52626)]">
              <Trash2 size={15} aria-hidden="true" /> Apagar grade
            </button>
          )}
        </div>
      </div>

      {plan.status === 'aprovado' && plan.respondedAt && (
        <section aria-label="Resposta da Thereza" className="space-y-2 rounded-[var(--g-r-panel,1rem)] border-2 border-[var(--g-success-line,#b8ddc4)] bg-[var(--g-success-soft,#eaf6ee)] p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--g-success,#17633b)]">
            <Check size={18} strokeWidth={2.5} aria-hidden="true" /> {APPROVER_NAME} aprovou a grade em {formatLongStamp(plan.respondedAt)}
          </h3>
          {plan.feedback && <p className="rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-sheet,#fffefa)] px-3 py-2 text-sm text-[var(--g-fg,#302d34)]">&ldquo;{plan.feedback}&rdquo;</p>}
          <p className="text-sm text-[var(--g-fg,#302d34)]">
            A capa escolhida de cada casa já está aprovada na pasta dela, na Aprovação de capa, com a data do dia. Próximo passo: aprovação do carrossel de cada casa.
          </p>
          <ol className="grid gap-x-6 gap-y-1 text-xs text-[var(--g-fg,#302d34)] sm:grid-cols-2">
            {scheduled.map((house) => (
              <li key={house.collectionId} className="tabular-nums"><span className="font-semibold">{shortDay(house.slotDate!)}</span> · {house.label}</li>
            ))}
          </ol>
        </section>
      )}

      {/* Link para a Thereza */}
      <section className="rounded-[var(--g-r-panel,1rem)] border border-[var(--g-line,#e8e4dc)] bg-[var(--g-sheet,#fffefa)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--g-fg,#302d34)]"><Link2 size={16} className="text-[var(--g-accent,#231b2d)]" aria-hidden="true" /> Link da grade para a {APPROVER_NAME}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--g-fg3,#746e68)]">Ela vê a grade como no Instagram, arrasta para trocar, escolhe as capas, troca casas pelas da reserva e aprova. As mudanças dela aparecem aqui.</p>
          </div>
          {team.can('enviar_link_aprovacao') &&
            (link ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--g-accent,#231b2d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] transition-transform px-4 text-xs font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)]"
                >
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Link copiado' : 'Copiar link'}
                </button>
                <button type="button" onClick={() => void makeLink(true)} disabled={busy} title="Gerar um link novo (o antigo para de funcionar)" aria-label="Gerar um link novo" className="flex min-h-10 min-w-10 items-center justify-center rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] text-[var(--g-fg3,#746e68)] hover:bg-[var(--g-fill,#f3f0e9)] disabled:opacity-50">
                  <RefreshCw size={15} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void makeLink()}
                disabled={busy || scheduled.length === 0}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--g-accent,#231b2d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] transition-transform px-4 text-xs font-semibold text-white hover:bg-[var(--g-accent-hover,#352a42)] disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} Gerar link
              </button>
            ))}
        </div>
        {link && <p className="mt-3 break-all rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-canvas,#f7f5f0)] px-3 py-2 font-mono text-[11px] text-[var(--g-fg3,#746e68)]">{link}</p>}
      </section>

      {error && <p role="alert" className="text-sm text-[var(--g-danger,#a52626)]">{error}</p>}

      <div className="max-w-2xl">
        <FeedGridEditor
          houses={houses}
          startDate={plan.startDate}
          days={plan.days}
          published={plan.published}
          imageSrc={teamImage}
          onChange={change}
          readOnly={!canEdit}
          onPickFromDrive={canEdit ? (date) => void openDrivePicker(date) : undefined}
          library={canEdit ? library : undefined}
          onPickLibrary={canEdit ? (date, collectionId) => void placeFromDrive(collectionId, date) : undefined}
        />
      </div>

      {adding && (
        <OnScreen>
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={(event) => event.target === event.currentTarget && setAdding(null)}>
          <section role="dialog" aria-modal="true" aria-label="Adicionar casas à reserva" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-[var(--g-r-panel,1rem)] bg-[var(--g-sheet,#fffefa)] p-4 shadow-2xl sm:rounded-[var(--g-r-panel,1rem)] sm:p-6">
            <h3 className="text-base font-semibold text-[var(--g-fg,#302d34)]">Adicionar casas</h3>
            <p className="mt-1 text-sm text-[var(--g-fg3,#746e68)]">Entram na reserva. Depois é só tocar num dia livre ou trocar uma casa.</p>
            {adding.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--g-fg3,#746e68)]">Todas as pastas com fotos já estão nesta grade.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {adding.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await patch({ addCollectionIds: [folder.id] })) setAdding((current) => current?.filter((item) => item.id !== folder.id) ?? null);
                      }}
                      className="block w-full text-left"
                    >
                      <span className="block aspect-[3/4] overflow-hidden rounded-[var(--g-r-control,0.75rem)] bg-[var(--g-fill,#f3f0e9)] ring-1 ring-[var(--g-line,#e8e4dc)] hover:ring-2 hover:ring-[var(--g-accent,#231b2d)]">
                        {folder.coverDriveId && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor
                          <img src={folder.coverEditedUrl ?? driveThumb(folder.coverDriveId, 300)} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[var(--g-fg,#302d34)]">{folderLabel(folder)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setAdding(null)} className="inline-flex min-h-10 items-center rounded-[var(--g-r-control,0.75rem)] border border-[var(--g-line,#e8e4dc)] px-4 text-xs font-semibold text-[var(--g-fg,#302d34)] hover:bg-[var(--g-fill,#f3f0e9)]">Pronto</button>
            </div>
          </section>
        </div>
        </OnScreen>
      )}
    </div>
  );
}
