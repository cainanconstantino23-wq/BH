'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

// Tema no padrão Apple (skills apple-design + emil-design-eng), claro por padrão e escuro pelo botão sol/lua.
// As cores ficam em variáveis CSS no <html> enquanto a tela está aberta (janelas abertas fora da página, como a
// folha da casa, também recebem). Componentes compartilhados com o painel usam var(--g-*, <cor do painel>):
// sem estas variáveis, continuam com as cores de sempre.

export type AppleTheme = 'light' | 'dark';

export const SF_FONT: CSSProperties = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif' };

export const APPLE_LIGHT: Record<string, string> = {
  '--bg': '#F2F2F7', '--fg': '#1D1D1F', '--fg2': 'rgba(29,29,31,0.66)', '--fg3': 'rgba(29,29,31,0.46)',
  '--fill': 'rgba(0,0,0,0.045)', '--fill2': 'rgba(0,0,0,0.08)', '--line': 'rgba(0,0,0,0.08)',
  '--material': 'rgba(255,255,255,0.72)', '--sheet': '#FFFFFF', '--tile': '#E5E5EA',
  '--blue': '#007AFF', '--blue-press': '#0062CC', '--green': '#34C759', '--orange': '#FF9500', '--red': '#FF3B30',
  '--green-soft': 'rgba(52,199,89,0.14)', '--orange-soft': 'rgba(255,149,0,0.14)', '--red-soft': 'rgba(255,59,48,0.12)', '--blue-soft': 'rgba(0,122,255,0.12)',
  '--mesh-a': 'rgba(0,122,255,0.16)', '--mesh-b': 'rgba(255,45,85,0.12)', '--mesh-c': 'rgba(175,82,222,0.12)',
};
export const APPLE_DARK: Record<string, string> = {
  '--bg': '#0B0B12', '--fg': '#FFFFFF', '--fg2': 'rgba(255,255,255,0.64)', '--fg3': 'rgba(255,255,255,0.44)',
  '--fill': 'rgba(255,255,255,0.07)', '--fill2': 'rgba(255,255,255,0.12)', '--line': 'rgba(255,255,255,0.08)',
  '--material': 'rgba(28,28,36,0.72)', '--sheet': '#1C1C1E', '--tile': '#23232B',
  '--blue': '#0A84FF', '--blue-press': '#409CFF', '--green': '#30D158', '--orange': '#FF9F0A', '--red': '#FF453A',
  '--green-soft': 'rgba(48,209,88,0.16)', '--orange-soft': 'rgba(255,159,10,0.16)', '--red-soft': 'rgba(255,69,58,0.16)', '--blue-soft': 'rgba(10,132,255,0.18)',
  '--mesh-a': 'rgba(10,132,255,0.28)', '--mesh-b': 'rgba(255,55,95,0.16)', '--mesh-c': 'rgba(191,90,242,0.2)',
};

/**
 * Claro no tema do painel "Mar de Espelho" (abas da equipe): tinta azul-petróleo, destaque verde-água e sem degradê
 * próprio (o fundo pêssego do painel aparece por trás). O link público da Thereza continua com APPLE_LIGHT.
 */
export const QUADRADO_LIGHT: Record<string, string> = {
  ...APPLE_LIGHT,
  '--bg': 'transparent', '--fg': '#18323A', '--fg2': 'rgba(24,50,58,0.74)', '--fg3': 'rgba(24,50,58,0.62)',
  '--fill': 'rgba(24,50,58,0.05)', '--fill2': 'rgba(24,50,58,0.09)', '--line': 'rgba(24,50,58,0.09)',
  '--material': 'rgba(251,253,254,0.72)', '--sheet': '#FBFDFE', '--tile': '#E2EEF2',
  '--blue': '#087A8A', '--blue-press': '#066673', '--blue-soft': 'rgba(8,122,138,0.12)',
  // status com contraste AA sobre fundo claro
  '--orange': '#A35C00', '--green': '#1E7F3A', '--red': '#C4321F',
  '--orange-soft': 'rgba(255,149,0,0.16)', '--green-soft': 'rgba(52,199,89,0.16)',
  '--mesh-a': 'transparent', '--mesh-b': 'transparent', '--mesh-c': 'transparent',
};

export type ApplePalette = 'apple' | 'quadrado';

/** Variáveis --g-* lidas pelos componentes compartilhados (grade, navegador do Drive). */
export const sharedVars = (t: Record<string, string>): Record<string, string> => ({
  '--g-fg': t['--fg'], '--g-fg3': t['--fg3'], '--g-sheet': t['--sheet'], '--g-fill': t['--fill'], '--g-canvas': t['--bg'],
  '--g-line': t['--line'], '--g-line2': t['--fill2'], '--g-accent': t['--blue'], '--g-accent-hover': t['--blue-press'],
  '--g-success': t['--green'], '--g-success-soft': t['--green-soft'], '--g-success-line': t['--green-soft'],
  '--g-warning': t['--orange'], '--g-warning-soft': t['--orange-soft'], '--g-warning-line': t['--orange-soft'],
  '--g-danger': t['--red'], '--g-danger-soft': t['--red-soft'], '--g-danger-line': t['--red-soft'],
  '--g-info': t['--blue'], '--g-info-soft': t['--blue-soft'], '--g-info-line': t['--blue-soft'],
  '--g-r-panel': '18px', '--g-r-control': '12px',
});

/** Tema Apple da tela: claro por padrão; guarda a escolha neste navegador; aplica as variáveis no <html>. */
export function useAppleTheme(storageKey: string, palette: ApplePalette = 'apple') {
  const [theme, setTheme] = useState<AppleTheme>(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const values = theme === 'dark' ? APPLE_DARK : palette === 'quadrado' ? QUADRADO_LIGHT : APPLE_LIGHT;
    const all = { ...values, ...sharedVars(values) };
    for (const [key, value] of Object.entries(all)) root.style.setProperty(key, value);
    return () => {
      for (const key of Object.keys(all)) root.style.removeProperty(key);
    };
  }, [theme, palette]);

  const toggle = () =>
    setTheme((current) => {
      const next: AppleTheme = current === 'light' ? 'dark' : 'light';
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // sem localStorage: vale só nesta visita
      }
      return next;
    });

  return { theme, toggle };
}

/** Botão sol/lua (troca com um giro curto). */
export function AppleThemeToggle({ theme, onToggle }: { theme: AppleTheme; onToggle: () => void }) {
  const light = theme === 'light';
  return (
    <button
      type="button"
      onClick={onToggle}
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

/** Fundo colorido e parado (degradê com as cores do sistema Apple). */
export const appleMesh = 'radial-gradient(70% 45% at 8% 0%, var(--mesh-a), transparent 60%), radial-gradient(55% 40% at 100% 8%, var(--mesh-c), transparent 60%), radial-gradient(60% 40% at 80% 100%, var(--mesh-b), transparent 60%)';
