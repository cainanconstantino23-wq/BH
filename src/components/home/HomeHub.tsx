'use client';

import Image from 'next/image';
import { Outfit } from 'next/font/google';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { BarChart3, CalendarDays, ChevronRight, CircleCheck, ImageUp, LayoutGrid, LogOut, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const outfit = Outfit({ subsets: ['latin'], weight: ['300', '400', '500'], display: 'swap' });

export type HubTarget = 'analytics' | 'approval' | 'planner' | 'feed' | 'capa';

// Fotos de Bruno Pinheiro para a Bahia Homes (Trancoso). Ficam em public/inicio.
const PHOTOS = [
  { src: '/inicio/casa-01.jpg', name: 'Casa Adriana Bozon', position: '50% 60%' },
  { src: '/inicio/casa-02.jpg', name: 'Casa Bruno e Cadija', position: '50% 55%' },
  { src: '/inicio/casa-03.jpg', name: 'Casa Cajueiro', position: '50% 50%' },
  { src: '/inicio/casa-04.jpg', name: 'Casa Floresta', position: '50% 50%' },
  { src: '/inicio/casa-05.jpg', name: 'Casa Limoeiro', position: '50% 55%' },
  { src: '/inicio/casa-06.jpg', name: 'Casa Mandacaru', position: '50% 60%' },
  { src: '/inicio/casa-07.jpg', name: 'Casa Santuário', position: '50% 55%' },
  { src: '/inicio/casa-08.jpg', name: 'Casa Santuário', position: '50% 60%' },
  { src: '/inicio/casa-09.jpg', name: 'Casa VOP', position: '50% 50%' },
  { src: '/inicio/casa-10.jpg', name: 'Ponta de Juacema', position: '50% 50%' },
];
const SLIDE_MS = 9000;

type DockItem = { key: HubTarget; name: string; hint: string; icon: LucideIcon; badge?: number };

// Molas no padrão da Apple (amortecimento 1 = sem quique; "duração visual" = resposta).
const MAGNIFY = { type: 'spring', bounce: 0, visualDuration: 0.28 } as const;
const PRESS = { type: 'spring', bounce: 0, visualDuration: 0.16 } as const;

function useMedia(query: string, fallback: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

function todayISO() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function HomeHub({
  firstName,
  canSeeAnalytics,
  onOpen,
  onSkip,
  onSignOut,
}: {
  firstName: string;
  canSeeAnalytics: boolean;
  onOpen: (target: HubTarget) => void;
  onSkip: () => void;
  onSignOut: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<{ pending: number; today: number } | null>(null);

  // troca de foto
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % PHOTOS.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, []);

  // resumo do dia (respeita o RLS de quem está logado)
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [pending, today] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('scheduled_date', todayISO()),
      ]);
      if (!active || pending.error || today.error) return;   // sem dados, sem avisos
      setCounts({ pending: pending.count ?? 0, today: today.count ?? 0 });
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const items: DockItem[] = [
    ...(canSeeAnalytics ? [{ key: 'analytics' as const, name: 'Analytics', hint: 'Alcance, visualizações e ranking', icon: BarChart3 }] : []),
    { key: 'approval', name: 'Aprovação', hint: counts?.pending ? `${counts.pending} aguardando` : 'Envie para o cliente aprovar', icon: CircleCheck, badge: counts?.pending || undefined },
    { key: 'planner', name: 'Calendário de posts', hint: 'Posts agendados por dia', icon: CalendarDays },
    { key: 'feed', name: 'Grade do feed', hint: 'Organize o perfil arrastando', icon: LayoutGrid },
    { key: 'capa', name: 'Aprovação de capa', hint: 'Fotos do Drive e capa do feed', icon: ImageUp },
  ];

  const photo = PHOTOS[index];
  // só a foto atual e a próxima ficam montadas (a próxima já vai carregando)
  const mounted = new Set([index, (index + 1) % PHOTOS.length]);

  return (
    <div className={`${outfit.className} relative h-dvh overflow-hidden bg-[#14110f] text-white`}>
      {PHOTOS.map((p, i) =>
        mounted.has(i) ? (
          <div
            key={p.src}
            aria-hidden="true"
            className={`absolute inset-0 transition-opacity duration-[1600ms] ease-out ${i === index ? 'opacity-100' : 'opacity-0'}`}
          >
            <Image
              src={p.src}
              alt=""
              fill
              sizes="100vw"
              preload={i === 0}
              className={`object-cover ${reduced ? '' : 'transition-transform duration-[10000ms] ease-linear'} ${i === index && !reduced ? 'scale-[1.045]' : 'scale-[1.01]'}`}
              style={{ objectPosition: p.position }}
            />
          </div>
        ) : null,
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgb(20 17 15 / .62) 0%, rgb(20 17 15 / .22) 32%, rgb(20 17 15 / .05) 55%, rgb(20 17 15 / .5) 100%), radial-gradient(70% 45% at 50% 28%, rgb(20 17 15 / .3), rgb(20 17 15 / 0) 70%)',
        }}
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 pl-[max(1.75rem,env(safe-area-inset-left))] pr-[max(1.75rem,env(safe-area-inset-right))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <Image src="/bahia-homes-logo-branca.png" alt="Bahia Homes" width={1834} height={276} preload className="h-auto w-28 drop-shadow-[0_1px_8px_rgb(0_0_0/0.25)] sm:w-44" />
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onSkip}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={PRESS}
            className="min-h-10 whitespace-nowrap rounded-full border border-white/30 bg-black/35 px-4 sm:px-[18px] text-[13px] font-medium tracking-[0.01em] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-150 hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime"
          >
            <span className="sm:hidden">Painel</span>
            <span className="hidden sm:inline">Ir para o painel</span>
          </motion.button>
          <motion.button
            type="button"
            onClick={onSignOut}
            aria-label="Sair da conta"
            whileTap={reduced ? undefined : { scale: 0.95 }}
            transition={PRESS}
            className="flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-black/35 px-3.5 text-[13px] font-medium tracking-[0.01em] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-150 hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime sm:px-[18px]"
          >
            <LogOut aria-hidden="true" size={15} strokeWidth={1.75} />
            <span className="hidden sm:inline">Sair</span>
          </motion.button>
        </div>
      </header>

      <section className="absolute left-1/2 top-[13%] z-10 w-[min(46rem,calc(100%-2rem))] -translate-x-1/2 text-center sm:top-[15%]">
        <h1 className="text-balance text-[clamp(2rem,4.2vw,3.25rem)] font-light leading-[1.05] tracking-[-0.03em] [text-shadow:0_2px_24px_rgb(0_0_0/0.35)]">
          Olá, {firstName}.
          <span className="mt-2 block text-[0.5em] font-light tracking-[-0.01em] text-white/90">Por onde começamos hoje?</span>
        </h1>
        {/* o que pede atenção hoje: é o que mais se destaca na tela */}
        <div className="mx-auto mt-6 flex min-h-[54px] max-w-sm flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:gap-2.5" aria-live="polite">
          {counts && (
            <>
              <SummaryCard
                value={counts.pending}
                label={counts.pending === 1 ? 'post aguardando aprovação' : 'posts aguardando aprovação'}
                emptyLabel="Nada aguardando aprovação"
                tone="warning"
                onClick={() => onOpen('approval')}
                reduced={reduced}
              />
              <SummaryCard
                value={counts.today}
                label={counts.today === 1 ? 'publicação agendada hoje' : 'publicações agendadas hoje'}
                emptyLabel="Nenhuma publicação hoje"
                tone="plum"
                onClick={() => onOpen('planner')}
                reduced={reduced}
              />
            </>
          )}
        </div>
      </section>

      <nav aria-label="Áreas do BH Analytics" className="absolute left-1/2 top-[58%] z-20 -translate-x-1/2 -translate-y-1/2 sm:top-[60%]">
        <Dock items={items} onOpen={onOpen} reduced={reduced} />
      </nav>

      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="absolute bottom-[calc(1.6rem+env(safe-area-inset-bottom))] left-[max(1.75rem,env(safe-area-inset-left))] z-10 hidden text-white sm:block"
        >
          <span className="block text-[15px] [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]">{photo.name}</span>
          <span className="text-xs tracking-[0.01em] text-white/90 [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]">Trancoso · foto Bruno Pinheiro</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({
  value,
  label,
  emptyLabel,
  tone,
  onClick,
  reduced,
}: {
  value: number;
  label: string;
  emptyLabel: string;
  tone: 'warning' | 'plum';
  onClick: () => void;
  reduced: boolean;
}) {
  const empty = value === 0;
  const numberColor = empty ? 'text-ink-muted' : tone === 'warning' ? 'text-status-warning' : 'text-brand-plum';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={PRESS}
      className="group flex min-h-[54px] w-full items-center gap-2.5 rounded-control border border-white/70 bg-surface/95 py-2 pl-3.5 pr-2.5 sm:w-auto text-left font-sans text-ink shadow-[0_18px_40px_-20px_rgb(0_0_0/0.6),0_2px_6px_-2px_rgb(0_0_0/0.18)] transition-colors duration-150 ease-out hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-lime"
    >
      {empty ? (
        <CircleCheck aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0 text-status-success" />
      ) : (
        <span className={`shrink-0 text-2xl font-semibold leading-none tracking-[-0.02em] tabular-nums ${numberColor}`}>{value}</span>
      )}
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink">{empty ? emptyLabel : label}</span>
      <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-ink-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
    </motion.button>
  );
}

function Dock({ items, onOpen, reduced }: { items: DockItem[]; onOpen: (target: HubTarget) => void; reduced: boolean }) {
  const mouseX = useMotionValue(Infinity);
  const finePointer = useMedia('(hover: hover) and (pointer: fine)', true);
  const narrow = useMedia('(max-width: 640px)', false);
  const base = narrow ? 48 : 56;
  const max = finePointer && !reduced ? 96 : base;

  return (
    <motion.div
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse') mouseX.set(e.clientX);
      }}
      onPointerLeave={() => mouseX.set(Infinity)}
      className="flex items-end gap-3 rounded-full border border-white/35 border-t-white/60 bg-white/20 px-3.5 pb-3 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.65),0_2px_6px_-2px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.35)] backdrop-blur-2xl backdrop-saturate-[1.8] sm:gap-3.5"
      style={{ height: base + 24 }}
    >
      {items.map((item) => (
        <DockIcon key={item.key} item={item} mouseX={mouseX} base={base} max={max} reduced={reduced} onOpen={onOpen} />
      ))}
    </motion.div>
  );
}

function DockIcon({
  item,
  mouseX,
  base,
  max,
  reduced,
  onOpen,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  base: number;
  max: number;
  reduced: boolean;
  onOpen: (target: HubTarget) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const RANGE = 170;

  // ampliação pela distância do cursor, numa curva suave até a borda do raio
  const target = useTransform(mouseX, (x) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !Number.isFinite(x)) return base;
    const d = Math.abs(x - (rect.left + rect.width / 2));
    if (d >= RANGE) return base;
    const f = Math.cos((d / RANGE) * (Math.PI / 2));
    return base + (max - base) * f * f;
  });
  const size = useSpring(target, MAGNIFY);
  const Icon = item.icon;

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {hover && (
          <motion.span
            role="presentation"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.86, filter: 'blur(4px)' }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.92, filter: 'blur(3px)' }}
            transition={{ type: 'spring', bounce: 0, visualDuration: 0.2 }}
            style={{ transformOrigin: '50% 100%' }}
            className="pointer-events-none absolute bottom-[calc(100%+12px)] whitespace-nowrap rounded-full border border-[#e1dee8] bg-white/95 px-3.5 py-2 text-center font-sans text-[13px] font-medium leading-none text-[#1f1b22] shadow-[0_10px_26px_-12px_rgb(0_0_0/0.5)]"
          >
            {item.name}
            <small className="mt-1 hidden text-[11px] font-normal tracking-[0.01em] text-[#6f6a66] sm:block">{item.hint}</small>
          </motion.span>
        )}
      </AnimatePresence>
      <motion.button
        ref={ref}
        type="button"
        aria-label={item.badge ? `${item.name}, ${item.badge} pendentes` : item.name}
        onClick={() => onOpen(item.key)}
        onHoverStart={() => setHover(true)}
        onHoverEnd={() => setHover(false)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setHover(true)}
        onBlur={() => setHover(false)}
        whileTap={reduced ? undefined : { scale: 0.9 }}
        transition={PRESS}
        style={{ width: size, height: size, transformOrigin: '50% 100%' }}
        className="grid place-items-center rounded-full border border-[#e1dee8]/90 bg-[radial-gradient(120%_100%_at_50%_0%,#fff_0%,#fff_55%,#f1eee9_100%)] text-[#1f1b22] shadow-[0_10px_22px_-12px_rgb(0_0_0/0.55),0_1px_2px_rgb(0_0_0/0.08)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-brand-lime"
      >
        <Icon aria-hidden="true" strokeWidth={1.75} className="h-[44%] w-[44%]" />
      </motion.button>
      {item.badge ? (
        <span aria-hidden="true" className="pointer-events-none absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-white bg-status-danger px-1.5 text-center font-sans text-[11px] font-semibold leading-[14px] text-white">
          {item.badge}
        </span>
      ) : null}
    </div>
  );
}
