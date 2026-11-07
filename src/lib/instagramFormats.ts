// Medidas de publicação do Instagram (largura padrão de 1080 px).
// Conferidas em nov/2026 em guias de tamanho de 2026. Revisar se o Instagram mudar as regras.

export type InstagramContentType = 'REEL' | 'POST' | 'STORY' | 'CARROSSEL';

export type InstagramFormatId = 'feed-4x5' | 'feed-3x4' | 'feed-1x1' | 'feed-1.91x1' | 'vertical-9x16';

export interface InstagramFormat {
  id: InstagramFormatId;
  label: string;
  ratioLabel: string;
  width: number;
  height: number;
  hint: string;
}

export const INSTAGRAM_FORMATS: Record<InstagramFormatId, InstagramFormat> = {
  'feed-4x5': {
    id: 'feed-4x5',
    label: 'Retrato',
    ratioLabel: '4:5',
    width: 1080,
    height: 1350,
    hint: 'Padrão do feed. Na grade do perfil, as laterais são levemente cortadas.',
  },
  'feed-3x4': {
    id: 'feed-3x4',
    label: 'Retrato alto',
    ratioLabel: '3:4',
    width: 1080,
    height: 1440,
    hint: 'Ocupa o quadro inteiro da grade do perfil, sem cortes.',
  },
  'feed-1x1': {
    id: 'feed-1x1',
    label: 'Quadrado',
    ratioLabel: '1:1',
    width: 1080,
    height: 1080,
    hint: 'Na grade do perfil, as laterais são cortadas.',
  },
  'feed-1.91x1': {
    id: 'feed-1.91x1',
    label: 'Paisagem',
    ratioLabel: '1,91:1',
    width: 1080,
    height: 566,
    hint: 'Ocupa pouco espaço no feed. Use para vistas panorâmicas.',
  },
  'vertical-9x16': {
    id: 'vertical-9x16',
    label: 'Tela cheia',
    ratioLabel: '9:16',
    width: 1080,
    height: 1920,
    hint: 'Tamanho de Story e Reel.',
  },
};

const feedFormats: InstagramFormatId[] = ['feed-4x5', 'feed-3x4', 'feed-1x1', 'feed-1.91x1'];

/** Formatos aceitos por tipo de conteúdo; o primeiro é o recomendado. */
export const FORMATS_BY_CONTENT_TYPE: Record<InstagramContentType, InstagramFormatId[]> = {
  POST: feedFormats,
  CARROSSEL: feedFormats,
  STORY: ['vertical-9x16'],
  REEL: ['vertical-9x16'],
};

export const getFormat = (id: InstagramFormatId) => INSTAGRAM_FORMATS[id];

export const getDefaultFormat = (contentType: InstagramContentType) =>
  INSTAGRAM_FORMATS[FORMATS_BY_CONTENT_TYPE[contentType][0]];

/** Formato aceito cujas medidas batem exatamente com a imagem, se houver. */
export function findExactFormat(
  contentType: InstagramContentType,
  width: number,
  height: number,
): InstagramFormat | null {
  return (
    FORMATS_BY_CONTENT_TYPE[contentType]
      .map(getFormat)
      .find((format) => format.width === width && format.height === height) ?? null
  );
}

/** Formato aceito com a proporção mais próxima da imagem. */
export function findClosestFormat(contentType: InstagramContentType, width: number, height: number): InstagramFormat {
  const ratio = width / height;
  return FORMATS_BY_CONTENT_TYPE[contentType]
    .map(getFormat)
    .reduce((best, format) =>
      Math.abs(format.width / format.height - ratio) < Math.abs(best.width / best.height - ratio) ? format : best,
    );
}
