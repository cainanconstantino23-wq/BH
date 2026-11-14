'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Crop, Trash2, X } from 'lucide-react';

// Mídia escolhida no computador, ainda não enviada (url = objectURL local).
export interface LightboxItem {
  id: string;
  file: File;
  url: string;
  isVideo: boolean;
}

// Visualizador grande: Esc ou clique fora fecha; setas navegam no carrossel.
export function MediaLightbox({
  items,
  index,
  onIndex,
  onClose,
  onRemove,
  onCrop,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onRemove: (id: string) => void;
  onCrop: (id: string) => void;
}) {
  const item = items[index];
  const many = items.length > 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, items.length, onClose, onIndex]);

  const closeOnBackdrop = (event: React.PointerEvent) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={many ? `Mídia ${index + 1} de ${items.length}` : 'Mídia em tamanho grande'}
      onPointerDown={closeOnBackdrop}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/85 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-5xl items-center justify-between gap-3 text-white">
        <span className="min-w-0 truncate text-sm font-medium tabular-nums">{many ? `${index + 1} de ${items.length}` : item.file.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {!item.isVideo && (
            <button type="button" onClick={() => onCrop(item.id)} className="flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold hover:bg-white/20">
              <Crop size={15} aria-hidden="true" /> Ajustar recorte
            </button>
          )}
          <button type="button" onClick={() => onRemove(item.id)} className="flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold hover:bg-status-danger">
            <Trash2 size={15} aria-hidden="true" /> Remover
          </button>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center" onPointerDown={closeOnBackdrop}>
        {item.isVideo ? (
          <video key={item.id} src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) antes do envio
          <img key={item.id} src={item.url} alt={`Mídia ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
        {many && index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label="Mídia anterior" className="absolute left-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg hover:bg-white">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}
        {many && index < items.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label="Próxima mídia" className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg hover:bg-white">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      {many && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`Ir para a mídia ${i + 1}`}
              aria-current={i === index}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 ${i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              {m.isVideo ? (
                <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) antes do envio
                <img src={m.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
