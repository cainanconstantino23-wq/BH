'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from 'motion/react';
import { Check, ChevronLeft, ChevronRight, Crop, Home, Loader2, Moon, Play, Plus, Search, Star, Sun, Trash2, Users, X } from 'lucide-react';
import type { DriveEntry } from '@/app/api/drive/list/route';
import type { DriveFolderHit } from '@/app/api/drive/search/route';
import type { CoverCollectionDetail, CoverCollectionSummary, CoverPhoto, EditedImage } from '@/lib/covers';
import { coverFolderLabel, houseFromFolderName, neighborhoodOptions } from '@/lib/house';
import { uploadMedia } from '@/lib/uploadImage';
import { useTeam } from '@/lib/team';
import { StudioPhotoViewer } from '@/components/capas/StudioPhotoViewer';
import { DRIVE_RETURN_KEY } from '@/components/drive/CoverApprovalPanel';

// "Selecionar capas": primeiro passo antes da grade. A social media navega nas pastas do Drive, abre a pasta de uma casa,
// vê todas as fotos, corta e favorita as que podem ser capa do feed e salva a casa (pasta da Aprovação de capa, kind 'capa').
// As casas salvas aqui aparecem na busca "Casas já preparadas" da Aprovação da grade.
//
// Visual no padrão Apple (skills apple-design + emil-design-eng, referência aiforui.dev):
// - cores do sistema Apple (modo escuro) sobre fundo quase preto, sem fundo em movimento;
// - fonte do sistema (SF Pro), títulos com tracking negativo e leading curto;
// - materiais translúcidos (blur + saturate) com borda de luz em cima; nunca vidro claro sobre vidro claro;
// - resposta no toque (scale 0.97 no pointer-down), molas sem quique (bounce 0) por padrão;
// - entradas de 0.95/8px com ease-out forte, saídas mais curtas; mesmo caminho na ida e na volta;
// - reduzir movimento: só cross-fade.

const SF: CSSProperties = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' };
const APPLE = {
  blue: '#0A84FF',
  indigo: '#5E5CE6',
  purple: '#BF5AF2',
  pink: '#FF375F',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  teal: '#64D2FF',
  green: '#30D158',
};
// tema claro/escuro: cores por variáveis CSS (--bg, --fg, --fill…), lidas pelas classes text-[var(--fg)] etc.
type Theme = 'dark' | 'light';
const THEME_KEY = 'bh-capas-tema';
const THEME_VARS: Record<Theme, CSSProperties> = {
  dark: {
    '--bg': '#0B0B12', '--fg': '#FFFFFF', '--fg2': 'rgba(255,255,255,0.64)', '--fg3': 'rgba(255,255,255,0.45)',
    '--fill': 'rgba(255,255,255,0.07)', '--fill2': 'rgba(255,255,255,0.12)', '--fill3': 'rgba(255,255,255,0.18)',
    '--line': 'rgba(255,255,255,0.08)', '--material': 'rgba(28,28,36,0.72)', '--bar': 'rgba(11,11,18,0.55)',
    '--sheet': '#1C1C1E', '--ring': '#1C1C24', colorScheme: 'dark',
  } as CSSProperties,
  light: {
    '--bg': '#F2F2F7', '--fg': '#1D1D1F', '--fg2': 'rgba(29,29,31,0.68)', '--fg3': 'rgba(29,29,31,0.48)',
    '--fill': 'rgba(0,0,0,0.045)', '--fill2': 'rgba(0,0,0,0.08)', '--fill3': 'rgba(0,0,0,0.12)',
    '--line': 'rgba(0,0,0,0.08)', '--material': 'rgba(255,255,255,0.74)', '--bar': 'rgba(242,242,247,0.72)',
    '--sheet': '#FFFFFF', '--ring': '#FFFFFF', colorScheme: 'light',
  } as CSSProperties,
};
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

/** Botão de tema: sol (claro) / lua (escuro), troca com um giro curto. */
function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const light = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
      title={light ? 'Tema escuro' : 'Tema claro'}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--fill2)] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)] active:scale-[0.94]"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -60, scale: 0.8 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 60, scale: 0.8, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="flex"
        >
          {light ? <Moon size={17} strokeWidth={2.2} aria-hidden="true" /> : <Sun size={17} strokeWidth={2.2} aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const SPRING: Transition = { type: 'spring', bounce: 0, duration: 0.4 };
const SHEET: Transition = { type: 'spring', bounce: 0.12, duration: 0.35 };
const PRESS = { scale: 0.97 };

const thumb = (id: string, size = 600) => `/api/drive/thumb/${encodeURIComponent(id)}?s=${size}`;
const searchKey = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// só "Compartilhados comigo": Meu Drive e drives da equipe bloqueados (src/lib/google/driveAccess.ts)
type Source = 'shared';
const SOURCES: { key: Source; label: string; icon: typeof Users }[] = [{ key: 'shared', label: 'Compartilhados comigo', icon: Users }];
interface Crumb { id: string; name: string }
interface HouseFolder { id: string; name: string; parentName: string }
type StudioView = 'drive' | 'casas';

// cascata curta: uma entrada por container, 40ms entre itens, só os primeiros animam
const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } };
const rise: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } } };

/** Ícone do Google Drive (as três cores do triângulo). */
function DriveLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

/** Ícone de pasta no estilo macOS (azul, com aba). */
function FolderGlyph({ done = false }: { done?: boolean }) {
  return (
    <span className="relative flex h-11 w-12 shrink-0 items-end justify-center" aria-hidden="true">
      <svg viewBox="0 0 48 40" className="h-11 w-12">
        <path d="M4 8a4 4 0 0 1 4-4h11l4 4h17a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#1F7AE0" />
        <path d="M4 14a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="url(#folderFace)" />
        <defs>
          <linearGradient id="folderFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6CC2FF" />
            <stop offset="1" stopColor="#2D95F5" />
          </linearGradient>
        </defs>
      </svg>
      {done && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-black ring-2 ring-[var(--bg)]" style={{ background: APPLE.green }}>
          <Check size={12} strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

/** Fundo colorido e parado: degradê com as cores do sistema Apple sobre quase preto. */
function Mesh({ variant }: { variant: 'intro' | 'studio' }) {
  const { theme } = useContext(ThemeContext);
  const background =
    theme === 'light'
      ? variant === 'intro'
        ? `radial-gradient(60% 70% at 15% 20%, ${APPLE.purple}73 0%, transparent 60%),
           radial-gradient(55% 60% at 85% 25%, ${APPLE.pink}66 0%, transparent 60%),
           radial-gradient(60% 65% at 70% 90%, ${APPLE.orange}66 0%, transparent 60%),
           radial-gradient(70% 70% at 20% 95%, ${APPLE.blue}66 0%, transparent 60%),
           #F2F2F7`
        : `radial-gradient(70% 55% at 10% 0%, ${APPLE.blue}33 0%, transparent 60%),
           radial-gradient(60% 50% at 95% 10%, ${APPLE.indigo}2b 0%, transparent 60%),
           radial-gradient(60% 50% at 80% 100%, ${APPLE.pink}24 0%, transparent 60%),
           #F2F2F7`
      : variant === 'intro'
      ? `radial-gradient(60% 70% at 15% 20%, ${APPLE.purple}cc 0%, transparent 60%),
         radial-gradient(55% 60% at 85% 25%, ${APPLE.pink}b3 0%, transparent 60%),
         radial-gradient(60% 65% at 70% 90%, ${APPLE.orange}a6 0%, transparent 60%),
         radial-gradient(70% 70% at 20% 95%, ${APPLE.blue}cc 0%, transparent 60%),
         #0B0B12`
      : `radial-gradient(70% 55% at 10% 0%, ${APPLE.blue}66 0%, transparent 60%),
         radial-gradient(60% 50% at 95% 10%, ${APPLE.indigo}59 0%, transparent 60%),
         radial-gradient(60% 50% at 80% 100%, ${APPLE.purple}38 0%, transparent 60%),
         #0B0B12`;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background }} />;
}

/** Vindo da Tabela de postagens: abrir direto a casa salva (houseId) ou buscar o nome dela no Drive (search). */
export interface CoverStudioRequest { houseId: number | null; search: string }

/** Tema do estúdio (claro padrão; escuro se a pessoa escolheu, guardado em bh-capas-tema). */
function useStudioTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      // tema claro é o padrão; escuro só se a pessoa escolheu
      return typeof window !== 'undefined' && window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const themeValue = useMemo(
    () => ({
      theme,
      toggle: () =>
        setTheme((current) => {
          const next: Theme = current === 'light' ? 'dark' : 'light';
          try {
            window.localStorage.setItem(THEME_KEY, next);
          } catch {
            // sem localStorage: vale só nesta visita
          }
          return next;
        }),
    }),
    [theme],
  );
  return themeValue;
}

/**
 * Estúdio aberto por cima de outra tela (Tabela de postagens): já na casa salva (houseId) ou buscando o nome no Drive.
 * "Voltar" e o X fecham e devolvem para a tela de onde veio, do jeito que estava.
 */
export function CoverStudioOverlay({ request, backLabel, onClose }: { request: CoverStudioRequest; backLabel: string; onClose: () => void }) {
  const reduce = useReducedMotion();
  const themeValue = useStudioTheme();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <ThemeContext.Provider value={themeValue}>
      {createPortal(
        <motion.div
          style={{ ...SF, ...THEME_VARS[themeValue.theme] }}
          className="fixed inset-0 z-[70] overflow-hidden bg-[var(--bg)] text-[var(--fg)]"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={closing ? { opacity: 0, scale: reduce ? 1 : 0.98 } : { opacity: 1, scale: 1 }}
          transition={{ duration: closing ? 0.18 : 0.26, ease: EASE_OUT }}
          onAnimationComplete={() => closing && onClose()}
        >
          <Mesh variant="studio" />
          <Studio
            initialView={request.houseId ? 'casas' : 'drive'}
            initialHouseId={request.houseId}
            initialSearch={request.search}
            exitLabel={backLabel}
            onClose={() => setClosing(true)}
          />
        </motion.div>,
        document.body,
      )}
    </ThemeContext.Provider>
  );
}

export function CoverStudio() {
  const reduce = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // o círculo nasce no botão e volta para ele (mesmo caminho na ida e na volta)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [startView, setStartView] = useState<StudioView>('drive');
  const housesButtonRef = useRef<HTMLButtonElement>(null);
  const themeValue = useStudioTheme();
  const theme = themeValue.theme;

  const start = (view: StudioView = 'drive') => {
    setStartView(view);
    const rect = (view === 'casas' ? housesButtonRef : buttonRef).current?.getBoundingClientRect();
    setOrigin(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setClosing(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const circle = (radius: string) => `circle(${radius} at ${origin?.x ?? 0}px ${origin?.y ?? 0}px)`;

  return (
    <ThemeContext.Provider value={themeValue}>
    <section aria-label="Selecionar capas" style={{ ...SF, ...THEME_VARS[theme] }} className="relative isolate flex min-h-[calc(100dvh-9rem)] items-center justify-center overflow-hidden rounded-[28px] transition-colors duration-300">
      <Mesh variant="intro" />
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="relative flex flex-col items-center gap-4">
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={() => start('drive')}
        initial={reduce ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        whileTap={PRESS}
        className="relative inline-flex h-16 items-center gap-3 rounded-full pl-2.5 pr-8 text-[19px] font-semibold tracking-[-0.01em] text-white shadow-[0_18px_50px_-12px_rgba(10,132,255,0.75),inset_0_1px_0_rgba(255,255,255,0.25)] transition-[filter] duration-200 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white sm:h-[72px] sm:text-[21px] [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110"
        style={{ background: APPLE.blue }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white sm:h-[52px] sm:w-[52px]">
          <DriveLogo className="h-6 w-6 sm:h-7 sm:w-7" />
        </span>
        Selecionar Capas
      </motion.button>
      {/* atalho para as casas que já têm capas selecionadas */}
      <motion.button
        ref={housesButtonRef}
        type="button"
        onClick={() => start('casas')}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: EASE_OUT }}
        whileTap={PRESS}
        className="inline-flex h-12 items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--material)] pl-2 pr-5 text-[16px] font-semibold tracking-[-0.01em] text-[var(--fg)] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0A84FF] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--sheet)]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: APPLE.blue }}>
          <Home size={16} strokeWidth={2.4} className="text-white" aria-hidden="true" />
        </span>
        Casas com capas selecionadas
      </motion.button>
      </div>

      {open &&
        createPortal(
          <motion.div
            style={{ ...SF, ...THEME_VARS[theme] }}
            className="fixed inset-0 z-[70] overflow-hidden bg-[var(--bg)] text-[var(--fg)]"
            initial={reduce ? { opacity: 0 } : { clipPath: circle('0px') }}
            animate={reduce ? { opacity: closing ? 0 : 1 } : { clipPath: closing ? circle('0px') : circle('150vmax') }}
            transition={reduce ? { duration: 0.2 } : { duration: closing ? 0.42 : 0.62, ease: EASE_IN_OUT }}
            onAnimationComplete={() => {
              if (closing) {
                setOpen(false);
                setClosing(false);
              }
            }}
          >
            {/* a cor do botão cobre a tela e se dissolve no fundo do estúdio */}
            <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: APPLE.blue }} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: reduce ? 0 : 0.45, duration: 0.5, ease: EASE_OUT }} />
            <Mesh variant="studio" />
            <Studio initialView={startView} onClose={() => setClosing(true)} />
          </motion.div>,
          document.body,
        )}
    </section>
    </ThemeContext.Provider>
  );
}

/** Conteúdo do estúdio: pastas do Drive → fotos da casa → salvar. */
/** exitLabel: aberto por cima de outra tela; o primeiro nível ganha "‹ exitLabel" que fecha (volta para lá). */
function Studio({ initialView, initialHouseId = null, initialSearch = '', exitLabel, onClose }: { initialView: StudioView; initialHouseId?: number | null; initialSearch?: string; exitLabel?: string; onClose: () => void }) {
  const [drive, setDrive] = useState<'checking' | 'ok' | { canConnect: boolean }>('checking');
  const [view, setView] = useState<StudioView>(initialView);
  const [house, setHouse] = useState<HouseFolder | null>(null);
  const [saved, setSaved] = useState<Map<string, string>>(new Map()); // pasta do Drive → nome da casa salva
  const [done, setDone] = useState<SavedResult | null>(null);

  useEffect(() => {
    fetch('/api/drive/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => setDrive(status?.connected ? 'ok' : { canConnect: Boolean(status?.canConnect) }))
      .catch(() => setDrive({ canConnect: false }));
  }, []);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(null), done.driveOk ? 3200 : 7000);
    return () => window.clearTimeout(timer);
  }, [done]);

  // Esc fecha o estúdio (quando nenhuma tela está aberta por cima)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !house && view === 'drive' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [house, view, onClose]);

  if (view === 'casas') {
    return (
      <div className="relative flex h-full flex-col">
        <SavedHouses initialOpenId={initialHouseId} exitLabel={exitLabel} onClose={onClose} onOpenDrive={() => setView('drive')} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {drive === 'checking' ? (
        <Centered><Loader2 size={26} className="animate-spin text-[var(--fg2)]" aria-label="Verificando o Google Drive" /></Centered>
      ) : drive !== 'ok' ? (
        <>
          <Toolbar onClose={onClose} title="Selecionar capas" />
          <Centered>
            <Material className="max-w-sm p-7 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white"><DriveLogo className="h-8 w-8" /></span>
              <p className="mt-4 text-[22px] font-semibold tracking-[-0.02em]">Conecte o Google Drive</p>
              <p className="mt-1.5 text-[15px] text-[var(--fg2)]">As pastas das casas vêm do Drive da equipe.</p>
              {drive.canConnect ? (
                <a
                  href="/api/auth/google/login"
                  onClick={() => {
                    try {
                      sessionStorage.setItem(DRIVE_RETURN_KEY, 'capas');
                    } catch {
                      // sem sessionStorage: volta para a tela inicial
                    }
                  }}
                  className="mt-6 inline-flex h-11 items-center rounded-full px-6 text-[15px] font-semibold text-white active:scale-[0.97]"
                  style={{ background: APPLE.blue }}
                >
                  Conectar Google Drive
                </a>
              ) : (
                <p className="mt-4 text-[13px] text-[var(--fg2)]">Peça a um administrador para conectar.</p>
              )}
            </Material>
          </Centered>
        </>
      ) : (
        <div className="relative min-h-0 flex-1">
          {/* empurra para a esquerda ao abrir a casa; volta pela direita (mesmo caminho) */}
          <AnimatePresence initial={false} mode="popLayout">
            {house ? (
              <motion.div key={`house-${house.id}`} className="absolute inset-0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2, ease: EASE_OUT } }} transition={{ duration: 0.32, ease: EASE_OUT }}>
                <HouseView
                  folder={house}
                  onClose={onClose}
                  onBack={() => setHouse(null)}
                  onSaved={(result) => {
                    setSaved((current) => new Map(current).set(house.id, result.label));
                    setDone(result);
                    setHouse(null);
                  }}
                />
              </motion.div>
            ) : (
              <motion.div key="browser" className="absolute inset-0" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40, transition: { duration: 0.2, ease: EASE_OUT } }} transition={{ duration: 0.32, ease: EASE_OUT }}>
                <FolderBrowser initialQuery={initialSearch} exitLabel={exitLabel} saved={saved} onOpenHouse={setHouse} onClose={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>{done && <SavedHud result={done} />}</AnimatePresence>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}

/** Material translúcido escuro (vidro): blur + saturate, borda de luz em cima. */
function Material({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[22px] border border-[var(--line)] bg-[var(--material)] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl backdrop-saturate-150 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** Barra de cima translúcida (o conteúdo rola por baixo): fechar à esquerda, título, ações. */
function Toolbar({ onClose, onBack, backLabel, title, children }: { onClose: () => void; onBack?: () => void; backLabel?: string; title: string; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bar)] backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-8">
        <motion.button type="button" onClick={onClose} whileTap={PRESS} aria-label="Fechar Selecionar capas" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fill2)] text-[var(--fg2)] hover:bg-[var(--fill3)]">
          <X size={18} strokeWidth={2.4} aria-hidden="true" />
        </motion.button>
        {onBack && (
          <motion.button type="button" onClick={onBack} whileTap={PRESS} className="inline-flex h-9 min-w-0 items-center gap-0.5 rounded-full pl-1.5 pr-3 text-[15px] font-medium hover:bg-[var(--fill2)]" style={{ color: APPLE.blue }}>
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" /> <span className="truncate">{backLabel}</span>
          </motion.button>
        )}
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold tracking-[-0.01em] text-[var(--fg)]">{title}</p>
        <div className="flex shrink-0 items-center gap-2">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

/** Controle segmentado (Apple): o indicador desliza com mola sem quique. */
function Segmented({ value, onChange }: { value: Source | null; onChange: (value: Source) => void }) {
  return (
    <div role="tablist" aria-label="Origem das pastas" className="inline-flex rounded-[10px] bg-[var(--fill2)] p-0.5">
      {SOURCES.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button key={key} type="button" role="tab" aria-selected={active} onClick={() => onChange(key)} className={`relative inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] ${active ? 'text-[var(--fg)]' : 'text-[var(--fg2)] hover:text-[var(--fg)]'}`}>
            {active && <motion.span layoutId="source-pill" className="absolute inset-0 rounded-[8px] bg-[var(--fill3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" transition={SPRING} />}
            <Icon size={14} className="relative" aria-hidden="true" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Campo de busca no estilo Apple. */
function SearchField({ value, onChange, busy, placeholder }: { value: string; onChange: (value: string) => void; busy: boolean; placeholder: string }) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{placeholder}</span>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg3)]" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[10px] bg-[var(--fill2)] pl-9 pr-9 text-[15px] text-[var(--fg)] placeholder:text-[var(--fg3)] transition-colors focus:bg-[var(--fill3)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[#0A84FF]"
      />
      {busy && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--fg3)]" aria-label="Buscando" />}
    </label>
  );
}

/** Pastas do Drive; a pasta com fotos abre a casa. Busca o Drive inteiro pelo nome da pasta. */
function FolderBrowser({ initialQuery = '', exitLabel, saved, onOpenHouse, onClose }: { initialQuery?: string; exitLabel?: string; saved: Map<string, string>; onOpenHouse: (folder: HouseFolder) => void; onClose: () => void }) {
  const [source, setSource] = useState<Source>('shared');
  const [path, setPath] = useState<Crumb[]>([]);
  const [entries, setEntries] = useState<DriveEntry[] | null>(null);
  const [error, setError] = useState('');
  // direção da navegação: entrar desliza da direita, voltar da esquerda
  const [direction, setDirection] = useState(1);
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<DriveFolderHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const isSearch = query.trim().length >= 2;
  const folderId = path.length ? path[path.length - 1].id : source;
  const parentName = path.length > 1 ? path[path.length - 2].name : '';

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/drive/list?folder=${encodeURIComponent(folderId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(response.status));
        setEntries(data.entries ?? []);
        setError('');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setEntries([]);
        setError('Não foi possível abrir esta pasta.');
      });
    return () => controller.abort();
  }, [folderId]);

  // busca no Drive inteiro quando a pessoa para de digitar
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/drive/search?q=${encodeURIComponent(text)}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          setHits(response.ok ? (data.folders ?? []) : []);
        })
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setSearching(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (nextPath: Crumb[], nextSource: Source = source) => {
    setDirection(nextPath.length >= path.length && nextSource === source ? 1 : -1);
    setEntries(null);
    setQuery('');
    setHits(null);
    setSource(nextSource);
    setPath(nextPath);
  };

  const folders = (entries ?? []).filter((entry) => entry.kind === 'folder');
  const images = (entries ?? []).filter((entry) => entry.kind === 'image');
  const current = path[path.length - 1];
  const sourceLabel = SOURCES.find((item) => item.key === source)?.label ?? 'Drive';

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <Toolbar
        onClose={onClose}
        onBack={path.length && !isSearch ? () => go(path.slice(0, -1)) : exitLabel ? onClose : undefined}
        backLabel={path.length && !isSearch ? (path.length > 1 ? path[path.length - 2].name : sourceLabel) : exitLabel ?? sourceLabel}
        title={isSearch ? 'Buscar no Drive' : current?.name ?? 'Selecionar capas'}
      />

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-8">
        {!path.length && !isSearch && (
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.35 }} className="text-[34px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[44px]">
            Escolha a pasta da casa
          </motion.h1>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:max-w-md sm:flex-1">
            <SearchField
              value={query}
              onChange={(value) => {
                setQuery(value);
                if (value.trim().length < 2) setHits(null);
              }}
              busy={searching && isSearch}
              placeholder="Buscar pasta em todo o Drive"
            />
          </div>
          {!isSearch && <Segmented value={path.length ? null : source} onChange={(key) => go([], key)} />}
        </div>

        {isSearch ? (
          <section aria-label="Resultados da busca" className="mt-6">
            <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-[var(--fg3)]">
              {hits === null ? 'Buscando em todo o Drive…' : hits.length === 0 ? 'Nenhuma pasta com esse nome' : `${hits.length} ${hits.length === 1 ? 'pasta' : 'pastas'} em todo o Drive`}
            </p>
            {hits && hits.length > 0 && (
              <motion.ul key={query} variants={list} initial="hidden" animate="show" className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {hits.map((hit, index) => (
                  <motion.li key={hit.id} variants={index < 12 ? rise : undefined}>
                    <FolderRow
                      name={hit.name}
                      detail={hit.parentName ? `em ${hit.parentName}` : undefined}
                      done={saved.has(hit.id)}
                      onOpen={() => go(hit.parentId && hit.parentName ? [{ id: hit.parentId, name: hit.parentName }, { id: hit.id, name: hit.name }] : [{ id: hit.id, name: hit.name }])}
                    />
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </section>
        ) : (
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={folderId}
              custom={direction}
              initial={{ opacity: 0, x: 24 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 * direction, transition: { duration: 0.15, ease: EASE_OUT } }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
            >
              {/* pasta com fotos: abrir a casa */}
              {images.length > 0 && current && (
                <Material className="mt-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-3">
                      {images.slice(0, 3).map((image, index) => (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor
                        <img key={image.id} src={thumb(image.id, 160)} alt="" className="h-14 w-11 rounded-[8px] object-cover ring-2 ring-[var(--ring)]" style={{ transform: `rotate(${(index - 1) * 5}deg)` }} />
                      ))}
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold tracking-[-0.01em]">{images.length} {images.length === 1 ? 'foto' : 'fotos'}</p>
                      <p className="text-[13px] text-[var(--fg2)]">{saved.has(current.id) ? `Salva como ${saved.get(current.id)}. Dá para acrescentar.` : 'Veja todas, corte e favorite as capas.'}</p>
                    </div>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={PRESS}
                    onClick={() => onOpenHouse({ id: current.id, name: current.name, parentName })}
                    className="inline-flex h-11 items-center justify-center gap-1 rounded-full px-5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110"
                    style={{ background: APPLE.blue }}
                  >
                    Ver fotos <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
                  </motion.button>
                </Material>
              )}

              {entries === null ? (
                <div className="mt-10 flex items-center gap-2.5 text-[15px] text-[var(--fg2)]"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Abrindo…</div>
              ) : (
                <>
                  {error && <p role="alert" className="mt-6 text-[15px]" style={{ color: APPLE.pink }}>{error}</p>}
                  {folders.length > 0 && (
                    <motion.ul variants={list} initial="hidden" animate="show" className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {folders.map((entry, index) => (
                        <motion.li key={entry.id} variants={index < 12 ? rise : undefined}>
                          <FolderRow name={entry.name} done={saved.has(entry.id)} onOpen={() => go([...path, { id: entry.id, name: entry.name }])} />
                        </motion.li>
                      ))}
                    </motion.ul>
                  )}
                  {!error && folders.length === 0 && images.length === 0 && <p className="mt-10 text-[15px] text-[var(--fg3)]">Pasta vazia.</p>}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function FolderRow({ name, detail, done, onOpen }: { name: string; detail?: string; done: boolean; onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="flex min-h-[68px] w-full items-center gap-3 rounded-[16px] bg-[var(--fill)] px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--fill2)]"
    >
      <FolderGlyph done={done} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium leading-[1.3] tracking-[-0.01em]">{name}</span>
        {(detail || done) && <span className="mt-0.5 block truncate text-[13px] text-[var(--fg3)]">{done ? 'Capas salvas' : detail}</span>}
      </span>
      <ChevronRight size={18} className="shrink-0 text-[var(--fg3)]" aria-hidden="true" />
    </motion.button>
  );
}

/** Todas as fotos da pasta da casa: tocar abre grande (cortar, favoritar); ★ favorita direto. */
/** addTo: abre a pasta para pôr mais capas numa casa já salva (as que já são capa aparecem marcadas e não entram de novo). */
interface AddToHouse { id: number; label: string; existing: Set<string> }

function HouseView({ folder, onBack, onClose, onSaved, addTo, backLabel = 'Pastas' }: { folder: HouseFolder; onBack: () => void; onClose: () => void; onSaved: (result: SavedResult) => void; addTo?: AddToHouse; backLabel?: string }) {
  const team = useTeam();
  const reduce = useReducedMotion();
  const [images, setImages] = useState<DriveEntry[] | null>(null);
  const [videos, setVideos] = useState<DriveEntry[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Map<string, EditedImage>>(new Map());
  const [viewing, setViewing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [adding, setAdding] = useState('');
  const [addError, setAddError] = useState('');

  // todas as páginas da pasta (pastas grandes passam de 300 arquivos)
  useEffect(() => {
    let active = true;
    (async () => {
      const all: DriveEntry[] = [];
      const clips: DriveEntry[] = [];
      let page: string | null = null;
      try {
        do {
          // videos=1: os vídeos da pasta também vêm, só para assistir (não viram capa)
          const response: Response = await fetch(`/api/drive/list?folder=${encodeURIComponent(folder.id)}&videos=1${page ? `&page=${encodeURIComponent(page)}` : ''}`, { cache: 'no-store' });
          const data = await response.json();
          if (!response.ok) throw new Error(String(response.status));
          all.push(...(data.entries as DriveEntry[]).filter((entry) => entry.kind === 'image'));
          clips.push(...(data.entries as DriveEntry[]).filter((entry) => entry.kind === 'video'));
          page = data.nextPage;
        } while (page && all.length + clips.length < 1500);
        if (active) {
          setImages(all);
          setVideos(clips);
        }
      } catch {
        if (active) {
          setImages([]);
          setError('Não foi possível abrir as fotos desta pasta.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [folder.id]);

  const toggle = useCallback((id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const photos: CoverPhoto[] = useMemo(
    () =>
      (images ?? []).map((entry) => ({
        driveId: entry.id,
        name: entry.name,
        width: entry.width ?? null,
        height: entry.height ?? null,
        favorite: favorites.has(entry.id),
        approved: false,
        edited: edits.get(entry.id) ?? null,
        addedBy: null,
        addedAt: null,
        favoritedBy: null,
        favoritedAt: null,
        favoritedByApprover: false,
        approvedBy: null,
        approvedAt: null,
        editedBy: null,
        editedAt: null,
      })),
    [images, favorites, edits],
  );

  const addCovers = async () => {
    if (!addTo || adding) return;
    setAddError('');
    const result = await saveCovers({ collectionId: addTo.id }, photos.filter((photo) => favorites.has(photo.driveId)), folder.id, setAdding);
    setAdding('');
    if ('error' in result) return setAddError(result.error);
    onSaved(result);
  };

  const back = () => {
    if (favorites.size > 0 && !window.confirm('Sair sem salvar? As capas favoritadas desta casa vão se perder.')) return;
    onBack();
  };
  const cropped = [...favorites].filter((id) => edits.has(id)).length;

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain">
        <Toolbar onClose={onClose} onBack={back} backLabel={backLabel} title={addTo ? `Adicionar a ${addTo.label}` : folder.name} />
        <div className="mx-auto max-w-6xl px-4 pb-40 pt-6 sm:px-8">
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.022em] sm:text-[34px]">{folder.name}</h1>
          {addTo && <p className="mt-1 text-[15px] font-semibold" style={{ color: APPLE.blue }}>Novas capas para {addTo.label}</p>}
          <p className="mt-1.5 text-[15px] text-[var(--fg2)]">
            Toque numa foto para ver grande e cortar. Favorite com a <Star size={13} className="inline -translate-y-px" aria-label="estrela" /> as que podem ser capa.
          </p>

          {images === null ? (
            <div className="mt-10 flex items-center gap-2.5 text-[15px] text-[var(--fg2)]"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Carregando as fotos…</div>
          ) : error ? (
            <p role="alert" className="mt-8 text-[15px]" style={{ color: APPLE.pink }}>{error}</p>
          ) : (
            <>
            {videos.length > 0 && (
              <section aria-label="Vídeos da pasta" className="mt-6">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Vídeos <span className="font-normal text-[var(--fg3)]">· {videos.length}</span></h2>
                <ul className="mt-3 flex gap-2.5 overflow-x-auto pb-2">
                  {videos.map((video, index) => (
                    <li key={video.id} className="w-[150px] shrink-0 sm:w-[180px]">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setPlaying(index)}
                        aria-label={`Assistir ${video.name}`}
                        className="relative block aspect-[9/16] w-full overflow-hidden rounded-[12px] bg-[var(--fill2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- quadro do vídeo pelo servidor */}
                        <img src={thumb(video.id, 400)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
                        </span>
                      </motion.button>
                      <p className="mt-1 truncate text-[12px] text-[var(--fg3)]">{video.name}</p>
                    </li>
                  ))}
                </ul>
                {photos.length > 0 && <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.01em]">Fotos <span className="font-normal text-[var(--fg3)]">· {photos.length}</span></h2>}
              </section>
            )}
            <motion.ul variants={list} initial="hidden" animate="show" className="mt-6 columns-2 gap-2.5 sm:columns-3 lg:columns-4 [&>li]:mb-2.5">
              {photos.map((photo, index) => {
                const favorite = favorites.has(photo.driveId);
                const already = addTo?.existing.has(photo.driveId) ?? false;
                const ratio = photo.edited ? `${photo.edited.width} / ${photo.edited.height}` : photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 4';
                return (
                  <motion.li key={photo.driveId} variants={index < 16 ? rise : undefined} className="relative break-inside-avoid">
                    <motion.button
                      type="button"
                      onClick={() => setViewing(index)}
                      whileTap={{ scale: 0.98 }}
                      aria-label={`Ver ${photo.name} grande e cortar`}
                      className="relative block w-full overflow-hidden rounded-[12px] bg-[var(--fill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                      style={{ aspectRatio: ratio }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor */}
                      <img src={photo.edited?.url ?? thumb(photo.driveId, 600)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      {/* contorno amarelo da capa: entra junto com a estrela */}
                      <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[12px]" initial={false} animate={{ opacity: favorite ? 1 : 0 }} transition={{ duration: 0.15 }} style={{ boxShadow: `inset 0 0 0 3px ${APPLE.yellow}` }} />
                      {photo.edited && (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
                          <Crop size={11} aria-hidden="true" /> Cortada
                        </span>
                      )}
                    </motion.button>
                    {already ? (
                      <span className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-white backdrop-blur-md" style={{ background: 'rgba(48,209,88,0.9)' }}>
                        <Check size={13} strokeWidth={2.6} aria-hidden="true" /> Já é capa
                      </span>
                    ) : (
                    <motion.button
                      type="button"
                      onClick={() => toggle(photo.driveId)}
                      aria-pressed={favorite}
                      aria-label={favorite ? `Tirar ${photo.name} das capas` : `Favoritar ${photo.name} como capa`}
                      whileTap={{ scale: 0.88 }}
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition-colors duration-150"
                      style={{ background: favorite ? APPLE.yellow : 'rgba(0,0,0,0.4)', color: favorite ? '#1C1C1E' : '#fff' }}
                    >
                      <Star size={17} fill={favorite ? 'currentColor' : 'none'} strokeWidth={2.2} aria-hidden="true" />
                    </motion.button>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
            </>
          )}
        </div>
      </div>

      {playing !== null && videos[playing] && <VideoViewer videos={videos} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />}

      {/* barra flutuante de vidro, como a barra de ferramentas do Fotos */}
      <motion.div initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...SHEET, delay: 0.15 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Material className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-full py-2 pl-5 pr-2">
          <p className="min-w-0 text-[15px] leading-tight">
            <span className="font-semibold tabular-nums">{favorites.size} {favorites.size === 1 ? 'capa' : 'capas'}</span>
            <span className="text-[var(--fg3)]">{adding ? ` · ${adding}` : favorites.size === 0 ? ' · favorite com a ★' : cropped ? ` · ${cropped} ${cropped === 1 ? 'cortada' : 'cortadas'}` : ''}</span>
            {addError && <span role="alert" className="block text-[13px]" style={{ color: APPLE.pink }}>{addError}</span>}
          </p>
          <motion.button
            type="button"
            whileTap={PRESS}
            disabled={favorites.size === 0 || !team.can('criar_publicacoes') || Boolean(adding)}
            onClick={() => (addTo ? void addCovers() : setSaveOpen(true))}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-opacity disabled:opacity-35"
            style={{ background: APPLE.blue }}
          >
            {adding && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {addTo ? (favorites.size > 0 ? `Adicionar ${favorites.size}` : 'Adicionar') : 'Salvar casa'}
          </motion.button>
        </Material>
      </motion.div>

      {viewing !== null && photos[viewing] && (
        <StudioPhotoViewer
          photos={photos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          title={folder.name}
          src={(photo, size) => photo.edited?.url ?? thumb(photo.driveId, size)}
          originalSrc={(photo) => thumb(photo.driveId, 4000)}
          saving={uploading}
          onSaveCrop={async (photo, file, size) => {
            setUploading(true);
            try {
              const url = await uploadMedia(file);
              setEdits((current) => new Map(current).set(photo.driveId, { url, ...size }));
              // salvar o corte = é capa
              setFavorites((current) => new Set(current).add(photo.driveId));
              return true;
            } catch {
              window.alert('Não foi possível salvar o corte. Tente de novo.');
              return false;
            } finally {
              setUploading(false);
            }
          }}
        />
      )}

      <AnimatePresence>
        {saveOpen && (
          <SaveSheet
            folder={folder}
            photos={photos.filter((photo) => favorites.has(photo.driveId))}
            onClose={() => setSaveOpen(false)}
            onSaved={(result) => {
              setSaveOpen(false);
              onSaved(result);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Folha de salvar (estilo iOS): sobe de baixo no celular, centralizada no computador. */
/** Resultado de salvar a casa: o nome e o que aconteceu na pasta "Capas Selecionadas" do Drive. */
interface SavedResult { label: string; drive: string; driveOk: boolean }

const DRIVE_ERRORS: Record<string, string> = {
  drive_write_missing: 'Capas salvas no app, mas o Drive está só para leitura: reconecte o Google Drive para criar “Capas Selecionadas”.',
  drive_not_connected: 'Capas salvas no app, mas o acesso ao Drive expirou: reconecte para criar “Capas Selecionadas”.',
};

/** Grava as capas (casa nova ou já salva) e depois cria/completa "Capas Selecionadas" no Drive. Erro = mensagem para a tela. */
async function saveCovers(
  target: { collectionId: number } | { houseName: string; houseNumber: string; neighborhood: string },
  photos: CoverPhoto[],
  folderId: string,
  onStep: (step: string) => void,
): Promise<SavedResult | { error: string }> {
  onStep('Salvando a casa…');
  const payload = photos.map((photo) => ({ id: photo.driveId, name: photo.name, width: photo.width ?? undefined, height: photo.height ?? undefined, favorite: true, edited: photo.edited ?? undefined }));
  const response = await fetch('/api/capa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify('collectionId' in target ? { collectionId: target.collectionId, photos: payload } : { ...target, photos: payload, kind: 'capa' }),
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok || !data.collection) return { error: 'Não foi possível salvar. Tente de novo.' };
  const collection = data.collection as CoverCollectionDetail;
  const label = coverFolderLabel(collection.houseName, collection.neighborhood, collection.houseNumber) || 'Casa';

  // depois de salvar: as capas vão para "Capas Selecionadas" dentro da pasta da casa no Drive (só cria)
  onStep('Criando “Capas Selecionadas” no Drive…');
  const driveResponse = await fetch(`/api/capa/${collection.id}/selecionadas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, photos: photos.map((photo) => photo.driveId) }),
  }).catch(() => null);
  const drive = driveResponse ? await driveResponse.json().catch(() => ({})) : {};
  if (!driveResponse?.ok) return { label, driveOk: false, drive: DRIVE_ERRORS[drive.error] ?? 'Capas salvas no app, mas não deu para criar “Capas Selecionadas” no Drive agora.' };
  const saved = (drive.saved ?? []).length;
  const failed = (drive.failed ?? []).length;
  return {
    label,
    driveOk: failed === 0,
    drive: failed
      ? `${saved} no Drive em “Capas Selecionadas”; ${failed} não ${failed === 1 ? 'foi' : 'foram'}`
      : `No Drive em “Capas Selecionadas”${drive.folder?.created ? ' (pasta nova)' : ''}`,
  };
}

function SaveSheet({ folder, photos, onClose, onSaved }: { folder: HouseFolder; photos: CoverPhoto[]; onClose: () => void; onSaved: (result: SavedResult) => void }) {
  const reduce = useReducedMotion();
  const guess = useMemo(() => houseFromFolderName(folder.name, folder.parentName), [folder]);
  const [houseName, setHouseName] = useState(guess.name);
  const [houseNumber, setHouseNumber] = useState(guess.number);
  const [neighborhood, setNeighborhood] = useState(guess.neighborhood);
  const [options, setOptions] = useState<string[]>(neighborhoodOptions(guess.neighborhood ? [guess.neighborhood] : []));
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [existing, setExisting] = useState<CoverCollectionSummary[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  // casa nova ou juntar as capas a uma casa já salva (escolhida pela busca)
  const [mode, setMode] = useState<'nova' | 'existente'>('nova');
  const [houseQuery, setHouseQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  // tela larga (folha no centro) ou celular (folha sobe de baixo): decidido já no primeiro desenho,
  // senão a folha nasce empurrada para baixo (modo celular) e fica fora do quadro no computador
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    fetch('/api/capa/bairros', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.neighborhoods && setOptions(neighborhoodOptions([...data.neighborhoods, guess.neighborhood])))
      .catch(() => undefined);
    fetch('/api/capa?tipo=capa', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setExisting((data?.collections ?? []) as CoverCollectionSummary[]))
      .catch(() => undefined);
  }, [guess.neighborhood]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // casa já salva com o mesmo número e nome parecido: sugere juntar as capas a ela
  const match = existing.find(
    (row) =>
      houseNumber.trim() &&
      row.houseName.trim() &&
      row.houseNumber.trim() === houseNumber.trim() &&
      (searchKey(row.houseName).includes(searchKey(houseName)) || searchKey(houseName).includes(searchKey(row.houseName))),
  );

  const merging = mode === 'existente';
  const filtered = existing.filter((row) => {
    const key = searchKey(houseQuery);
    return !key || searchKey(coverFolderLabel(row.houseName, row.neighborhood, row.houseNumber)).includes(key);
  });

  const save = async () => {
    if (merging && target === null) return setError('Escolha a casa que vai receber as capas.');
    if (!merging && !houseName.trim() && !houseNumber.trim()) return setError('Informe o nome ou o número da casa.');
    setSaving(true);
    setError('');
    const result = await saveCovers(merging ? { collectionId: target as number } : { houseName, houseNumber, neighborhood }, photos, folder.id, setStep);
    setSaving(false);
    setStep('');
    if ('error' in result) return setError(result.error);
    onSaved(result);
  };

  // grupo de campos no estilo Ajustes do iOS
  const row = 'flex min-h-11 items-center gap-3 px-4';
  const input = 'min-w-0 flex-1 bg-transparent py-2.5 text-right text-[17px] text-[var(--fg)] placeholder:text-[var(--fg3)] focus:outline-none';

  // os dois jeitos sempre terminam em y 0, escala 1 e opacidade 1 (trocar de modo no meio não deixa a folha deslocada)
  const sheetMotion = reduce
    ? { initial: { opacity: 0, y: 0, scale: 1 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0 } }
    : wide
      ? { initial: { opacity: 0, scale: 0.96, y: 0 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE_OUT } } }
      : { initial: { y: '100%', opacity: 1, scale: 1 }, animate: { y: 0, opacity: 1, scale: 1 }, exit: { y: '100%', transition: { duration: 0.22, ease: EASE_OUT } } };

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      onPointerDown={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-house-title"
        {...sheetMotion}
        transition={SHEET}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[22px] border border-[var(--line)] bg-[var(--sheet)] pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[var(--fg)] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] sm:rounded-[22px] sm:pb-5"
      >
        {/* alça da folha (celular) */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true"><span className="h-[5px] w-9 rounded-full bg-[var(--fill3)]" /></div>
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-full px-2 text-[17px] active:opacity-60" style={{ color: APPLE.blue }}>Cancelar</button>
          <h2 id="save-house-title" className="text-[17px] font-semibold tracking-[-0.01em]">Salvar casa</h2>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[17px] font-semibold active:opacity-60 disabled:opacity-40" style={{ color: APPLE.blue }}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {merging ? 'Juntar' : 'Salvar'}
          </button>
        </div>

        <div className="px-4 pt-3">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo) => (
              <li key={photo.driveId} className="h-[88px] w-[70px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--fill2)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor */}
                <img src={photo.edited?.url ?? thumb(photo.driveId, 200)} alt="" className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-[var(--fg3)]">{photos.length} {photos.length === 1 ? 'capa' : 'capas'} de “{folder.name}”</p>
        </div>

        {/* casa nova ou juntar a uma casa já salva */}
        <div className="mx-4 mt-4">
          <div role="tablist" aria-label="Onde salvar" className="grid grid-cols-2 rounded-[10px] bg-[var(--fill2)] p-0.5">
            {([
              { value: 'nova', label: 'Casa nova' },
              { value: 'existente', label: 'Casa já salva' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={mode === option.value}
                onClick={() => {
                  setMode(option.value);
                  setError('');
                  if (option.value === 'existente' && target === null && match) setTarget(match.id);
                }}
                className="relative h-8 rounded-[8px] text-[13px] font-medium active:scale-[0.98]"
              >
                {mode === option.value && <motion.span layoutId="save-mode" className="absolute inset-0 rounded-[8px] bg-[var(--sheet)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" transition={SPRING} />}
                <span className="relative">{option.label}</span>
              </button>
            ))}
          </div>
          {!merging && match && (
            <button type="button" onClick={() => { setMode('existente'); setTarget(match.id); }} className="mt-2 w-full rounded-[10px] bg-[var(--fill)] px-3 py-2.5 text-left text-[13px] text-[var(--fg2)] active:scale-[0.99]">
              Parece que já existe <strong className="text-[var(--fg)]">{coverFolderLabel(match.houseName, match.neighborhood, match.houseNumber)}</strong>. <span style={{ color: APPLE.blue }}>Juntar a ela ›</span>
            </button>
          )}
        </div>

        {merging && (
          <div className="mt-4">
            <div className="mx-4">
              <SearchField value={houseQuery} onChange={setHouseQuery} busy={false} placeholder="Buscar casa já salva" />
            </div>
            <ul role="radiogroup" aria-label="Casa que recebe as capas" className="mx-4 mt-2 max-h-[38dvh] divide-y divide-[var(--line)] overflow-y-auto rounded-[12px] bg-[var(--fill)]">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-[15px] text-[var(--fg3)]">{existing.length ? 'Nenhuma casa com esse nome.' : 'Nenhuma casa salva ainda.'}</li>
              ) : (
                filtered.map((row) => {
                  const active = target === row.id;
                  return (
                    <li key={row.id}>
                      <button type="button" role="radio" aria-checked={active} onClick={() => setTarget(row.id)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-[var(--fill2)]">
                        <span className="h-10 w-8 shrink-0 overflow-hidden rounded-[6px] bg-[var(--fill2)]">
                          {(row.coverEditedUrl || row.coverDriveId) && (
                            // eslint-disable-next-line @next/next/no-img-element -- miniatura do Drive pelo servidor
                            <img src={row.coverEditedUrl ?? thumb(row.coverDriveId!, 120)} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{coverFolderLabel(row.houseName, '', row.houseNumber) || 'Sem nome'}</span>
                          <span className="block truncate text-[12px] text-[var(--fg3)]">{row.neighborhood || 'Sem bairro'} · {row.photoCount} {row.photoCount === 1 ? 'foto' : 'fotos'}</span>
                        </span>
                        {active && <Check size={18} strokeWidth={2.6} style={{ color: APPLE.blue }} aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {!merging && (
          <>
            <p className="mt-5 px-8 text-[13px] uppercase tracking-[0.02em] text-[var(--fg3)]">Casa</p>
            <div className="mx-4 mt-1.5 divide-y divide-[var(--line)] overflow-hidden rounded-[12px] bg-[var(--fill)]">
              <label className={row}>
                <span className="text-[17px]">Nome</span>
                <input value={houseName} onChange={(event) => setHouseName(event.target.value)} placeholder="Casa Flora" className={input} />
              </label>
              <label className={row}>
                <span className="text-[17px]">Número</span>
                <input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} inputMode="numeric" placeholder="17" className={`${input} tabular-nums`} />
              </label>
            </div>

            <p className="mt-5 px-8 text-[13px] uppercase tracking-[0.02em] text-[var(--fg3)]">Bairro</p>
            <div className="mx-4 mt-1.5 flex flex-wrap gap-2 rounded-[12px] bg-[var(--fill)] p-3">
              {options.map((option) => {
                const active = neighborhood === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setNeighborhood(active ? '' : option)}
                    className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-[14px] font-medium transition-colors duration-150 active:scale-[0.97] ${active ? 'text-white' : 'bg-[var(--fill2)] text-[var(--fg2)] hover:bg-[var(--fill3)]'}`}
                    style={active ? { background: APPLE.blue } : undefined}
                  >
                    {active && <Check size={13} strokeWidth={3} aria-hidden="true" />} {option}
                  </button>
                );
              })}
              {creating ? (
                <span className="flex w-full gap-2">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && draft.trim()) {
                        event.preventDefault();
                        const name = draft.trim().replace(/\s+/g, ' ');
                        setOptions((current) => neighborhoodOptions([...current, name]));
                        setNeighborhood(name);
                        setDraft('');
                        setCreating(false);
                      }
                    }}
                    placeholder="Nome do bairro e Enter"
                    aria-label="Nome do novo bairro"
                    autoFocus
                    maxLength={120}
                    className="h-9 min-w-0 flex-1 rounded-[10px] bg-[var(--fill2)] px-3 text-[15px] text-[var(--fg)] placeholder:text-[var(--fg3)] focus-visible:outline-2 focus-visible:outline-[#0A84FF]"
                  />
                  <button type="button" onClick={() => setCreating(false)} aria-label="Cancelar novo bairro" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--fill2)] active:scale-[0.97]"><X size={15} aria-hidden="true" /></button>
                </span>
              ) : (
                <button type="button" onClick={() => setCreating(true)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-[var(--fill3)] px-3 text-[14px] font-medium text-[var(--fg2)] hover:text-[var(--fg)] active:scale-[0.97]">
                  <Plus size={13} aria-hidden="true" /> Novo bairro
                </button>
              )}
            </div>
          </>
        )}

        {error && <p role="alert" className="mx-4 mt-4 text-[15px]" style={{ color: APPLE.pink }}>{error}</p>}
        {step && (
          <p role="status" className="mx-4 mt-4 flex items-center gap-2 text-[13px] text-[var(--fg2)]">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {step}
          </p>
        )}
        <p className="mt-5 px-8 text-[13px] text-[var(--fg3)]">Ao salvar, as capas também vão para a pasta “Capas Selecionadas” dentro da pasta da casa no Drive. A casa aparece na busca da Aprovação da grade.</p>
      </motion.section>
    </motion.div>
  );
}

/** Aviso de confirmação no estilo HUD da Apple: o check se desenha. */
function SavedHud({ result }: { result: SavedResult }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.18, ease: EASE_OUT } }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className="pointer-events-none absolute inset-x-0 bottom-8 z-[100] flex justify-center px-4"
    >
      <Material className="flex max-w-[min(92vw,34rem)] items-center gap-3 rounded-[22px] py-2.5 pl-3 pr-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: APPLE.green }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <motion.path d="M4 9.5l3.2 3.2L14 5.5" fill="none" stroke="#0B0B12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1, ease: EASE_OUT }} />
          </svg>
        </span>
        <span className="min-w-0 text-[15px] leading-tight">
          <span className="block font-semibold">Capas salvas · <span className="font-normal text-[var(--fg2)]">{result.label}</span></span>
          <span className="block text-[13px]" style={{ color: result.driveOk ? 'var(--fg3)' : APPLE.orange }}>{result.drive}</span>
        </span>
      </Material>
    </motion.div>
  );
}

const coverSrc = (photo: CoverPhoto) => photo.edited?.url ?? thumb(photo.driveId, 800);

/** Casas com capas selecionadas (pastas kind 'capa'): busca, cartões com a capa; tocar mostra as capas da casa. */
function SavedHouses({ initialOpenId = null, exitLabel, onClose, onOpenDrive }: { initialOpenId?: number | null; exitLabel?: string; onClose: () => void; onOpenDrive: () => void }) {
  const [houses, setHouses] = useState<CoverCollectionSummary[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(initialOpenId);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  /** Apaga só o registro da casa no app (cover_collections); nada é tocado no Google Drive. */
  const removeHouse = async (id: number) => {
    setDeletingId(id);
    setDeleteError('');
    try {
      const response = await fetch(`/api/capa/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setDeleteError(response.status === 403 ? 'Você não tem permissão para excluir casas.' : 'Não foi possível excluir a casa. Tente de novo.');
        return;
      }
      setHouses((rows) => rows?.filter((row) => row.id !== id) ?? rows);
      setConfirmId(null);
    } catch {
      setDeleteError('Não foi possível excluir a casa. Tente de novo.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetch('/api/capa?tipo=capa', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => setHouses(((data?.collections ?? []) as CoverCollectionSummary[]).filter((row) => row.favoriteCount > 0 || row.photoCount > 0)))
      .catch(() => setError('Não foi possível carregar as casas. Tente de novo.'));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // escolhendo fotos novas (Adicionar fotos): Esc não sai da tela e não perde a seleção
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"], [data-adicionando]')) return;
      if (confirmId !== null) setConfirmId(null);
      else if (openId !== null && !(exitLabel && openId === initialOpenId)) setOpenId(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmId, openId, onClose, exitLabel, initialOpenId]);

  const visible = useMemo(() => {
    const key = searchKey(query);
    const rows = houses ?? [];
    return key ? rows.filter((row) => searchKey(coverFolderLabel(row.houseName, row.neighborhood, row.houseNumber)).includes(key)) : rows;
  }, [houses, query]);

  const current = openId !== null ? houses?.find((row) => row.id === openId) ?? null : null;

  return (
    <div className="relative min-h-0 flex-1">
      <AnimatePresence initial={false} mode="popLayout">
        {current ? (
          <motion.div key={`casa-${current.id}`} className="absolute inset-0 overflow-y-auto" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2, ease: EASE_OUT } }} transition={{ duration: 0.32, ease: EASE_OUT }}>
            <SavedHouseCovers house={current} backLabel={exitLabel && openId === initialOpenId ? exitLabel : 'Casas'} onBack={() => (exitLabel && openId === initialOpenId ? onClose() : setOpenId(null))} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div key="casas" className="absolute inset-0 overflow-y-auto" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40, transition: { duration: 0.2, ease: EASE_OUT } }} transition={{ duration: 0.32, ease: EASE_OUT }}>
            <Toolbar onClose={onClose} onBack={exitLabel ? onClose : undefined} backLabel={exitLabel} title="Casas com capas selecionadas">
              <motion.button type="button" onClick={onOpenDrive} whileTap={PRESS} className="hidden h-9 items-center gap-1.5 rounded-full bg-[var(--fill2)] px-3.5 text-[14px] font-semibold hover:bg-[var(--fill3)] sm:inline-flex" style={{ color: APPLE.blue }}>
                <Plus size={16} strokeWidth={2.4} aria-hidden="true" /> Adicionar Casa
              </motion.button>
            </Toolbar>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] sm:text-[34px]">Casas</h2>
                  <p className="mt-1 text-[15px] text-[var(--fg2)]">
                    {houses === null ? 'Carregando…' : `${houses.length} ${houses.length === 1 ? 'casa com capas' : 'casas com capas'}`}
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <SearchField value={query} onChange={setQuery} busy={false} placeholder="Buscar casa" />
                </div>
              </div>

              {deleteError && (
                <p role="alert" className="mt-4 text-[14px]" style={{ color: APPLE.orange }}>{deleteError}</p>
              )}

              {error ? (
                <p className="mt-10 text-center text-[15px]" style={{ color: APPLE.orange }}>{error}</p>
              ) : houses === null ? (
                <div className="mt-16 flex justify-center"><Loader2 size={26} className="animate-spin text-[var(--fg2)]" aria-label="Carregando casas" /></div>
              ) : visible.length === 0 ? (
                <div className="mt-14 text-center">
                  <p className="text-[17px] font-semibold">{houses.length === 0 ? 'Nenhuma casa com capas ainda' : 'Nenhuma casa com esse nome'}</p>
                  {houses.length === 0 && (
                    <motion.button type="button" onClick={onOpenDrive} whileTap={PRESS} className="mt-4 inline-flex h-11 items-center rounded-full px-6 text-[15px] font-semibold text-white" style={{ background: APPLE.blue }}>
                      Selecionar capas no Drive
                    </motion.button>
                  )}
                </div>
              ) : (
                <motion.ul key={query} variants={list} initial="hidden" animate="show" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {visible.map((row, index) => (
                    <motion.li key={row.id} layout variants={index < 16 ? rise : undefined} exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: EASE_OUT } }} className="relative">
                      <motion.button
                        type="button"
                        whileTap={PRESS}
                        onClick={() => setOpenId(row.id)}
                        className="group block w-full overflow-hidden rounded-[18px] bg-[var(--fill)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                      >
                        <span className="relative block aspect-[4/5] w-full overflow-hidden bg-[var(--fill2)]">
                          {(row.coverEditedUrl || row.coverDriveId) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.coverEditedUrl ?? thumb(row.coverDriveId as string, 600)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.03]" />
                          )}
                          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white backdrop-blur-md">
                            <Star size={11} fill="currentColor" aria-hidden="true" /> {row.favoriteCount}
                          </span>
                        </span>
                        <span className="block px-3 py-2.5">
                          <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{coverFolderLabel(row.houseName, null, row.houseNumber) || 'Casa sem nome'}</span>
                          <span className="block truncate text-[13px] text-[var(--fg3)]">{row.neighborhood || 'Sem bairro'}</span>
                        </span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={PRESS}
                        onClick={() => { setDeleteError(''); setConfirmId(row.id); }}
                        aria-label={`Excluir ${coverFolderLabel(row.houseName, null, row.houseNumber) || 'casa sem nome'}`}
                        title="Excluir casa"
                        className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-[#FF453A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                      >
                        <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                      </motion.button>
                      <AnimatePresence>
                        {confirmId === row.id && (
                          <motion.div
                            role="alertdialog"
                            aria-label="Confirmar exclusão da casa"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                            transition={{ duration: 0.2, ease: EASE_OUT }}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[18px] bg-black/70 p-4 text-center text-white backdrop-blur-md"
                          >
                            <Trash2 size={22} aria-hidden="true" style={{ color: '#FF453A' }} />
                            <p className="text-[15px] font-semibold leading-snug">Excluir esta casa?</p>
                            <p className="text-[12px] leading-snug text-white/75">Sai da lista e da grade. As fotos no Google Drive não são apagadas.</p>
                            <div className="flex w-full flex-col gap-2">
                              <motion.button type="button" whileTap={PRESS} disabled={deletingId === row.id} onClick={() => removeHouse(row.id)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: '#FF453A' }}>
                                {deletingId === row.id ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null} Excluir
                              </motion.button>
                              <motion.button type="button" whileTap={PRESS} disabled={deletingId === row.id} onClick={() => setConfirmId(null)} autoFocus className="inline-flex h-9 items-center justify-center rounded-full bg-white/15 text-[14px] font-semibold text-white hover:bg-white/25">
                                Cancelar
                              </motion.button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Abre por cima de tudo (direto no body), com as cores do tema do estúdio: dentro da lista que rola e desliza,
 *  um "fixed" fica preso ao topo da lista em vez de cobrir a tela. */
function StudioLayer({ children }: { children: ReactNode }) {
  const { theme } = useContext(ThemeContext);
  return createPortal(<div style={{ ...SF, ...THEME_VARS[theme] }} className="text-[var(--fg)]">{children}</div>, document.body);
}

/** Assistir um vídeo do Drive em tela cheia (setas trocam de vídeo; Esc fecha). */
function VideoViewer({ videos, index, onIndex, onClose }: { videos: DriveEntry[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const video = videos[index];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowRight' && index < videos.length - 1) onIndex(index + 1);
      else if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, videos.length, onIndex, onClose]);

  return createPortal(
    <motion.div role="dialog" aria-modal="true" aria-label={`Vídeo ${video.name}`} className="fixed inset-0 z-[120] flex flex-col bg-black text-white" style={SF} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
      <div className="flex items-center gap-3 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-0.5 rounded-full px-2 text-[17px] active:opacity-60" style={{ color: APPLE.blue }}>
          <ChevronLeft size={22} aria-hidden="true" /> Voltar
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{video.name}</p>
        <span className="w-[76px] text-right text-[13px] tabular-nums text-white/60">{index + 1} de {videos.length}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <video key={video.id} src={`/api/drive/video/${encodeURIComponent(video.id)}`} poster={thumb(video.id, 1200)} controls autoPlay playsInline preload="metadata" className="max-h-full max-w-full rounded-[12px] bg-black" />
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label="Vídeo anterior" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 sm:flex">
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        )}
        {index < videos.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label="Próximo vídeo" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25 sm:flex">
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

/** Capas selecionadas de uma casa (as favoritas, com o corte quando houver): tocar abre grande; "Adicionar fotos" abre a pasta da casa no Drive. */
function SavedHouseCovers({ house, backLabel = 'Casas', onBack, onClose }: { house: CoverCollectionSummary; backLabel?: string; onBack: () => void; onClose: () => void }) {
  const team = useTeam();
  const [detail, setDetail] = useState<CoverCollectionDetail | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState<HouseFolder[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');
  const [adding, setAdding] = useState<HouseFolder | null>(null);
  const [done, setDone] = useState<SavedResult | null>(null);
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState('');

  /** Tira a foto das capas desta casa (só no app; a cópia em "Capas Selecionadas" no Drive continua lá). */
  const removeCover = async (driveId: string) => {
    setRemoving(driveId);
    setRemoveError('');
    const response = await fetch(`/api/capa/${house.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo: driveId, remove: true }),
    }).catch(() => null);
    setRemoving(null);
    if (!response?.ok) {
      setRemoveError(response?.status === 403 ? 'Você não tem permissão para tirar capas.' : 'Não foi possível tirar a capa. Tente de novo.');
      return;
    }
    setConfirmPhoto(null);
    setDetail((current) => current && { ...current, photos: current.photos.filter((row) => row.driveId !== driveId) });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && confirmPhoto !== null) {
        event.stopImmediatePropagation();
        setConfirmPhoto(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmPhoto]);

  useEffect(() => {
    fetch(`/api/capa/${house.id}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => setDetail(data.collection as CoverCollectionDetail))
      .catch(() => setError('Não foi possível abrir as capas desta casa.'));
  }, [house.id, reload]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(null), done.driveOk ? 3200 : 7000);
    return () => window.clearTimeout(timer);
  }, [done]);

  const covers = detail?.photos.filter((photo) => photo.favorite) ?? [];
  const label = coverFolderLabel(house.houseName, house.neighborhood, house.houseNumber) || 'Casa sem nome';
  const shortLabel = coverFolderLabel(house.houseName, null, house.houseNumber) || 'Casa sem nome';

  // acha a pasta da casa no Drive (de onde vieram as capas); uma só = abre direto; várias = escolher
  const openAdd = async () => {
    setFindError('');
    if (folders && folders.length > 0) {
      if (folders.length === 1) setAdding(folders[0]);
      return;
    }
    setFinding(true);
    const response = await fetch(`/api/capa/${house.id}/pasta`, { cache: 'no-store' }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setFinding(false);
    const found = (data.folders ?? []) as HouseFolder[];
    if (!response?.ok || found.length === 0) {
      setFindError(response?.status === 503 ? 'O Google Drive não está conectado. Reconecte para adicionar fotos.' : 'Não foi possível achar a pasta desta casa no Drive.');
      return;
    }
    setFolders(found);
    if (found.length === 1) setAdding(found[0]);
  };

  if (adding && detail) {
    return (
      <StudioLayer>
      <div data-adicionando className="fixed inset-0 z-[80] bg-[var(--bg)]">
        <HouseView
          folder={adding}
          backLabel="Capas"
          addTo={{ id: house.id, label: shortLabel, existing: new Set(covers.map((photo) => photo.driveId)) }}
          onBack={() => setAdding(null)}
          onClose={onClose}
          onSaved={(result) => {
            setAdding(null);
            setDone(result);
            setReload((value) => value + 1);
          }}
        />
      </div>
      </StudioLayer>
    );
  }

  return (
    <>
      <Toolbar onClose={onClose} onBack={onBack} backLabel={backLabel} title={label}>
        {team.can('criar_publicacoes') && (
          <motion.button type="button" onClick={() => void openAdd()} disabled={finding || !detail} whileTap={PRESS} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-white disabled:opacity-50" style={{ background: APPLE.blue }}>
            {finding ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={16} strokeWidth={2.4} aria-hidden="true" />} Adicionar fotos
          </motion.button>
        )}
      </Toolbar>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-8">
        <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] sm:text-[34px]">{shortLabel}</h2>
        <p className="mt-1 text-[15px] text-[var(--fg2)]">
          {[house.neighborhood, detail ? `${covers.length} ${covers.length === 1 ? 'capa selecionada' : 'capas selecionadas'}` : null].filter(Boolean).join(' · ')}
        </p>
        {findError && <p role="alert" className="mt-3 text-[14px]" style={{ color: APPLE.orange }}>{findError}</p>}
        {removeError && <p role="alert" className="mt-3 text-[14px]" style={{ color: APPLE.orange }}>{removeError}</p>}
        {folders && folders.length > 1 && !adding && (
          <div className="mt-4 rounded-[16px] bg-[var(--fill)] p-3">
            <p className="px-1 text-[13px] text-[var(--fg2)]">As capas desta casa vêm de mais de uma pasta. Escolha onde procurar:</p>
            <ul className="mt-2 grid gap-1.5">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <FolderRow name={folder.name} detail={folder.parentName || undefined} done={false} onOpen={() => setAdding(folder)} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {error ? (
          <p className="mt-10 text-center text-[15px]" style={{ color: APPLE.orange }}>{error}</p>
        ) : !detail ? (
          <div className="mt-16 flex justify-center"><Loader2 size={26} className="animate-spin text-[var(--fg2)]" aria-label="Carregando capas" /></div>
        ) : covers.length === 0 ? (
          <p className="mt-14 text-center text-[15px] text-[var(--fg2)]">Esta casa ainda não tem capas selecionadas.</p>
        ) : (
          <motion.ul variants={list} initial="hidden" animate="show" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {covers.map((photo, index) => (
              <motion.li key={photo.driveId} variants={index < 16 ? rise : undefined} className="relative overflow-hidden rounded-[18px] bg-[var(--fill)]">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setViewing(index)}
                  aria-label={`Ver ${photo.name} grande`}
                  className="group relative block aspect-[4/5] w-full overflow-hidden bg-[var(--fill2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverSrc(photo)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.03]" />
                  {photo.edited && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white backdrop-blur-md">
                      <Crop size={11} aria-hidden="true" /> Cortada
                    </span>
                  )}
                </motion.button>
                <span className="block truncate px-3 py-2 text-[13px] text-[var(--fg3)]">{photo.name}</span>
                {team.can('editar_publicacoes') || team.can('criar_publicacoes') ? (
                  <motion.button
                    type="button"
                    whileTap={PRESS}
                    onClick={() => { setRemoveError(''); setConfirmPhoto(photo.driveId); }}
                    aria-label={`Tirar ${photo.name} das capas`}
                    title="Tirar das capas"
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-[#FF453A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
                  >
                    <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                  </motion.button>
                ) : null}
                <AnimatePresence>
                  {confirmPhoto === photo.driveId && (
                    <motion.div
                      role="alertdialog"
                      aria-label="Confirmar: tirar a foto das capas"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center text-white backdrop-blur-md"
                    >
                      <Trash2 size={22} aria-hidden="true" style={{ color: '#FF453A' }} />
                      <p className="text-[15px] font-semibold leading-snug">Tirar esta foto das capas?</p>
                      <p className="text-[12px] leading-snug text-white/75">A foto continua no Google Drive.</p>
                      <div className="flex w-full flex-col gap-2">
                        <motion.button type="button" whileTap={PRESS} disabled={removing === photo.driveId} onClick={() => void removeCover(photo.driveId)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: '#FF453A' }}>
                          {removing === photo.driveId ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null} Excluir
                        </motion.button>
                        <motion.button type="button" whileTap={PRESS} disabled={removing === photo.driveId} onClick={() => setConfirmPhoto(null)} autoFocus className="inline-flex h-9 items-center justify-center rounded-full bg-white/15 text-[14px] font-semibold text-white hover:bg-white/25">
                          Cancelar
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>

      {viewing !== null && covers[viewing] && (
        <StudioLayer>
        <StudioPhotoViewer
          photos={covers}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          title={shortLabel}
          src={(photo, size) => photo.edited?.url ?? thumb(photo.driveId, size)}
          originalSrc={(photo) => thumb(photo.driveId, 4000)}
          saving={uploading}
          onSaveCrop={async (photo, file, size) => {
            setUploading(true);
            try {
              const url = await uploadMedia(file);
              const response = await fetch(`/api/capa/${house.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: photo.driveId, edited: { url, ...size } }),
              });
              if (!response.ok) throw new Error(String(response.status));
              const edited: EditedImage = { url, ...size };
              setDetail((current) => current && { ...current, photos: current.photos.map((row) => (row.driveId === photo.driveId ? { ...row, edited } : row)) });
              return true;
            } catch {
              window.alert('Não foi possível salvar o corte. Tente de novo.');
              return false;
            } finally {
              setUploading(false);
            }
          }}
        />
        </StudioLayer>
      )}

      <AnimatePresence>{done && <SavedHud result={done} />}</AnimatePresence>
    </>
  );
}
