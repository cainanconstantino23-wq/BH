'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  History,
  KeyRound,
  MessageSquareWarning,
  PencilLine,
  ShieldBan,
  Trash2,
  UserCheck,
  UserPlus,
  UserRoundCog,
  UserX,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PRESETS,
  PRESET_LABELS,
  presetFor,
  useTeam,
  type Permission,
  type TeamMember,
  type TeamPreset,
} from '@/lib/team';

const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const timeOnly = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const displayName = (member: Pick<TeamMember, 'full_name' | 'email'>) => member.full_name || member.email || 'Sem nome';

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-border pb-5">
      <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor de permissões                                                */
/* ------------------------------------------------------------------ */

export function PermissionEditor({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: Permission[];
  onChange: (permissions: Permission[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const current = presetFor(value);
  const set = new Set(value);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-ink">Modelo</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as Exclude<TeamPreset, 'personalizado'>[]).map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={current === key}
              title={PRESETS[key].hint}
              onClick={() => onChange([...PRESETS[key].permissions])}
              className={`min-h-9 rounded-control border px-3 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50 ${
                current === key ? 'border-brand-plum bg-brand-plum text-white' : 'border-border bg-surface text-ink hover:bg-surface-muted'
              }`}
            >
              {PRESETS[key].label}
            </button>
          ))}
          {current === 'personalizado' && (
            <span className="inline-flex min-h-9 items-center rounded-control border border-dashed border-border-strong px-3 text-xs font-semibold text-ink-muted">
              Personalizado
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PERMISSION_GROUPS.map((group) => (
          <fieldset key={group.title} className="space-y-1.5">
            <legend className="mb-1 text-xs font-semibold text-ink-muted">{group.title}</legend>
            {group.items.map((item) => {
              const id = `${idPrefix}-${item.key}`;
              const checked = set.has(item.key);
              return (
                <label key={item.key} htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-md py-1 text-xs">
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      onChange(checked ? value.filter((permission) => permission !== item.key) : [...value, item.key])
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-plum"
                  />
                  <span>
                    <span className="block font-medium text-ink">{item.label}</span>
                    {item.hint && <span className="block text-ink-muted">{item.hint}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pessoas                                                             */
/* ------------------------------------------------------------------ */

export function PeoplePanel() {
  const me = useTeam();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Permission[]>>({});

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    const fetchMembers = async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('user_id, email, full_name, role, status, permissions, created_at, approved_at')
        .order('created_at', { ascending: true });
      if (!active) return;
      if (error) setMessage({ tone: 'error', text: 'Não foi possível carregar a equipe. Recarregue a página.' });
      else setMembers((data ?? []) as TeamMember[]);
    };
    void fetchMembers();
    const channel = supabase
      .channel(`team-members-people-${version}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => void fetchMembers())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [version]);

  const run = async (userId: string, action: () => PromiseLike<{ error: { message: string } | null }>, success: string) => {
    setBusyId(userId);
    setMessage(null);
    const { error } = await action();
    setBusyId(null);
    setConfirmRemoveId(null);
    if (error) {
      const text = error.message.includes('gerenciar pessoas')
        ? 'A equipe precisa de pelo menos uma pessoa ativa que possa gerenciar pessoas. Dê essa permissão a outra pessoa antes.'
        : `Não foi possível concluir: ${error.message}`;
      setMessage({ tone: 'error', text });
      return false;
    }
    setMessage({ tone: 'ok', text: success });
    load();
    return true;
  };

  const update = (userId: string, values: Record<string, unknown>) =>
    supabase.from('team_members').update(values).eq('user_id', userId);

  const draftFor = (member: TeamMember) => drafts[member.user_id] ?? (member.status === 'pendente' ? [...PRESETS.social.permissions] : member.permissions);
  const setDraft = (userId: string, permissions: Permission[]) => setDrafts((current) => ({ ...current, [userId]: permissions }));

  const approve = (member: TeamMember) => {
    const permissions = draftFor(member);
    if (!permissions.length) {
      setMessage({ tone: 'error', text: 'Marque pelo menos uma permissão antes de aprovar.' });
      return;
    }
    void run(
      member.user_id,
      () =>
        update(member.user_id, {
          status: 'ativo',
          permissions,
          role: presetFor(permissions),
          approved_by: me.userId,
          approved_at: new Date().toISOString(),
        }),
      `${displayName(member)} agora tem acesso (${PRESET_LABELS[presetFor(permissions)]}).`,
    );
  };

  const savePermissions = async (member: TeamMember) => {
    const permissions = draftFor(member);
    const ok = await run(
      member.user_id,
      () => update(member.user_id, { permissions, role: presetFor(permissions) }),
      `Permissões de ${displayName(member)} atualizadas.`,
    );
    if (ok) setEditingId(null);
  };

  const remove = (member: TeamMember) =>
    void run(
      member.user_id,
      async () => {
        const response = await fetch(`/api/team/${member.user_id}`, { method: 'DELETE' });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return { error: response.ok ? null : { message: body.error ?? `erro ${response.status}` } };
      },
      `${displayName(member)} foi removido(a) da equipe e o login foi bloqueado.`,
    );

  if (!members) {
    return (
      <p role="status" className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-muted">
        Carregando a equipe…
      </p>
    );
  }

  const pending = members.filter((member) => member.status === 'pendente');
  const active = members.filter((member) => member.status === 'ativo');
  const blocked = members.filter((member) => member.status === 'bloqueado');

  return (
    <div className="space-y-6">
      <PageHeader title="Equipe" description="Aprove quem se cadastrou e defina o que cada pessoa pode fazer no sistema." />

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-control border px-4 py-3 text-xs ${
            message.tone === 'error'
              ? 'border-status-danger-border bg-status-danger-soft text-status-danger'
              : 'border-status-success-border bg-status-success-soft text-status-success'
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Aguardando aprovação */}
      <section aria-labelledby="pending-title" className="space-y-3">
        <h2 id="pending-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <UserPlus size={16} aria-hidden="true" className="text-status-warning" />
          Aguardando aprovação
          <span className="text-xs font-normal tabular-nums text-ink-muted">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-control border border-dashed border-border bg-surface px-4 py-5 text-xs text-ink-muted">
            Ninguém aguardando. Quem criar uma conta na tela de login aparece aqui para você aprovar.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((member) => (
              <li key={member.user_id} className="space-y-4 rounded-panel border border-status-warning-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{displayName(member)}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {member.email}, cadastrou-se em {dateTime.format(new Date(member.created_at))}
                    </p>
                  </div>
                  <span className="rounded-full bg-status-warning-soft px-2.5 py-1 text-[11px] font-semibold text-status-warning">
                    Aguardando
                  </span>
                </div>
                <PermissionEditor
                  idPrefix={`pending-${member.user_id}`}
                  value={draftFor(member)}
                  onChange={(permissions) => setDraft(member.user_id, permissions)}
                  disabled={busyId === member.user_id}
                />
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    disabled={busyId === member.user_id}
                    onClick={() => approve(member)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
                  >
                    <UserCheck size={15} aria-hidden="true" /> Aprovar acesso
                  </button>
                  <button
                    type="button"
                    disabled={busyId === member.user_id}
                    onClick={() =>
                      void run(member.user_id, () => update(member.user_id, { status: 'bloqueado' }), `O cadastro de ${displayName(member)} foi recusado.`)
                    }
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border px-4 text-xs font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
                  >
                    <UserX size={15} aria-hidden="true" /> Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Equipe ativa */}
      <section aria-labelledby="active-title" className="space-y-3">
        <h2 id="active-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Users size={16} aria-hidden="true" className="text-ink-muted" />
          Equipe
          <span className="text-xs font-normal tabular-nums text-ink-muted">({active.length})</span>
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
          {active.map((member) => {
            const isMe = member.user_id === me.userId;
            const isEditing = editingId === member.user_id;
            return (
              <li key={member.user_id} className="px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {displayName(member)} {isMe && <span className="text-xs font-normal text-ink-muted">(você)</span>}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {member.email}, {PRESET_LABELS[presetFor(member.permissions)]} ({member.permissions.length} permissões)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isEditing}
                      onClick={() => {
                        setEditingId(isEditing ? null : member.user_id);
                        setDraft(member.user_id, member.permissions);
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-medium text-ink hover:bg-surface-muted"
                    >
                      <KeyRound size={14} aria-hidden="true" /> Permissões
                      <ChevronDown size={13} aria-hidden="true" className={`transition-transform duration-150 ${isEditing ? 'rotate-180' : ''}`} />
                    </button>
                    {!isMe && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === member.user_id}
                          onClick={() =>
                            void run(member.user_id, () => update(member.user_id, { status: 'bloqueado' }), `${displayName(member)} foi bloqueado(a).`)
                          }
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
                        >
                          <ShieldBan size={14} aria-hidden="true" /> Bloquear
                        </button>
                        <RemoveButton
                          confirming={confirmRemoveId === member.user_id}
                          disabled={busyId === member.user_id}
                          onAsk={() => setConfirmRemoveId(member.user_id)}
                          onCancel={() => setConfirmRemoveId(null)}
                          onConfirm={() => remove(member)}
                        />
                      </>
                    )}
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <PermissionEditor
                      idPrefix={`edit-${member.user_id}`}
                      value={draftFor(member)}
                      onChange={(permissions) => setDraft(member.user_id, permissions)}
                      disabled={busyId === member.user_id}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === member.user_id}
                        onClick={() => void savePermissions(member)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-brand-plum px-3.5 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
                      >
                        <Check size={14} aria-hidden="true" /> Salvar permissões
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-9 rounded-control px-3 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Bloqueados */}
      {blocked.length > 0 && (
        <section aria-labelledby="blocked-title" className="space-y-3">
          <h2 id="blocked-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldBan size={16} aria-hidden="true" className="text-ink-muted" />
            Bloqueados e recusados
            <span className="text-xs font-normal tabular-nums text-ink-muted">({blocked.length})</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {blocked.map((member) => (
              <li key={member.user_id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-muted">{displayName(member)}</p>
                  <p className="truncate text-xs text-ink-muted">{member.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === member.user_id || member.permissions.length === 0}
                    title={member.permissions.length === 0 ? 'Sem permissões: aprove de novo pela lista de pendentes' : undefined}
                    onClick={() =>
                      void run(
                        member.user_id,
                        () => update(member.user_id, { status: 'ativo', approved_by: me.userId, approved_at: new Date().toISOString() }),
                        `${displayName(member)} voltou a ter acesso.`,
                      )
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
                  >
                    <UserCheck size={14} aria-hidden="true" /> Reativar
                  </button>
                  {member.permissions.length === 0 && (
                    <button
                      type="button"
                      disabled={busyId === member.user_id}
                      onClick={() => void run(member.user_id, () => update(member.user_id, { status: 'pendente' }), `${displayName(member)} voltou para a lista de aprovação.`)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
                    >
                      <UserPlus size={14} aria-hidden="true" /> Rever cadastro
                    </button>
                  )}
                  <RemoveButton
                    confirming={confirmRemoveId === member.user_id}
                    disabled={busyId === member.user_id}
                    onAsk={() => setConfirmRemoveId(member.user_id)}
                    onCancel={() => setConfirmRemoveId(null)}
                    onConfirm={() => remove(member)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RemoveButton({
  confirming,
  disabled,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  disabled: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onAsk}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-3 text-xs font-medium text-status-danger hover:bg-status-danger-soft disabled:opacity-50"
      >
        <Trash2 size={14} aria-hidden="true" /> Remover
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-control border border-status-danger-border bg-status-danger-soft px-2 py-1 text-xs text-status-danger">
      Remover e bloquear o login?
      <button type="button" onClick={onConfirm} disabled={disabled} className="min-h-8 rounded-md px-2 font-semibold underline underline-offset-2">
        Sim
      </button>
      <button type="button" onClick={onCancel} className="min-h-8 rounded-md px-2 font-medium">
        Não
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Histórico                                                           */
/* ------------------------------------------------------------------ */

export interface ActivityRow {
  id: number;
  actor_id?: string | null;
  created_at: string;
  actor_label: string;
  action: string;
  entity_type: string;
  details: Record<string, unknown>;
}

type HistoryFilter = 'all' | 'post' | 'equipe';

const STATUS_LABEL: Record<string, string> = {
  pending: 'pendente',
  approved: 'aprovado',
  changes_requested: 'ajustes solicitados',
  rejected: 'reprovado',
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const formatSlot = (value: unknown) => {
  const text = str(value);
  if (!text) return '';
  const [date, time] = text.split(' ');
  const [, month, day] = (date ?? '').split('-');
  return day && month ? `${day}/${month}${time ? ` às ${time}` : ''}` : text;
};

const presetLabel = (value: unknown) => {
  const key = str(value);
  if (key in PRESET_LABELS) return PRESET_LABELS[key as TeamPreset];
  if (key === 'membro') return 'Membro';
  return key;
};

const permissionList = (value: unknown) =>
  Array.isArray(value) ? value.map((key) => PERMISSION_LABELS[key as Permission] ?? String(key)).join(', ') : '';

export function describeActivity(row: ActivityRow): { icon: LucideIcon; tone: string; text: string; note?: string } {
  const d = row.details ?? {};
  const who = row.actor_label;
  const title = str(d.titulo) ? `“${str(d.titulo)}”` : 'uma publicação';
  const comment = str(d.comentario) || undefined;
  switch (row.action) {
    case 'post.criado':
      return {
        icon: FilePlus2,
        tone: 'text-ink-muted',
        text: `${who} criou ${title}${str(d.data) ? ` para ${formatSlot(`${str(d.data)} ${str(d.horario)}`.trim())}` : ''}`,
      };
    case 'post.editado':
      return { icon: PencilLine, tone: 'text-ink-muted', text: `${who} editou ${title}` };
    case 'post.reagendado':
      return { icon: CalendarClock, tone: 'text-status-info', text: `${who} mudou ${title} de ${formatSlot(d.de)} para ${formatSlot(d.para)}` };
    case 'post.apagado':
      return { icon: Trash2, tone: 'text-status-danger', text: `${who} apagou ${title}` };
    case 'post.aprovado':
      return { icon: CheckCircle2, tone: 'text-status-success', text: `${who} aprovou ${title}`, note: comment };
    case 'post.ajustes_solicitados':
      return { icon: MessageSquareWarning, tone: 'text-status-warning', text: `${who} pediu ajustes em ${title}`, note: comment };
    case 'post.reprovado':
      return { icon: XCircle, tone: 'text-status-danger', text: `${who} reprovou ${title}`, note: comment };
    case 'post.aprovacao_reiniciada':
      return { icon: History, tone: 'text-ink-muted', text: `${who} voltou ${title} para ${STATUS_LABEL[str(d.para)] ?? 'pendente'}` };
    case 'equipe.cadastro':
      return { icon: UserPlus, tone: 'text-status-warning', text: `${str(d.pessoa) || who} se cadastrou${str(d.email) ? ` (${str(d.email)})` : ''}` };
    case 'equipe.aprovado':
      return {
        icon: UserCheck,
        tone: 'text-status-success',
        text: `${who} deu acesso a ${str(d.pessoa)} (${presetLabel(d.papel)})`,
        note: permissionList(d.permissoes) || undefined,
      };
    case 'equipe.bloqueado':
      return { icon: ShieldBan, tone: 'text-status-danger', text: `${who} ${str(d.de) === 'pendente' ? 'recusou o cadastro de' : 'bloqueou'} ${str(d.pessoa)}` };
    case 'equipe.papel_alterado':
    case 'equipe.permissoes_alteradas': {
      const added = permissionList(d.adicionadas);
      const removed = permissionList(d.removidas);
      const note = [added && `Recebeu: ${added}`, removed && `Perdeu: ${removed}`].filter(Boolean).join('. ');
      return { icon: UserRoundCog, tone: 'text-status-info', text: `${who} alterou as permissões de ${str(d.pessoa)}`, note: note || undefined };
    }
    case 'equipe.removido':
      return { icon: UserX, tone: 'text-status-danger', text: `${who} removeu ${str(d.pessoa)} da equipe` };
    default:
      return { icon: History, tone: 'text-ink-muted', text: `${who}: ${row.action}` };
  }
}

function dayHeading(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  const text = dayLong.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function HistoryPanel() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [person, setPerson] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error: loadError } = await supabase
        .from('activity_log')
        .select('id, created_at, actor_label, action, entity_type, details')
        .order('created_at', { ascending: false })
        .limit(300);
      if (!active) return;
      if (loadError) setError('Não foi possível carregar o histórico.');
      else setRows((data ?? []) as ActivityRow[]);
    };
    void load();
    const channel = supabase
      .channel('activity-log-history')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const people = useMemo(() => [...new Set((rows ?? []).map((row) => row.actor_label))].sort(), [rows]);
  const visible = useMemo(
    () => (rows ?? []).filter((row) => (filter === 'all' || row.entity_type === filter) && (!person || row.actor_label === person)),
    [rows, filter, person],
  );

  const groups: { day: string; items: ActivityRow[] }[] = [];
  for (const row of visible) {
    const day = dayHeading(row.created_at);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(row);
    else groups.push({ day, items: [row] });
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Histórico" description="Quem fez o quê: publicações criadas, reagendadas, aprovadas ou apagadas, e mudanças na equipe." />

      {error ? (
        <p role="alert" className="rounded-control border border-status-danger-border bg-status-danger-soft px-4 py-3 text-xs text-status-danger">
          {error}
        </p>
      ) : !rows ? (
        <p role="status" className="rounded-panel border border-border bg-surface p-6 text-sm text-ink-muted">
          Carregando o histórico…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Tipo de ação" className="flex rounded-control bg-surface-muted p-1">
              {(
                [
                  ['all', 'Tudo'],
                  ['post', 'Publicações'],
                  ['equipe', 'Equipe'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ease-out ${
                    filter === value ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              Quem
              <select
                value={person}
                onChange={(event) => setPerson(event.target.value)}
                className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs font-semibold text-ink"
              >
                <option value="">Todas as pessoas</option>
                {people.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-control border border-dashed border-border bg-surface px-4 py-6 text-center text-xs text-ink-muted">
              Nenhuma ação registrada {filter !== 'all' || person ? 'com esses filtros' : 'ainda'}. Criar, reagendar, aprovar ou apagar
              publicações e aprovar pessoas passa a ficar registrado aqui.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.day} aria-label={group.day} className="space-y-2">
                <h3 className="text-xs font-semibold text-ink-muted">{group.day}</h3>
                <ol className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
                  {group.items.map((row) => {
                    const { icon: Icon, tone, text, note } = describeActivity(row);
                    return (
                      <li key={row.id} className="flex gap-3 px-4 py-3">
                        <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink">{text}</p>
                          {note && <p className="mt-1 border-l-2 border-border pl-2 text-xs text-ink-muted">{note}</p>}
                        </div>
                        <time dateTime={row.created_at} className="shrink-0 text-xs tabular-nums text-ink-muted">
                          {timeOnly.format(new Date(row.created_at))}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Minha conta                                                         */
/* ------------------------------------------------------------------ */

export function MyAccountPanel() {
  const me = useTeam();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const changePassword = async () => {
    setMessage(null);
    if (password.length < 8) return setMessage({ tone: 'error', text: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    if (password !== confirm) return setMessage({ tone: 'error', text: 'As duas senhas não são iguais.' });
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return setMessage({ tone: 'error', text: `Não foi possível trocar a senha: ${error.message}` });
    setPassword('');
    setConfirm('');
    setMessage({ tone: 'ok', text: 'Senha trocada.' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Minha conta" description="Seus dados de acesso e o que você pode fazer no sistema." />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-panel border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Dados</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Nome</dt>
              <dd className="text-right text-ink">{me.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">E-mail</dt>
              <dd className="truncate text-right text-ink">{me.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Perfil</dt>
              <dd className="text-right text-ink">{PRESET_LABELS[presetFor(me.permissions)]}</dd>
            </div>
          </dl>
        </div>

        <form
          className="space-y-3 rounded-panel border border-border bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void changePassword();
          }}
        >
          <h2 className="text-sm font-semibold text-ink">Trocar senha</h2>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nova senha (mínimo 8 caracteres)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-10 w-full rounded-control border border-border bg-canvas px-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="min-h-10 w-full rounded-control border border-border bg-canvas px-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
          />
          {message && (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${message.tone === 'error' ? 'text-status-danger' : 'text-status-success'}`}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !password}
            className="min-h-10 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-panel border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Minhas permissões</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-xs font-semibold text-ink-muted">{group.title}</p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const allowed = me.can(item.key);
                  return (
                    <li key={item.key} className={`flex items-center gap-2 text-xs ${allowed ? 'text-ink' : 'text-ink-muted line-through decoration-ink-muted/50'}`}>
                      {allowed ? <Check size={13} aria-hidden="true" className="text-status-success" /> : <XCircle size={13} aria-hidden="true" />}
                      {item.label}
                      <span className="sr-only">{allowed ? '(permitido)' : '(não permitido)'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
