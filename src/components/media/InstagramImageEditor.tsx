'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AlertTriangle, FlipHorizontal, LoaderCircle, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  FORMATS_BY_CONTENT_TYPE,
  getFormat,
  type InstagramContentType,
  type InstagramFormat,
  type InstagramFormatId,
} from '@/lib/instagramFormats';

interface InstagramImageEditorProps {
  src: string;
  fileName: string;
  contentType: InstagramContentType;
  initialFormatId?: InstagramFormatId;
  onCancel: () => void;
  onApply: (result: { file: File; format: InstagramFormat }) => void;
}

type Rotation = 0 | 90 | 180 | 270;
interface Point { x: number; y: number }

const MAX_ZOOM = 5;
const JPEG_QUALITY = 0.92;

// Faixas da tela cobertas pela interface do Instagram (aproximadas, em fração da altura).
const INTERFACE_BANDS: Partial<Record<InstagramContentType, { top: number; bottom: number }>> = {
  STORY: { top: 0.14, bottom: 0.14 },
  REEL: { top: 0.12, bottom: 0.22 },
};

const GRID_RATIO = 3 / 4;
const SHOWN_ON_PROFILE_GRID: InstagramContentType[] = ['POST', 'CARROSSEL', 'REEL'];

interface Geometry {
  orientedWidth: number;
  orientedHeight: number;
  cropWidth: number;
  cropHeight: number;
  center: Point;
}

function computeGeometry(
  image: HTMLImageElement,
  rotation: Rotation,
  format: InstagramFormat,
  zoom: number,
  center: Point | null,
): Geometry {
  const swapped = rotation === 90 || rotation === 270;
  const orientedWidth = swapped ? image.naturalHeight : image.naturalWidth;
  const orientedHeight = swapped ? image.naturalWidth : image.naturalHeight;
  const ratio = format.width / format.height;

  // Maior recorte com a proporção exata que cabe na imagem (zoom 1), reduzido pelo zoom.
  const baseWidth = orientedWidth / orientedHeight > ratio ? orientedHeight * ratio : orientedWidth;
  const cropWidth = baseWidth / zoom;
  const cropHeight = cropWidth / ratio;

  const wanted = center ?? { x: orientedWidth / 2, y: orientedHeight / 2 };
  return {
    orientedWidth,
    orientedHeight,
    cropWidth,
    cropHeight,
    center: {
      x: Math.min(Math.max(wanted.x, cropWidth / 2), orientedWidth - cropWidth / 2),
      y: Math.min(Math.max(wanted.y, cropHeight / 2), orientedHeight - cropHeight / 2),
    },
  };
}

/** Desenha o recorte em um contexto de saída. Usado na prévia e na exportação. */
function drawCrop(
  ctx: CanvasRenderingContext2D,
  outWidth: number,
  outHeight: number,
  image: HTMLImageElement,
  geometry: Geometry,
  rotation: Rotation,
  flipX: boolean,
) {
  const scale = outWidth / geometry.cropWidth;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.scale(scale, scale);
  ctx.translate(
    -(geometry.center.x - geometry.cropWidth / 2),
    -(geometry.center.y - geometry.cropHeight / 2),
  );
  ctx.translate(geometry.orientedWidth / 2, geometry.orientedHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipX ? -1 : 1, 1);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
}

export function InstagramImageEditor({
  src,
  fileName,
  contentType,
  initialFormatId,
  onCancel,
  onApply,
}: InstagramImageEditorProps) {
  const availableFormats = FORMATS_BY_CONTENT_TYPE[contentType];
  const [formatId, setFormatId] = useState<InstagramFormatId>(
    initialFormatId && availableFormats.includes(initialFormatId) ? initialFormatId : availableFormats[0],
  );
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipX, setFlipX] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Point | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const format = getFormat(formatId);
  const ratio = format.width / format.height;

  // Carrega a imagem original.
  useEffect(() => {
    let active = true;
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => active && setImage(img);
    img.onerror = () => active && setLoadError(true);
    img.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  // Mede o espaço disponível para a moldura.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const frame = (() => {
    const maxWidth = Math.max(stageSize.width - 32, 0);
    const maxHeight = Math.max(stageSize.height - 32, 0);
    const width = Math.min(maxWidth, maxHeight * ratio);
    return { width: Math.floor(width), height: Math.floor(width / ratio) };
  })();

  const geometry = image ? computeGeometry(image, rotation, format, zoom, center) : null;

  // Desenha a prévia com o mesmo código da exportação.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !geometry || frame.width < 1) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(frame.width * dpr);
    canvas.height = Math.round(frame.height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) drawCrop(ctx, canvas.width, canvas.height, image, geometry, rotation, flipX);
  });

  const panBy = useCallback(
    (dxScreen: number, dyScreen: number) => {
      if (!geometry || frame.width < 1) return;
      const sourcePerScreen = geometry.cropWidth / frame.width;
      setCenter({
        x: geometry.center.x - dxScreen * sourcePerScreen,
        y: geometry.center.y - dyScreen * sourcePerScreen,
      });
    },
    [geometry, frame.width],
  );

  const changeZoom = (next: number) => {
    setZoom(Math.min(Math.max(next, 1), MAX_ZOOM));
    if (geometry) setCenter(geometry.center);
  };

  const resetFraming = () => {
    setZoom(1);
    setCenter(null);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setIsDragging(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      changeZoom(pinchStart.current.zoom * (distance / pinchStart.current.distance));
      return;
    }
    panBy(event.clientX - previous.x, event.clientY - previous.y);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) setIsDragging(false);
  };

  const handleFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      panBy(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      changeZoom(zoom + 0.1);
    } else if (event.key === '-') {
      event.preventDefault();
      changeZoom(zoom - 0.1);
    }
  };

  const handleApply = async () => {
    if (!image || !geometry) return;
    setExporting(true);
    setExportError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = format.width;
      canvas.height = format.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      drawCrop(ctx, format.width, format.height, image, geometry, rotation, flipX);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('blob');

      const baseName = fileName.replace(/\.[^.]+$/, '') || 'imagem';
      const file = new File([blob], `${baseName}-${format.width}x${format.height}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      onApply({ file, format });
    } catch (error) {
      console.error('Falha ao exportar a imagem recortada:', error);
      setExportError('Não foi possível gerar a imagem. Tente novamente ou use uma imagem menor.');
      setExporting(false);
    }
  };

  // Escape fecha o editor.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !exporting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exporting, onCancel]);

  const sourcePixelsAcross = geometry ? Math.round(geometry.cropWidth) : 0;
  const upscale = sourcePixelsAcross > 0 ? format.width / sourcePixelsAcross : 1;
  const bands = showGuides ? INTERFACE_BANDS[contentType] : undefined;
  const onProfileGrid = SHOWN_ON_PROFILE_GRID.includes(contentType);
  const gridCropsImage = onProfileGrid && Math.abs(ratio - GRID_RATIO) > 0.001;
  const gridPreview =
    showGuides && gridCropsImage
      ? ratio > GRID_RATIO
        ? { width: GRID_RATIO / ratio, height: 1 }
        : { width: 1, height: ratio / GRID_RATIO }
      : null;

  return (
    <div className="fixed inset-0 z-60 flex items-stretch justify-center bg-ink/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-editor-title"
        className="flex h-dvh w-full max-w-5xl flex-col overflow-hidden bg-surface text-ink sm:h-[min(92dvh,52rem)] sm:rounded-panel sm:border sm:border-border"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <h2 id="image-editor-title" className="text-sm font-semibold">Ajustar imagem para o Instagram</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            aria-label="Fechar editor sem aplicar"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-control text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div ref={stageRef} className="relative flex h-[50dvh] shrink-0 items-center justify-center bg-[#e9e6e0] md:h-auto md:min-h-0 md:flex-1 md:shrink">
            {loadError ? (
              <p className="max-w-xs px-6 text-center text-sm text-ink-muted">
                Este arquivo não pôde ser aberto no navegador. Converta para JPG ou PNG e selecione de novo.
              </p>
            ) : !image ? (
              <LoaderCircle aria-label="Carregando imagem" size={22} className="animate-spin text-ink-muted motion-reduce:animate-none" />
            ) : (
              <div
                role="application"
                tabIndex={0}
                aria-label={`Área de recorte ${format.ratioLabel}. Arraste ou use as setas para mover; use mais e menos para aproximar.`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={(event) => changeZoom(zoom * (event.deltaY < 0 ? 1.06 : 1 / 1.06))}
                onKeyDown={handleFrameKeyDown}
                className={`relative touch-none select-none overflow-hidden bg-white outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-plum ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                style={{ width: frame.width, height: frame.height }}
              >
                <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />

                {isDragging && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <span className="absolute inset-y-0 left-1/3 w-px bg-white/70" />
                    <span className="absolute inset-y-0 left-2/3 w-px bg-white/70" />
                    <span className="absolute inset-x-0 top-1/3 h-px bg-white/70" />
                    <span className="absolute inset-x-0 top-2/3 h-px bg-white/70" />
                  </div>
                )}

                {bands && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <span className="absolute inset-x-0 top-0 bg-ink/35" style={{ height: `${bands.top * 100}%` }} />
                    <span className="absolute inset-x-0 bottom-0 bg-ink/35" style={{ height: `${bands.bottom * 100}%` }} />
                  </div>
                )}

                {gridPreview && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-dashed border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
                    style={{ width: `${gridPreview.width * 100}%`, height: `${gridPreview.height * 100}%` }}
                  />
                )}
              </div>
            )}
          </div>

          <aside className="flex shrink-0 flex-col gap-5 border-t md:overflow-y-auto border-border p-4 sm:p-5 md:w-80 md:border-l md:border-t-0">
            <fieldset>
              <legend className="text-xs font-semibold text-ink">Formato</legend>
              <div className={`mt-2 grid gap-2 ${availableFormats.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {availableFormats.map((id) => {
                  const option = getFormat(id);
                  const selected = id === formatId;
                  return (
                    <label
                      key={id}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control border px-3 py-2 transition-colors duration-150 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-plum ${
                        selected ? 'border-brand-plum bg-surface-muted' : 'border-border hover:bg-canvas'
                      }`}
                    >
                      <input
                        type="radio"
                        name="instagram-format"
                        value={id}
                        checked={selected}
                        onChange={() => {
                          setFormatId(id);
                          resetFraming();
                        }}
                        className="sr-only"
                      />
                      <RatioGlyph width={option.width} height={option.height} selected={selected} />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-ink">{option.ratioLabel} {option.label}</span>
                        <span className="block text-[11px] tabular-nums text-ink-muted">{option.width} × {option.height}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">{format.hint}</p>
            </fieldset>

            <div>
              <label htmlFor="image-editor-zoom" className="text-xs font-semibold text-ink">Aproximação</label>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label="Afastar" onClick={() => changeZoom(zoom - 0.25)} disabled={!image || zoom <= 1} className="flex min-h-9 min-w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-40">
                  <ZoomOut size={16} />
                </button>
                <input
                  id="image-editor-zoom"
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  disabled={!image}
                  onChange={(event) => changeZoom(Number(event.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-brand-plum"
                />
                <button type="button" aria-label="Aproximar" onClick={() => changeZoom(zoom + 0.25)} disabled={!image || zoom >= MAX_ZOOM} className="flex min-h-9 min-w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-40">
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ToolButton
                onClick={() => {
                  setRotation((r) => ((r + 90) % 360) as Rotation);
                  resetFraming();
                }}
                disabled={!image}
              >
                <RotateCw size={15} /> Girar 90°
              </ToolButton>
              <ToolButton onClick={() => setFlipX((f) => !f)} disabled={!image} pressed={flipX}>
                <FlipHorizontal size={15} /> Espelhar
              </ToolButton>
              <ToolButton
                onClick={() => {
                  resetFraming();
                  setRotation(0);
                  setFlipX(false);
                }}
                disabled={!image}
              >
                <RotateCcw size={15} /> Restaurar
              </ToolButton>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink">
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(event) => setShowGuides(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-plum"
              />
              <span>
                Mostrar guias
                <span className="mt-0.5 block text-ink-muted">
                  {INTERFACE_BANDS[contentType]
                    ? 'Faixas escuras: áreas cobertas pela interface do Instagram (aproximadas).'
                    : null}
                  {INTERFACE_BANDS[contentType] && onProfileGrid ? ' ' : null}
                  {!onProfileGrid
                    ? null
                    : gridCropsImage
                      ? 'Tracejado: parte que aparece na grade do perfil.'
                      : 'Este formato aparece inteiro na grade do perfil.'}
                </span>
              </span>
            </label>

            {image && geometry && (
              <div className="space-y-2 rounded-control bg-canvas p-3 text-xs">
                <p className="flex justify-between gap-3">
                  <span className="text-ink-muted">Original</span>
                  <span className="tabular-nums text-ink">{geometry.orientedWidth} × {geometry.orientedHeight} px</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-ink-muted">Arquivo final</span>
                  <span className="font-semibold tabular-nums text-ink">{format.width} × {format.height} px, JPG</span>
                </p>
                {upscale > 1.005 && (
                  <p className={`flex items-start gap-1.5 pt-1 ${upscale > 1.1 ? 'text-status-warning' : 'text-ink-muted'}`}>
                    {upscale > 1.1 && <AlertTriangle aria-hidden="true" size={14} className="mt-px shrink-0" />}
                    <span>
                      A área escolhida tem {sourcePixelsAcross} px de largura e será ampliada para {format.width} px
                      {upscale > 1.1
                        ? '. A foto pode perder nitidez; afaste o zoom ou use um arquivo maior.'
                        : ' (ampliação pequena, sem perda visível).'}
                    </span>
                  </p>
                )}
              </div>
            )}

            {exportError && (
              <p role="alert" className="text-xs text-status-danger">{exportError}</p>
            )}
          </aside>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            className="min-h-10 rounded-control px-4 text-xs font-semibold text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!image || exporting}
            className="flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
          >
            {exporting && <LoaderCircle aria-hidden="true" size={14} className="animate-spin motion-reduce:animate-none" />}
            {exporting ? 'Gerando imagem…' : `Aplicar ${format.width} × ${format.height}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RatioGlyph({ width, height, selected }: { width: number; height: number; selected: boolean }) {
  const box = 22;
  const scale = box / Math.max(width, height);
  return (
    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
      <span
        className={`block rounded-[3px] border-[1.5px] ${selected ? 'border-brand-plum bg-brand-plum/10' : 'border-ink-muted'}`}
        style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
      />
    </span>
  );
}

function ToolButton({
  children,
  onClick,
  disabled,
  pressed,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`flex min-h-9 items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-40 ${
        pressed ? 'border-brand-plum bg-surface-muted text-ink' : 'border-border text-ink hover:bg-canvas'
      }`}
    >
      {children}
    </button>
  );
}
