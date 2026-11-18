// Corte simples do link da aprovadora: só as proporções do carrossel do Instagram, arrastar e zoom.
// Sem imports com "@/": também roda no `node --test`.

export const CROP_RATIOS = [
  { id: '4x5', label: 'Retrato 4:5', width: 1080, height: 1350 },
  { id: '1x1', label: 'Quadrado 1:1', width: 1080, height: 1080 },
] as const;

export type CropRatio = (typeof CROP_RATIOS)[number];
export interface Point { x: number; y: number }

/** Escala (px na tela por px da foto) para a foto cobrir a moldura, vezes o zoom (≥ 1). */
export const coverScale = (imageW: number, imageH: number, frameW: number, frameH: number, zoom: number) =>
  Math.max(frameW / imageW, frameH / imageH) * zoom;

/** Posição da foto (canto superior esquerdo, relativo à moldura) sem deixar borda vazia. */
export function clampOffset(offset: Point, shownW: number, shownH: number, frameW: number, frameH: number): Point {
  const clamp = (value: number, min: number) => Math.min(0, Math.max(min, value));
  return { x: clamp(offset.x, frameW - shownW) + 0, y: clamp(offset.y, frameH - shownH) + 0 };
}

/** Recorte em pixels da foto original que corresponde à moldura. */
export const sourceRect = (offset: Point, scale: number, frameW: number, frameH: number) => ({
  sx: 0 - offset.x / scale,
  sy: 0 - offset.y / scale,
  sw: frameW / scale,
  sh: frameH / scale,
});

/** Largura da foto (px originais) que cabe na proporção da saída, sem zoom. */
const usableWidth = (imageW: number, imageH: number, outW: number, outH: number) => Math.min(imageW, (imageH * outW) / outH);

/**
 * Zoom máximo sem perder qualidade: o pedaço da foto dentro da moldura precisa ter
 * pelo menos os pixels da imagem final (ex.: 1080 de largura). Nunca menos que 1.
 */
export const maxZoom = (imageW: number, imageH: number, outW: number, outH: number) =>
  Math.max(1, usableWidth(imageW, imageH, outW, outH) / outW);

/** A foto já é menor que a imagem final, mesmo sem zoom. */
export const lowResolution = (imageW: number, imageH: number, outW: number, outH: number) =>
  usableWidth(imageW, imageH, outW, outH) < outW;
