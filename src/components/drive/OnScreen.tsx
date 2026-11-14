'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Abre camadas "fixed" (prévia grande, janelas, barra do rodapé) direto no <body>.
 * Dentro da aba, a animação de entrada usa transform, e aí um "fixed" fica preso à página
 * em vez da tela (a foto aparecia lá embaixo, fora de vista).
 */
export function OnScreen({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
