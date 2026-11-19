'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Crop, LoaderCircle, Star, Undo2, X } from 'lucide-react';
import type { CoverPhoto } from '@/lib/covers';
import { CROP_RATIOS, clampOffset, coverScale, lowResolution, maxZoom, sourceRect, type CropRatio, type Point } from '@/lib/simpleCrop';

// Tela grande do link da aprovadora: a foto inteira (proporção original), setas para passar as fotos,
// corte simples ali mesmo (4:5 ou 1:1 do carrossel, arrastar e zoom), "Salvar e próxima",
// voltar à original e pôr/tirar da seleção. Sem as opções do editor da equipe.

export type CropSize = { width: number; height: number; label: string };

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
  onSaveCrop: (photo: CoverPhoto, file: File, size: CropSize) => Promise<boolean | void>;
  /** Volta à foto original (só quando o corte é da aprovadora). */
  onUndoCrop?: (photo: CoverPhoto) => Promise<void>;
  canUndo?: (photo: CoverPhoto) => boolean;
  /** Textos do botão: 'selecao' (✓ Na seleção), 'favorita' (★ Favoritar) ou 'capa' (✓ Usar como capa, link da grade). */
  toggleKind?: 'selecao' | 'favorita' | 'capa';
  /** Camada (z-index): por cima de outra janela, ex.: a casa aberta no link da grade. */
  layerClass?: string;
  /** Nome mostrado no topo (ex.: a casa). */
  title?: string;
  /** Abre direto no corte (ex.: "Ver grande e cortar" no link da grade); "Salvar e próxima" segue cortando. */
  startCropping?: boolean;
  saving: boolean;
}

export function ApproverPhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  src,
  originalSrc,
  isFavorite,
  onToggleFavorite,
  onSaveCrop,
  onUndoCrop,
  canUndo,
  toggleKind = 'favorita',
  layerClass = 'z-50',
  title,
  startCropping = false,
  saving,
}: Props) {
  const [cropping, setCropping] = useState(startCropping);
  const photo = photos[index];
  const go = useCallback((step: number) => onIndex((index + step + photos.length) % photos.length), [index, onIndex, photos.length]);
  const hasNext = photos.length > 1;

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
  const selection = toggleKind !== 'favorita';
  const toggleText =
    toggleKind === 'capa' ? (favorite ? 'Capa escolhida' : 'Usar como capa')
      : selection ? (favorite ? 'Na seleção' : 'Incluir na seleção')
        : favorite ? 'Favoritada' : 'Favoritar';

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto da casa" className={`fixed inset-0 ${layerClass} flex flex-col bg-black text-white`}>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6">
        <p className="min-w-0 truncate text-[0.95rem] tabular-nums text-white/70">
          {title && <span className="mr-2 font-medium text-white">{title}</span>}
          {index + 1} de {photos.length}
          {photo.edited && !cropping && <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[0.8125rem] text-white">Cortada{photo.edited.label ? ` · ${photo.edited.label}` : ''}</span>}
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
          hasNext={hasNext}
          onCancel={() => setCropping(false)}
          onSave={async (file, size, next) => {
            const ok = await onSaveCrop(photo, file, size);
            if (ok === false) return;
            // abriu direto no corte: a próxima foto também abre no corte
            setCropping(next && startCropping);
            if (next) go(1);
          }}
        />
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
            {/* foto inteira, na proporção original (ou o corte, se já cortada) */}
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
            <img key={`${photo.driveId}-${photo.edited?.url ?? ''}`} src={src(photo, 2400)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            {hasNext && (
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
          <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={() => onToggleFavorite(photo)}
              aria-pressed={favorite}
              className={`inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-base font-medium transition-colors ${favorite ? 'bg-bh-mata text-white' : 'bg-white text-bh-tinta hover:bg-white/90'}`}
            >
              {selection ? <Check size={18} aria-hidden="true" /> : <Star size={18} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />} {toggleText}
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
            {onUndoCrop && photo.edited && canUndo?.(photo) && (
              <button
                type="button"
                onClick={() => void onUndoCrop(photo)}
                disabled={saving}
                className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-medium text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <Undo2 size={18} aria-hidden="true" /> Original
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={() => go(1)}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/40 px-6 text-base font-medium text-white hover:bg-white/10"
              >
                Próxima <ArrowRight size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Corte simples (4:5 ou 1:1, arrastar + zoom). Também usado pela equipe na resposta da aprovadora. */
export function SimpleCropper({
  imageSrc,
  fileName,
  saving,
  hasNext,
  onCancel,
  onSave,
}: {
  imageSrc: string;
  fileName: string;
  saving: boolean;
  hasNext: boolean;
  onCancel: () => void;
  /** next = depois de salvar, passa para a próxima foto */
  onSave: (file: File, size: CropSize, next: boolean) => Promise<void>;
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
      // quase toda a área (para ver os detalhes); sobra uma faixa em volta para ver, escurecido, o que fica fora do corte
      const w = area.clientWidth - 24;
      const h = area.clientHeight - 16;
      const target = ratio.width / ratio.height;
      const fw = Math.min(w, h * target);
      setFrame({ w: Math.floor(fw), h: Math.floor(fw / target) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [ratio]);

  // zoom só até onde o corte ainda tem os pixels da imagem final (sem perder qualidade)
  const zoomLimit = image ? maxZoom(image.naturalWidth, image.naturalHeight, ratio.width, ratio.height) : 1;
  const small = image ? lowResolution(image.naturalWidth, image.naturalHeight, ratio.width, ratio.height) : false;
  const shownZoom = Math.min(zoom, zoomLimit);
  const scale = image && frame.w ? coverScale(image.naturalWidth, image.naturalHeight, frame.w, frame.h, shownZoom) : 0;
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

  const changeZoom = (wanted: number) => {
    const value = Math.min(Math.max(wanted, 1), zoomLimit);
    // mantém o centro da moldura no mesmo ponto da foto
    if (!image || !scale) return setZoom(value);
    const center = { x: (frame.w / 2 - position.x) / scale, y: (frame.h / 2 - position.y) / scale };
    const next = coverScale(image.naturalWidth, image.naturalHeight, frame.w, frame.h, value);
    setZoom(value);
    setOffset({ x: frame.w / 2 - center.x * next, y: frame.h / 2 - center.y * next });
  };

  const save = async (next = false) => {
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
    }, next);
  };

  // rodinha do mouse / trackpad: zoom (até o limite sem perder qualidade)
  const onWheel = (event: ReactWheelEvent) => {
    if (!image || zoomLimit <= 1) return;
    changeZoom(shownZoom * Math.exp(-event.deltaY * 0.002));
  };

  const ratioButtons = CROP_RATIOS.map((option) => (
    <button
      key={option.id}
      type="button"
      aria-pressed={ratio.id === option.id}
      onClick={() => {
        setRatio(option);
        setOffset(null);
        setZoom(1);
      }}
      className={`min-h-10 rounded-full px-3.5 text-[0.875rem] font-medium ${ratio.id === option.id ? 'bg-white text-bh-tinta' : 'bg-white/10 text-white hover:bg-white/20'}`}
    >
      {option.label}
    </button>
  ));

  return (
    <>
      <div ref={areaRef} onWheel={onWheel} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
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
        {image && (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[0.8125rem] text-white/70 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
            Arraste para posicionar{small ? ' · foto sem resolução para zoom' : ' · zoom na barra ou na rodinha do mouse'}
          </p>
        )}
      </div>
      {/* controles numa faixa só, para sobrar mais altura para a foto */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <div className="flex gap-1.5">{ratioButtons}</div>
        {!small && (
          <label className="flex w-full max-w-[13rem] items-center gap-2 sm:w-44">
            <span className="text-[0.8125rem] text-white/70">Zoom</span>
            <input
              type="range"
              min={1}
              max={zoomLimit}
              step={0.01}
              value={shownZoom}
              disabled={!image || zoomLimit <= 1}
              onChange={(event) => changeZoom(Number(event.target.value))}
              aria-label="Zoom"
              className="min-w-0 flex-1 accent-white disabled:opacity-40"
            />
          </label>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-11 items-center rounded-full border border-white/40 px-5 text-[0.95rem] font-medium text-white hover:bg-white/10 disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!image || saving}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[0.95rem] font-medium disabled:opacity-50 ${hasNext ? 'border border-white/40 text-white hover:bg-white/10' : 'bg-bh-mata text-white hover:opacity-90'}`}
          >
            {saving ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
            Salvar corte
          </button>
          {hasNext && (
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={!image || saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-bh-mata px-5 text-[0.95rem] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Salvar e próxima <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
