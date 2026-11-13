'use client';

import { useRef, useState, type DragEvent } from 'react';

const isMedia = (file: File) =>
  file.type.startsWith('video/') || file.type.startsWith('image/') || /\.(mp4|mov|webm|m4v|jpe?g|png|webp|heic|heif)$/i.test(file.name);

/**
 * Arrastar um vídeo ou foto do computador e soltar na janela.
 * Espalhe `dropProps` no elemento que recebe o arquivo; `dragging` liga o aviso "Solte aqui".
 * Só aceita imagem ou vídeo; outro tipo chama `onReject`.
 */
export function useFileDrop(onFile: (file: File) => void, onReject?: () => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave disparam a cada filho; o contador evita o aviso piscar.
  const depth = useRef(0);

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  const dropProps = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (!disabled) setDragging(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      // sem isto, o navegador abre o arquivo no lugar da página
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (disabled) return;
      const file = Array.from(event.dataTransfer.files).find(isMedia);
      if (file) onFile(file);
      else onReject?.();
    },
  };

  return { dragging, dropProps };
}
