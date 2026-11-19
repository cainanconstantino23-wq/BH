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
  shortDay,
  toLayout,
  type FeedPlanDetail,
  type FeedPlanSummary,
  type PlanCandidate,
  type PlanHouse,
} from '@/lib/feedPlan';
import { FeedGridEditor } from '@/components/grade/FeedGridEditor';
import { OnScreen } from '@/components/drive/OnScreen';

// Aba "Aprovação da grade": a social media monta a grade do feed dos próximos 15 (ou 30) dias
// com as casas (pastas da Aprovação de capa) e manda um link só para a Thereza aprovar.

const STATUS_TONE: Record<FeedPlanSummary['status'], string> = {
  rascunho: 'bg-surface-muted text-ink-muted',
  enviado: 'bg-status-warning-soft text-status-warning',
  aprovado: 'bg-status-success-soft text-status-success',
};

const teamImage = (candidate: PlanCandidate, size: number) => candidate.editedUrl ?? driveThumb(candidate.driveId, size);
const folderLabel = (folder: CoverCollectionSummary) => coverFolderLabel(folder.houseName, folder.neighborhood, folder.houseNumber) || 'Sem nome';
/** amanhã, no fuso da Bahia */
const tomorrow = () => addDays(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' }), 1);

export function FeedPlanPanel() {
  const [view, setView] = useState<{ name: 'list' } | { name: 'new' } | { name: 'plan'; id: number }>({ name: 'list' });
  return (
    <div className="space-y-6">
      {view.name === 'list' && <PlanList onNew={() => setView({ name: 'new' })} onOpen={(id) => setView({ name: 'plan', id })} />}
      {view.name === 'new' && <NewPlan onBack={() => setView({ name: 'list' })} onCreated={(id) => setView({ name: 'plan', id })} />}
      {view.name === 'plan' && <PlanDetail id={view.id} onBack={() => setView({ name: 'list' })} />}
    </div>
  );
}

function BackLink({ onClick, label = 'Voltar para as grades' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
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
          <h2 id="plans-title" className="text-xl font-semibold tracking-[-0.02em] text-ink">Aprovação da grade</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Monte a grade do feed dos próximos dias com as casas e as capas candidatas, e mande um link só para a {APPROVER_NAME}.
            Ela vê como o feed vai ficar, troca posições, capas e casas, e aprova. 1 post por dia; domingo é Reels.
          </p>
        </div>
        {team.can('criar_publicacoes') && (
          <button type="button" onClick={onNew} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover">
            <Plus size={15} aria-hidden="true" /> Nova grade
          </button>
        )}
      </div>

      {state.status === 'loading' && <p role="status" className="text-sm text-ink-muted">Carregando…</p>}
      {state.status === 'error' && <p role="alert" className="rounded-control bg-status-warning-soft px-3 py-2 text-sm text-status-warning">{state.text}</p>}
      {state.status === 'ready' && state.plans.length === 0 && (
        <p className="rounded-panel border border-dashed border-border-strong p-6 text-center text-sm text-ink-muted">Nenhuma grade ainda. Comece por “Nova grade”.</p>
      )}
      {state.status === 'ready' && state.plans.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.plans.map((plan) => (
            <li key={plan.id}>
              <button type="button" onClick={() => onOpen(plan.id)} className="flex w-full flex-col gap-2 rounded-panel border border-border bg-surface p-4 text-left hover:border-border-strong hover:shadow-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                    <CalendarRange size={16} className="text-brand-plum" aria-hidden="true" /> {periodLabel(plan.startDate, plan.days)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
                </span>
                <span className="text-xs text-ink-muted">
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
  const [hour, setHour] = useState(DEFAULT_POST_HOUR);
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
    setError('O Google Drive não está conectado. Conecte na aba Aprovação de capa e volte aqui.');
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
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Escolher fotos no Drive</h2>
          <p className="mt-1 text-sm text-ink-muted">
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

  const usable = (folders ?? []).filter((folder) => folder.photoCount > 0);

  return (
    <section aria-labelledby="new-plan-title" className="space-y-5">
      <BackLink onClick={onBack} />
      <div>
        <h2 id="new-plan-title" className="text-xl font-semibold tracking-[-0.02em] text-ink">Nova grade</h2>
        <p className="mt-1 text-sm text-ink-muted">Escolha o período e as casas, na ordem em que devem entrar. As fotos de cada pasta da Aprovação de capa viram as capas candidatas.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-panel border border-border bg-surface p-4">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink">Começa em</span>
          <input type="date" value={startDate} onChange={(event) => event.target.value && setStartDate(event.target.value)} className="min-h-10 rounded-control border border-border bg-surface px-3 tabular-nums text-ink" />
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1 font-semibold text-ink">Período</legend>
          <div className="flex gap-2">
            {PLAN_DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={`min-h-10 rounded-control px-4 text-xs font-semibold ${days === option ? 'bg-brand-plum text-white' : 'border border-border text-ink hover:bg-surface-muted'}`}
              >
                {option} dias
              </button>
            ))}
          </div>
        </fieldset>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink">Horário dos posts</span>
          <select value={hour} onChange={(event) => setHour(Number(event.target.value))} className="min-h-10 rounded-control border border-border bg-surface px-3 tabular-nums text-ink">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <p className="text-xs text-ink-muted">
          {periodLabel(startDate, days)}: <strong className="text-ink">{needed} dias de post</strong> e {days - needed} {days - needed === 1 ? 'domingo' : 'domingos'} de Reels.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-ink">Casas ({selected.length} escolhidas)</h3>
            <button
              type="button"
              onClick={() => void openDrive()}
              disabled={checkingDrive}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              {checkingDrive ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FolderPlus size={14} aria-hidden="true" />} Escolher fotos no Drive
            </button>
          </div>
          <p className={`text-xs ${selected.length < needed ? 'text-status-warning' : 'text-ink-muted'}`}>
            {selected.length < needed
              ? `Faltam ${needed - selected.length} para preencher todos os dias (dá para criar assim e completar depois).`
              : selected.length > needed
                ? `${selected.length - needed} ${selected.length - needed === 1 ? 'fica' : 'ficam'} na reserva: a ${APPROVER_NAME} pode trocar por elas.`
                : 'Todos os dias preenchidos.'}
          </p>
        </div>
        {folders === null ? (
          <p role="status" className="text-sm text-ink-muted">Carregando as pastas…</p>
        ) : usable.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma casa com fotos ainda. Use “Escolher fotos no Drive” para separar as capas de cada casa.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {usable.map((folder) => {
              const order = selected.indexOf(folder.id);
              const isSelected = order >= 0;
              const date = isSelected ? postDates(startDate, days)[order] : undefined;
              return (
                <li key={folder.id}>
                  <button type="button" onClick={() => toggle(folder.id)} aria-pressed={isSelected} className="block w-full text-left">
                    <span className={`relative block aspect-[3/4] overflow-hidden rounded-control bg-surface-muted ${isSelected ? 'ring-4 ring-brand-plum ring-offset-2' : 'ring-1 ring-border hover:ring-2 hover:ring-border-strong'}`}>
                      {folder.coverDriveId && (
                        // eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor
                        <img src={folder.coverEditedUrl ?? driveThumb(folder.coverDriveId, 300)} alt="" className="h-full w-full object-cover" />
                      )}
                      {isSelected && (
                        <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-plum px-1.5 text-xs font-bold text-white">{order + 1}</span>
                      )}
                      {isSelected && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 text-[11px] font-medium text-white">{date ? shortDay(date) : 'Reserva'}</span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-ink">{folderLabel(folder)}</span>
                    <span className="block text-[11px] text-ink-muted">{folder.photoCount} {folder.photoCount === 1 ? 'foto' : 'fotos'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void create()}
          disabled={saving || selected.length === 0}
          className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-5 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
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

  const patch = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/grade/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok && data.plan) {
      apply(data.plan);
      return true;
    }
    setError('Não foi possível salvar a mudança.');
    return false;
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
        {error ? <p role="alert" className="rounded-control bg-status-warning-soft px-3 py-2 text-sm text-status-warning">{error}</p> : <p role="status" className="text-sm text-ink-muted">Carregando…</p>}
      </div>
    );
  }

  const scheduled = houses.filter((house) => house.slotDate).sort((a, b) => a.slotDate!.localeCompare(b.slotDate!));
  const freeDays = postDates(plan.startDate, plan.days).length - scheduled.length;

  return (
    <div className="space-y-6">
      <BackLink onClick={onBack} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-[-0.02em] text-ink">
            Grade de {periodLabel(plan.startDate, plan.days)}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {plan.days} dias · posts às {String(plan.hour).padStart(2, '0')}:00 · {scheduled.length} {scheduled.length === 1 ? 'casa' : 'casas'} na grade
            {freeDays > 0 ? ` · ${freeDays} ${freeDays === 1 ? 'dia livre' : 'dias livres'}` : ''}
            {saveState === 'saving' ? ' · salvando…' : saveState === 'saved' ? ' · salvo' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" onClick={() => void openAdd()} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-3.5 text-xs font-semibold text-ink hover:bg-surface-muted">
              <Plus size={15} aria-hidden="true" /> Adicionar casas
            </button>
          )}
          {team.can('apagar_publicacoes') && (
            <button type="button" onClick={() => void remove()} className="inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-xs font-semibold text-ink-muted hover:bg-status-danger-soft hover:text-status-danger">
              <Trash2 size={15} aria-hidden="true" /> Apagar grade
            </button>
          )}
        </div>
      </div>

      {plan.status === 'aprovado' && plan.respondedAt && (
        <section aria-label="Resposta da Thereza" className="space-y-2 rounded-panel border-2 border-status-success-border bg-status-success-soft p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-status-success">
            <Check size={18} strokeWidth={2.5} aria-hidden="true" /> {APPROVER_NAME} aprovou a grade em {formatLongStamp(plan.respondedAt)}
          </h3>
          {plan.feedback && <p className="rounded-control bg-surface px-3 py-2 text-sm text-ink">&ldquo;{plan.feedback}&rdquo;</p>}
          <p className="text-sm text-ink">
            A capa escolhida de cada casa já está aprovada na pasta dela, na Aprovação de capa, com a data do dia. Próximo passo: aprovação do carrossel de cada casa.
          </p>
          <ol className="grid gap-x-6 gap-y-1 text-xs text-ink sm:grid-cols-2">
            {scheduled.map((house) => (
              <li key={house.collectionId} className="tabular-nums"><span className="font-semibold">{shortDay(house.slotDate!)}</span> · {house.label}</li>
            ))}
          </ol>
        </section>
      )}

      {/* Link para a Thereza */}
      <section className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Link2 size={16} className="text-brand-plum" aria-hidden="true" /> Link da grade para a {APPROVER_NAME}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">Ela vê a grade como no Instagram, arrasta para trocar, escolhe as capas, troca casas pelas da reserva e aprova. As mudanças dela aparecem aqui.</p>
          </div>
          {team.can('enviar_link_aprovacao') &&
            (link ? (
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
                disabled={busy || scheduled.length === 0}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />} Gerar link
              </button>
            ))}
        </div>
        {link && <p className="mt-3 break-all rounded-control bg-canvas px-3 py-2 font-mono text-[11px] text-ink-muted">{link}</p>}
      </section>

      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}

      <div className="max-w-2xl">
        <FeedGridEditor houses={houses} startDate={plan.startDate} days={plan.days} published={plan.published} imageSrc={teamImage} onChange={change} readOnly={!canEdit} />
      </div>

      {adding && (
        <OnScreen>
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={(event) => event.target === event.currentTarget && setAdding(null)}>
          <section role="dialog" aria-modal="true" aria-label="Adicionar casas à reserva" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-panel bg-surface p-4 shadow-2xl sm:rounded-panel sm:p-6">
            <h3 className="text-base font-semibold text-ink">Adicionar casas</h3>
            <p className="mt-1 text-sm text-ink-muted">Entram na reserva. Depois é só tocar num dia livre ou trocar uma casa.</p>
            {adding.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">Todas as pastas com fotos já estão nesta grade.</p>
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
                      <span className="block aspect-[3/4] overflow-hidden rounded-control bg-surface-muted ring-1 ring-border hover:ring-2 hover:ring-brand-plum">
                        {folder.coverDriveId && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor
                          <img src={folder.coverEditedUrl ?? driveThumb(folder.coverDriveId, 300)} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <span className="mt-1 block truncate text-xs text-ink">{folderLabel(folder)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setAdding(null)} className="inline-flex min-h-10 items-center rounded-control border border-border px-4 text-xs font-semibold text-ink hover:bg-surface-muted">Pronto</button>
            </div>
          </section>
        </div>
        </OnScreen>
      )}
    </div>
  );
}
