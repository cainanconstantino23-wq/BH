'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Crop, Undo2, X } from 'lucide-react';
import { OnScreen } from '@/components/drive/OnScreen';
import { driveThumb } from '@/components/drive/DriveBrowser';
import { SimpleCropper, type CropSize } from '@/components/capa/ApproverPhotoViewer';
import type { CoverPhoto } from '@/lib/covers';

// Só para ver: foto grande da resposta da aprovadora, do jeito que vai para o Drive
// (o corte dela, se houver; dá para comparar com a original). Setas/teclado passam as fotos, Esc fecha.
// "Cortar de novo" abre o mesmo corte simples do link (4:5 ou 1:1) sobre a foto original.

export function ApprovedPhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
  details,
  onSaveCrop,
  onUndoCrop,
  saving = false,
  error = null,
}: {
  photos: CoverPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** linhas da resposta (escolhida / cortada / adicionada, com data) */
  details: (photo: CoverPhoto) => string[];
  /** salva o novo corte; false = não salvou (fica no corte para tentar de novo) */
  onSaveCrop?: (photo: CoverPhoto, file: File, size: CropSize) => Promise<boolean>;
  /** volta à foto original (sem corte) */
  onUndoCrop?: (photo: CoverPhoto) => Promise<void>;
  saving?: boolean;
  error?: string | null;
}) {
  const [cropping, setCropping] = useState(false);
  const photo = photos[index];
  // foto (driveId) em que se pediu a original; ao passar para outra, volta a mostrar o corte
  const [originalFor, setOriginalFor] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const showOriginal = Boolean(photo) && originalFor === photo.driveId;
  const setShowOriginal = (update: (value: boolean) => boolean) => setOriginalFor(update(showOriginal) ? photo.driveId : null);
  const src = photo && (photo.edited && !showOriginal ? photo.edited.url : driveThumb(photo.driveId, 2000));
  const loading = loadedSrc !== src;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (cropping) {
        if (event.key === 'Escape') setCropping(false);
        return;
      }
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) onIndex(index + 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, hasPrev, hasNext, onIndex, onClose, cropping]);

  if (!photo) return null;

  const arrow =
    'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    <OnScreen>
      <div role="dialog" aria-modal="true" aria-label={`Foto ${index + 1} de ${photos.length}: ${photo.name}`} className="fixed inset-0 z-[70] flex flex-col bg-black/90">
        <div className="flex items-center gap-3 px-4 py-3 text-white">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{photo.name}</p>
            <p className="text-xs tabular-nums text-white/70">
              {index + 1} de {photos.length}
              {photo.edited && !showOriginal ? ` · corte ${photo.edited.label} (${photo.edited.width} × ${photo.edited.height})` : photo.edited ? ' · foto original' : ''}
            </p>
          </div>
          {onSaveCrop && !cropping && (
            <button
              type="button"
              onClick={() => setCropping(true)}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control bg-white px-3 text-xs font-semibold text-gray-900 hover:bg-white/90"
            >
              <Crop size={14} aria-hidden="true" /> {photo.edited ? 'Cortar de novo' : 'Cortar'}
            </button>
          )}
          {onUndoCrop && photo.edited && !cropping && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (window.confirm('Voltar para a foto original, sem corte?')) void onUndoCrop(photo);
              }}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control border border-white/30 px-3 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              <Undo2 size={14} aria-hidden="true" /> Usar original
            </button>
          )}
          {photo.edited && !cropping && (
            <button
              type="button"
              onClick={() => setShowOriginal((value) => !value)}
              aria-pressed={showOriginal}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control border border-white/30 px-3 text-xs font-semibold text-white hover:bg-white/10"
            >
              <Crop size={14} aria-hidden="true" /> {showOriginal ? 'Ver corte' : 'Ver original'}
            </button>
          )}
          <button type="button" onClick={cropping ? () => setCropping(false) : onClose} aria-label={cropping ? 'Cancelar corte' : 'Fechar'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10">
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        {cropping && onSaveCrop ? (
          <div className="flex min-h-0 flex-1 flex-col text-white">
            <SimpleCropper
              key={photo.driveId}
              imageSrc={driveThumb(photo.driveId, 4000)}
              fileName={photo.name}
              saving={saving}
              hasNext={hasNext}
              onCancel={() => setCropping(false)}
              onSave={async (file, size, next) => {
                const ok = await onSaveCrop(photo, file, size);
                if (!ok) return;
                setCropping(false);
                if (next && hasNext) onIndex(index + 1);
              }}
            />
          </div>
        ) : (
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-2" onClick={(event) => event.target === event.currentTarget && onClose()}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive/R2 pelo servidor */}
          <img
            key={src}
            src={src}
            alt={photo.name}
            onLoad={() => setLoadedSrc(src)}
            onError={() => setLoadedSrc(src)}
            className={`max-h-full max-w-full rounded-control object-contain shadow-2xl transition-opacity ${loading ? 'opacity-40' : 'opacity-100'}`}
          />
          {hasPrev && (
            <button type="button" onClick={() => onIndex(index - 1)} aria-label="Foto anterior" className={`${arrow} left-3`}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
          )}
          {hasNext && (
            <button type="button" onClick={() => onIndex(index + 1)} aria-label="Próxima foto" className={`${arrow} right-3`}>
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          )}
        </div>
        )}

        {error && <p role="alert" className="px-4 pb-2 text-center text-sm font-medium text-red-300">{error}</p>}

        {!cropping && details(photo).length > 0 && (
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-4 text-center text-xs text-white/80">
            {details(photo).map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
    </OnScreen>
  );
}
