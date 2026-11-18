'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Crop, LoaderCircle, Star, X } from 'lucide-react';
import type { CoverPhoto } from '@/lib/covers';
import { CROP_RATIOS, clampOffset, coverScale, sourceRect, type CropRatio, type Point } from '@/lib/simpleCrop';

// Tela grande do link da aprovadora: setas para passar as fotos da casa, Favoritar e um corte simples
// (só 4:5 ou 1:1 do carrossel, arrastar e zoom). Sem as opções do editor da equipe.

interface Props {
  photos: CoverPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  src: (photo: CoverPhoto, size: number) => string;
  /** Foto original do Drive (para cortar), sem o corte anterior. */
  originalSrc: (photo: CoverPhoto) => string;
  isFavorite: (photo: CoverPhoto) => boolean;
  onToggleFavorite: (photo: CoverPhoto) => void;
  onSaveCrop: (photo: CoverPhoto, file: File, size: { width: number; height: number; label: string }) => Promise<void>;
  saving: boolean;
}

export function ApproverPhotoViewer({ photos, index, onIndex, onClose, src, originalSrc, isFavorite, onToggleFavorite, onSaveCrop, saving }: Props) {
  const [cropping, setCropping] = useState(false);
  const photo = photos[index];
  const go = useCallback((step: number) => onIndex((index + step + photos.length) % photos.length), [index, onIndex, photos.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (cropping) return;
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropping, go, onClose]);

  if (!photo) return null;
  const favorite = isFavorite(photo);

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto da casa" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6">
        <p className="text-[0.95rem] tabular-nums text-white/70">
          {index + 1} de {photos.length}
        </p>
        <button type="button" autoFocus onClick={cropping ? () => setCropping(false) : onClose} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {cropping ? (
        <SimpleCropper
          key={photo.driveId}
          imageSrc={originalSrc(photo)}
          fileName={photo.name}
          saving={saving}
          onCancel={() => setCropping(false)}
          onSave={async (file, size) => {
            await onSaveCrop(photo, file, size);
            setCropping(false);
          }}
        />
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
            <img key={photo.driveId} src={src(photo, 1800)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Foto anterior" className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-bh-tinta shadow-lg hover:bg-white sm:left-4">
                  <ChevronLeft size={24} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Próxima foto" className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-bh-tinta shadow-lg hover:bg-white sm:right-4">
                  <ChevronRight size={24} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={() => onToggleFavorite(photo)}
              aria-pressed={favorite}
              className={`inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-base font-medium transition-colors ${favorite ? 'bg-bh-mata text-white' : 'bg-white text-bh-tinta hover:bg-white/90'}`}
            >
              <Star size={18} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Favoritada' : 'Favoritar'}
            </button>
            <button
              type="button"
              onClick={() => setCropping(true)}
              disabled={saving}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/40 px-6 text-base font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Crop size={18} aria-hidden="true" />}
              {photo.edited ? 'Cortar de novo' : 'Cortar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SimpleCropper({
  imageSrc,
  fileName,
  saving,
  onCancel,
  onSave,
}: {
  imageSrc: string;
  fileName: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (file: File, size: { width: number; height: number; label: string }) => Promise<void>;
}) {
  const [ratio, setRatio] = useState<CropRatio>(CROP_RATIOS[0]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: Point; from: Point } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setFailed(true);
    img.src = imageSrc;
  }, [imageSrc]);

  // moldura: o maior retângulo na proporção que cabe na área
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      // 85% da área: sobra espaço em volta para ver, escurecido, o que fica fora do corte
      const w = area.clientWidth * 0.85;
      const h = area.clientHeight * 0.85;
      const target = ratio.width / ratio.height;
      const fw = Math.min(w, h * target);
      setFrame({ w: Math.floor(fw), h: Math.floor(fw / target) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [ratio]);

  const scale = image && frame.w ? coverScale(image.naturalWidth, image.naturalHeight, frame.w, frame.h, zoom) : 0;
  const shownW = image ? image.naturalWidth * scale : 0;
  const shownH = image ? image.naturalHeight * scale : 0;
  // sem posição escolhida: centralizada
  const position = image && frame.w ? clampOffset(offset ?? { x: (frame.w - shownW) / 2, y: (frame.h - shownH) / 2 }, shownW, shownH, frame.w, frame.h) : { x: 0, y: 0 };

  const onPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: { x: event.clientX, y: event.clientY }, from: position };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.from.x + event.clientX - drag.current.start.x, y: drag.current.from.y + event.clientY - drag.current.start.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const changeZoom = (value: number) => {
    // mantém o centro da moldura no mesmo ponto da foto
    if (!image || !scale) return setZoom(value);
    const center = { x: (frame.w / 2 - position.x) / scale, y: (frame.h / 2 - position.y) / scale };
    const next = coverScale(image.naturalWidth, image.naturalHeight, frame.w, frame.h, value);
    setZoom(value);
    setOffset({ x: frame.w / 2 - center.x * next, y: frame.h / 2 - center.y * next });
  };

  const save = async () => {
    if (!image || !scale) return;
    const canvas = document.createElement('canvas');
    canvas.width = ratio.width;
    canvas.height = ratio.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    const { sx, sy, sw, sh } = sourceRect(position, scale, frame.w, frame.h);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, ratio.width, ratio.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return;
    const base = fileName.replace(/\.[^.]+$/, '') || 'capa';
    await onSave(new File([blob], `${base}-${ratio.width}x${ratio.height}.jpg`, { type: 'image/jpeg' }), {
      width: ratio.width,
      height: ratio.height,
      label: `Carrossel ${ratio.label.split(' ')[1]}`,
    });
  };

  return (
    <>
      <div className="flex justify-center gap-2 px-4 pb-3">
        {CROP_RATIOS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={ratio.id === option.id}
            onClick={() => {
              setRatio(option);
              setOffset(null);
              setZoom(1);
            }}
            className={`min-h-10 rounded-full px-4 text-[0.95rem] font-medium ${ratio.id === option.id ? 'bg-white text-bh-tinta' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4">
        {failed ? (
          <p className="text-white/80">Não foi possível abrir esta foto.</p>
        ) : !image ? (
          <LoaderCircle size={24} className="animate-spin motion-reduce:animate-none" aria-label="Carregando a foto" />
        ) : (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ width: frame.w, height: frame.h }}
            className="relative cursor-grab touch-none active:cursor-grabbing"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- já carregada acima */}
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              style={{ width: shownW, height: shownH, transform: `translate(${position.x}px, ${position.y}px)` }}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
            />
            {/* fora da moldura: a foto continua visível, só escurecida (o que não entra no Instagram) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] outline outline-2 outline-white" />
          </div>
        )}
      </div>
      <p className="px-4 pt-2 text-center text-[0.875rem] text-white/60">Arraste a foto para posicionar o corte.</p>
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-3">
        <span className="text-[0.875rem] text-white/70">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(event) => changeZoom(Number(event.target.value))}
          aria-label="Zoom"
          className="flex-1 accent-white"
        />
      </div>
      <div className="flex items-center justify-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-12 items-center rounded-full border border-white/40 px-6 text-base font-medium text-white hover:bg-white/10 disabled:opacity-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!image || saving}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-bh-mata px-6 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          Salvar corte
        </button>
      </div>
    </>
  );
}
