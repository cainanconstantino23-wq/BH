'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTeam } from '@/lib/team';
import { describeActivity, type ActivityRow } from '@/components/team/TeamPanel';

// Ações que geram notificação para quem acompanha o histórico.
const NOTIFY_ACTIONS = ['post.criado', 'post.aprovado', 'post.ajustes_solicitados', 'post.reprovado', 'equipe.cadastro'];

function relative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function NotificationBell({ onOpenTarget }: { onOpenTarget: (target: 'approval' | 'equipe' | 'historico') => void }) {
  const me = useTeam();
  const enabled = me.can('ver_historico');
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [shownSeenAt, setShownSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Até onde já li (cria o marcador na primeira vez, sem acumular o passado).
  useEffect(() => {
    if (!enabled || !me.userId) return;
    let active = true;
    const loadSeen = async () => {
      const { data } = await supabase.from('notification_reads').select('seen_at').eq('user_id', me.userId).maybeSingle();
      if (!active) return;
      if (data?.seen_at) {
        setSeenAt(data.seen_at);
      } else {
        const now = new Date().toISOString();
        await supabase.from('notification_reads').upsert({ user_id: me.userId, seen_at: now });
        if (active) setSeenAt(now);
      }
    };
    void loadSeen();
    return () => {
      active = false;
    };
  }, [enabled, me.userId]);

  // Últimas ações, ao vivo.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('id, created_at, actor_id, actor_label, action, entity_type, details')
        .in('action', NOTIFY_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!active) return;
      setItems(((data ?? []) as ActivityRow[]).filter((row) => row.actor_id !== me.userId).slice(0, 25));
    };
    void load();
    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [enabled, me.userId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!enabled) return null;

  const unread = seenAt ? items.filter((row) => row.created_at > seenAt).length : 0;

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setSeenAt(now);
    await supabase.from('notification_reads').upsert({ user_id: me.userId, seen_at: now });
  };

  const toggle = () => {
    if (!open) {
      // Mantém os destaques de "novo" enquanto o painel está aberto e marca como lidas.
      setShownSeenAt(seenAt);
      if (unread > 0) void markAllRead();
    }
    setOpen((value) => !value);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notificações: ${unread} novas` : 'Notificações'}
        onClick={toggle}
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-status-danger px-1 text-[10px] font-bold tabular-nums text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex max-h-[min(70dvh,32rem)] w-[min(92vw,24rem)] flex-col overflow-hidden rounded-control border border-border bg-surface shadow-[0_12px_32px_-12px_rgb(35_27_45/0.28)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Notificações</p>
            <button
              type="button"
              onClick={() => {
                setShownSeenAt(new Date().toISOString());
                void markAllRead();
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <CheckCheck size={14} aria-hidden="true" /> Marcar como lidas
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-muted">
              Nenhuma notificação ainda. Você é avisado quando alguém cria uma publicação, aprova ou reprova, ou se cadastra.
            </p>
          ) : (
            <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {items.map((row) => {
                const { icon: Icon, tone, text, note } = describeActivity(row);
                const isNew = shownSeenAt ? row.created_at > shownSeenAt : false;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenTarget(row.entity_type === 'equipe' ? 'equipe' : 'approval');
                      }}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface-muted ${isNew ? 'bg-status-info-soft/60' : ''}`}
                    >
                      <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink">{text}</span>
                        {note && <span className="mt-0.5 block truncate text-xs text-ink-muted">“{note}”</span>}
                        <span className="mt-0.5 block text-[11px] text-ink-muted">{relative(row.created_at)}</span>
                      </span>
                      {isNew && <span aria-label="nova" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-status-info" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenTarget('historico');
            }}
            className="border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-brand-plum hover:bg-surface-muted"
          >
            Ver histórico completo
          </button>
        </div>
      )}
    </div>
  );
}
