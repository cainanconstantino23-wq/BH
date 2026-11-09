'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, History, Link2, LogOut, UserRound, Users } from 'lucide-react';
import { PRESET_LABELS, presetFor, useTeam } from '@/lib/team';

export type AccountPage = 'minha-conta' | 'equipe' | 'historico' | 'conexoes';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export function AccountMenu({
  pendingCount,
  current,
  onNavigate,
  onSignOut,
}: {
  pendingCount: number;
  current: string;
  onNavigate: (page: AccountPage) => void;
  onSignOut: () => void;
}) {
  const me = useTeam();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const items: { page: AccountPage; label: string; icon: typeof Users; show: boolean; badge?: number }[] = [
    { page: 'minha-conta', label: 'Minha conta', icon: UserRound, show: true },
    { page: 'equipe', label: 'Equipe', icon: Users, show: me.can('gerenciar_pessoas'), badge: pendingCount },
    { page: 'historico', label: 'Histórico', icon: History, show: me.can('ver_historico') },
    { page: 'conexoes', label: 'Conexões', icon: Link2, show: true },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta de ${me.name}${pendingCount ? `, ${pendingCount} cadastro(s) aguardando aprovação` : ''}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 items-center gap-2 rounded-xl py-1 pl-1 pr-2 text-left transition-colors duration-150 ease-out hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-plum text-[11px] font-semibold text-white">
          {initials(me.name)}
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-status-warning px-1 text-[10px] font-bold tabular-nums text-white">
              {pendingCount}
            </span>
          )}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-36 truncate text-xs font-semibold text-ink">{me.name}</span>
          <span className="block text-[11px] text-ink-muted">{PRESET_LABELS[presetFor(me.permissions)]}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`hidden text-ink-muted transition-transform duration-150 sm:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Conta"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-control border border-border bg-surface py-1 shadow-[0_12px_32px_-12px_rgb(35_27_45/0.28)]"
        >
          <div className="border-b border-border px-3.5 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{me.name}</p>
            <p className="truncate text-xs text-ink-muted">{me.email}</p>
          </div>
          {items
            .filter((item) => item.show)
            .map(({ page, label, icon: Icon, badge }) => (
              <button
                key={page}
                type="button"
                role="menuitem"
                aria-current={current === page ? 'page' : undefined}
                onClick={() => {
                  setOpen(false);
                  onNavigate(page);
                }}
                className={`flex min-h-10 w-full items-center gap-2.5 px-3.5 text-left text-sm transition-colors duration-150 ease-out hover:bg-surface-muted ${
                  current === page ? 'font-semibold text-brand-plum' : 'text-ink'
                }`}
              >
                <Icon size={16} aria-hidden="true" className="text-ink-muted" />
                <span className="flex-1">{label}</span>
                {badge ? (
                  <span className="rounded-full bg-status-warning-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-status-warning">
                    {badge} {badge === 1 ? 'novo' : 'novos'}
                  </span>
                ) : null}
              </button>
            ))}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex min-h-10 w-full items-center gap-2.5 px-3.5 text-left text-sm text-status-danger transition-colors duration-150 ease-out hover:bg-status-danger-soft"
            >
              <LogOut size={16} aria-hidden="true" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
