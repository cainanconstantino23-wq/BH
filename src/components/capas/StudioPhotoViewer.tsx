'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { ChevronLeft, ChevronRight, Crop, Loader2 } from 'lucide-react';
import type { CoverPhoto } from '@/lib/covers';
import { CROP_RATIOS, clampOffset, coverScale, lowResolution, maxZoom, sourceRect, type CropRatio, type Point } from '@/lib/simpleCrop';

// Tela da foto na "Selecionar capas" (padrão Apple, segue o tema claro/escuro pelas variáveis --fg/--bg do estúdio).
// Ver: Voltar, a foto inteira, setas discretas ao lado da foto e um só botão: Cortar.
// Cortar: Voltar, formato 4:5 / 1:1 e zoom discretos no canto de cima, setas ao lado e um só botão: Salvar capa.
// Zoom até 3× (rodinha, barra ou pinça). Passando do ponto em que o corte ainda tem 1080 px de largura,
// mostra um aviso discreto com a largura real do corte, em vez de travar o zoom.

export type CropSize = { width: number; height: number; label: string };

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const BLUE = '#0A84FF';
const FADE: Transition = { duration: 0.2, ease: EASE_OUT };
const MAX_ZOOM = 3;

interface Props {
  photos: CoverPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  title: string;
  /** imagem mostrada (o corte, se houver) */
  src: (photo: CoverPhoto, size: number) => string;
  /** foto original do Drive em tamanho grande (para cortar) */
  originalSrc: (photo: CoverPhoto) => string;
  /** salvar o corte como capa; false = não deu certo */
  onSaveCrop: (photo: CoverPhoto, file: File, size: CropSize) => Promise<boolean>;
  saving: boolean;
}

export function StudioPhotoViewer({ photos, index, onIndex, onClose, title, src, originalSrc, onSaveCrop, saving }: Props) {
  const reduce = useReducedMotion();
  const [cropping, setCropping] = useState(false);
  const photo = photos[index];
  const many = photos.length > 1;
  const go = useCallback((step: number) => onIndex((index + step + photos.length) % photos.length), [index, onIndex, photos.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (event.key === 'Escape') {
        if (cropping) setCropping(false);
        else onClose();
      } else if (event.key === 'ArrowLeft' && many) go(-1);
      else if (event.key === 'ArrowRight' && many) go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropping, go, many, onClose]);

  if (!photo) return null;

  const arrow = (step: -1 | 1) =>
    many ? (
      <button
        type="button"
        onClick={() => go(step)}
        aria-label={step < 0 ? 'Foto anterior' : 'Próxima foto'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--fill)] text-[var(--fg3)] transition-[color,background-color] duration-150 hover:bg-[var(--fill2)] hover:text-[var(--fg)] active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-[#0A84FF]"
      >
        {step < 0 ? <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" /> : <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />}
      </button>
    ) : (
      <span className="w-9 shrink-0" aria-hidden="true" />
    );

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={cropping ? 'Cortar a capa' : 'Foto da casa'}
      className="fixed inset-0 z-[120] flex flex-col bg-[var(--bg)] text-[var(--fg)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={FADE}
    >
      {cropping ? (
        <Cropper
          key={photo.driveId}
          photo={photo}
          imageSrc={originalSrc(photo)}
          saving={saving}
          prev={arrow(-1)}
          next={arrow(1)}
          onBack={() => setCropping(false)}
          onSave={async (file, size) => {
            if (await onSaveCrop(photo, file, size)) setCropping(false);
          }}
        />
      ) : (
        <>
          <TopBar backLabel="Voltar" onBack={onClose} title={title} subtitle={many ? `${index + 1} de ${photos.length}` : undefined} />
          <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3 sm:gap-5">
            {arrow(-1)}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={`${photo.driveId}-${photo.edited?.url ?? ''}`}
                src={src(photo, 2400)}
                alt={photo.name}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="max-h-[calc(100dvh-11rem)] min-w-0 max-w-[calc(100vw-8rem)] rounded-[14px] object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]"
              />
            </AnimatePresence>
            {arrow(1)}
          </div>
          <div className="flex flex-col items-center gap-2 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
            {photo.edited && <p className="text-[13px] text-[var(--fg3)]">Capa cortada{photo.edited.label ? ` · ${photo.edited.label}` : ''}</p>}
            <motion.button
              type="button"
              onClick={() => setCropping(true)}
              disabled={saving}
              whileTap={{ scale: 0.97 }}
              className="inline-flex h-12 items-center gap-2 rounded-full px-7 text-[17px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110"
              style={{ background: BLUE }}
            >
              <Crop size={18} strokeWidth={2.2} aria-hidden="true" /> {photo.edited ? 'Cortar de novo' : 'Cortar'}
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
}

function TopBar({ backLabel, onBack, title, subtitle, children }: { backLabel: string; onBack: () => void; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6">
      <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-0.5 justify-self-start rounded-full pl-1 pr-3 text-[17px] active:opacity-60" style={{ color: BLUE }}>
        <ChevronLeft size={24} strokeWidth={2.3} aria-hidden="true" /> {backLabel}
      </button>
      <div className="min-w-0 max-w-[50vw] text-center">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
        {subtitle && <p className="text-[12px] tabular-nums text-[var(--fg3)]">{subtitle}</p>}
      </div>
      <div className="flex items-center justify-self-end gap-2">{children}</div>
    </div>
  );
}

/** Corte: arrastar para posicionar, zoom pela barra ou pela rodinha; formato e zoom discretos no topo. */
function Cropper({
  photo,
  imageSrc,
  saving,
  prev,
  next,
  onBack,
  onSave,
}: {
  photo: CoverPhoto;
  imageSrc: string;
  saving: boolean;
  prev: React.ReactNode;
  next: React.ReactNode;
  onBack: () => void;
  onSave: (file: File, size: CropSize) => Promise<void>;
}) {
  const [ratio, setRatio] = useState<CropRatio>(CROP_RATIOS[0]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: Point; from: Point } | null>(null);
  // pinça (dois dedos): distância inicial e zoom de partida
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setFailed(true);
    img.src = imageSrc;
  }, [imageSrc]);

  // moldura: o maior retângulo na proporção que cabe na área (sobra uma faixa para ver, escurecido, o que fica fora)
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const w = area.clientWidth - 16;
      const h = area.clientHeight - 16;
      const target = ratio.width / ratio.height;
      const fw = Math.max(0, Math.min(w, h * target));
      setFrame({ w: Math.floor(fw), h: Math.floor(fw / target) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [ratio]);

  // ponto ideal: o corte ainda tem os pixels da imagem final (1080 de largura); o zoom pode passar dele, com aviso
  const safeZoom = image ? maxZoom(image.naturalWidth, image.naturalHeight, ratio.width, ratio.height) : 1;
  const zoomLimit = Math.max(MAX_ZOOM, safeZoom);
  const small = image ? lowResolution(image.naturalWidth, image.naturalHeight, ratio.width, ratio.height) : false;
  const shownZoom = Math.min(zoom, zoomLimit);
  const scale = image && frame.w ? coverScale(image.naturalWidth, image.naturalHeight, frame.w, frame.h, shownZoom) : 0;
  const shownW = image ? image.naturalWidth * scale : 0;
  const shownH = image ? image.naturalHeight * scale : 0;
  const position = image && frame.w ? clampOffset(offset ?? { x: (frame.w - shownW) / 2, y: (frame.h - shownH) / 2 }, shownW, shownH, frame.w, frame.h) : { x: 0, y: 0 };
  // largura real do corte em pixels da foto (abaixo de 1080 = perde nitidez no Instagram)
  const cropPixels = scale ? Math.round(frame.w / scale) : 0;
  const belowIdeal = Boolean(image) && cropPixels > 0 && cropPixels < ratio.width;

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  // arrastar 1:1, respeitando onde a pessoa pegou; dois dedos = pinça (zoom)
  const onPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      drag.current = null;
      pinch.current = { distance: distance(), zoom: shownZoom };
    } else if (pointers.current.size === 1) {
      drag.current = { start: { x: event.clientX, y: event.clientY }, from: position };
    }
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const now = distance();
      if (pinch.current.distance > 0) changeZoom((pinch.current.zoom * now) / pinch.current.distance);
      return;
    }
    if (!drag.current) return;
    setOffset({ x: drag.current.from.x + event.clientX - drag.current.start.x, y: drag.current.from.y + event.clientY - drag.current.start.y });
  };
  const endDrag = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // sobrou um dedo depois da pinça: continua arrastando a partir dele, sem pulo
    const rest = [...pointers.current.values()][0];
    drag.current = rest ? { start: rest, from: position } : null;
  };

  const changeZoom = (wanted: number) => {
    const value = Math.min(Math.max(wanted, 1), zoomLimit);
    if (!image || !scale) return setZoom(value);
    // mantém o centro da moldura no mesmo ponto da foto
    const center = { x: (frame.w / 2 - position.x) / scale, y: (frame.h / 2 - position.y) / scale };
    const nextScale = coverScale(image.naturalWidth, image.naturalHeight, frame.w, frame.h, value);
    setZoom(value);
    setOffset({ x: frame.w / 2 - center.x * nextScale, y: frame.h / 2 - center.y * nextScale });
  };
  const onWheel = (event: ReactWheelEvent) => {
    if (!image || zoomLimit <= 1) return;
    changeZoom(shownZoom * Math.exp(-event.deltaY * 0.002));
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
    const base = photo.name.replace(/\.[^.]+$/, '') || 'capa';
    await onSave(new File([blob], `${base}-${ratio.width}x${ratio.height}.jpg`, { type: 'image/jpeg' }), {
      width: ratio.width,
      height: ratio.height,
      label: `Carrossel ${ratio.label.split(' ')[1]}`,
    });
  };

  return (
    <>
      <TopBar backLabel="Voltar" onBack={onBack} title="Cortar capa" subtitle={photo.name}>
        {/* formato e zoom: discretos, no canto */}
        <div role="radiogroup" aria-label="Formato" className="inline-flex rounded-[8px] bg-[var(--fill)] p-0.5">
          {CROP_RATIOS.map((option) => {
            const active = ratio.id === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={option.label}
                onClick={() => {
                  setRatio(option);
                  setOffset(null);
                  setZoom(1);
                }}
                className={`h-7 rounded-[6px] px-2 text-[12px] font-medium tabular-nums transition-colors duration-150 ${active ? 'bg-[var(--fill2)] text-[var(--fg)]' : 'text-[var(--fg3)] hover:text-[var(--fg)]'}`}
              >
                {option.label.split(' ')[1]}
              </button>
            );
          })}
        </div>
        <input
          type="range"
          min={1}
          max={zoomLimit}
          step={0.01}
          value={shownZoom}
          disabled={!image}
          onChange={(event) => changeZoom(Number(event.target.value))}
          aria-label="Zoom"
          className="w-20 accent-[#0A84FF] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-25 sm:w-28"
        />
      </TopBar>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3 sm:gap-5">
        {prev}
        <div ref={areaRef} onWheel={onWheel} className="relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden">
          {failed ? (
            <p className="text-[15px] text-[var(--fg2)]">Não foi possível abrir esta foto.</p>
          ) : !image ? (
            <Loader2 size={24} className="animate-spin text-[var(--fg3)]" aria-label="Carregando a foto" />
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
              {/* fora da moldura: a foto continua visível, escurecida */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] outline outline-2 outline-white/90" />
            </div>
          )}
        </div>
        {next}
      </div>

      <div className="flex flex-col items-center gap-2 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
        {belowIdeal ? (
          <p role="status" className="text-[13px] font-medium" style={{ color: '#FF9F0A' }}>
            {small && shownZoom <= 1.01 ? 'Foto pequena para este formato' : 'Zoom além da qualidade ideal'} · corte com {cropPixels} px de largura (ideal {ratio.width})
          </p>
        ) : (
          <p className="text-[13px] text-[var(--fg3)]">Arraste para posicionar · zoom no canto, na rodinha ou com dois dedos</p>
        )}
        <motion.button
          type="button"
          onClick={() => void save()}
          disabled={!image || saving}
          whileTap={{ scale: 0.97 }}
          className="inline-flex h-12 items-center gap-2 rounded-full px-7 text-[17px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110"
          style={{ background: BLUE }}
        >
          {saving && <Loader2 size={18} className="animate-spin" aria-hidden="true" />} Salvar capa
        </motion.button>
      </div>
    </>
  );
}
