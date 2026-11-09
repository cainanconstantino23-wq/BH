'use client';

import { useEffect, type PointerEvent } from 'react';

/**
 * Fecha uma janela com Esc e com clique no fundo escuro (fora da janela).
 * O clique só conta se COMEÇAR no fundo: selecionar texto e soltar fora não fecha.
 * `blocked` impede o fechamento (ex.: salvando, ou outra janela aberta por cima).
 */
export function useDismiss(open: boolean, onClose: () => void, blocked = false) {
  useEffect(() => {
    if (!open || blocked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, blocked]);

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (!blocked && event.target === event.currentTarget) onClose();
    },
  };
}
