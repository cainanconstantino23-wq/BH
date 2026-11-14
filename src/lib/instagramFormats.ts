// Medidas de publicação por rede social e por lugar (feed, carrossel, story, reels, capa).
// Conferidas em nov/2026 (guia de anúncios da Meta + guias de tamanho de 2026). Revisar se as redes mudarem as regras.
// O nome do arquivo ficou "instagramFormats" por histórico; hoje cobre Instagram e Facebook.

export type InstagramContentType = 'REEL' | 'POST' | 'STORY' | 'CARROSSEL';

export type SocialNetwork = 'instagram' | 'facebook';
export type SocialPlacement = 'feed' | 'carrossel' | 'story' | 'reels' | 'capa';

export type InstagramFormatId =
  | 'ig-feed-3x4'
  | 'ig-feed-4x5'
  | 'ig-feed-1x1'
  | 'ig-feed-1.91x1'
  | 'ig-carrossel-4x5'
  | 'ig-carrossel-3x4'
  | 'ig-carrossel-1x1'
  | 'ig-story'
  | 'ig-reels'
  | 'fb-feed-4x5'
  | 'fb-feed-1x1'
  | 'fb-feed-1.91x1'
  | 'fb-carrossel-1x1'
  | 'fb-carrossel-4x5'
  | 'fb-story'
  | 'fb-reels'
  | 'fb-capa';

export interface InstagramFormat {
  id: InstagramFormatId;
  network: SocialNetwork;
  placement: SocialPlacement;
  label: string;
  ratioLabel: string;
  width: number;
  height: number;
  hint: string;
  /** Faixas cobertas pela interface do app (fração da altura, aproximadas). */
  bands?: { top: number; bottom: number };
  /** Aparece na grade do perfil do Instagram (3:4). */
  profileGrid?: boolean;
}

export const NETWORK_LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
};

export const PLACEMENT_LABELS: Record<SocialPlacement, string> = {
  feed: 'Feed',
  carrossel: 'Carrossel',
  story: 'Story',
  reels: 'Reels',
  capa: 'Capa da página',
};

const STORY_BANDS = { top: 0.14, bottom: 0.14 };
const REELS_BANDS = { top: 0.12, bottom: 0.22 };

const list: InstagramFormat[] = [
  // ── Instagram ──
  { id: 'ig-feed-4x5', network: 'instagram', placement: 'feed', label: 'Retrato', ratioLabel: '4:5', width: 1080, height: 1350, profileGrid: true,
    hint: 'O mais usado no feed e o mais seguro para agendar: a Meta aceita 4:5 na publicação automática. Na grade do perfil, as laterais são levemente cortadas.' },
  { id: 'ig-feed-3x4', network: 'instagram', placement: 'feed', label: 'Retrato alto', ratioLabel: '3:4', width: 1080, height: 1440, profileGrid: true,
    hint: 'O mais alto do feed desde 2025 e aparece inteiro na grade do perfil. Atenção: publicação automática e anúncios ainda pedem 4:5.' },
  { id: 'ig-feed-1x1', network: 'instagram', placement: 'feed', label: 'Quadrado', ratioLabel: '1:1', width: 1080, height: 1080, profileGrid: true,
    hint: 'Ocupa menos espaço no feed. Na grade do perfil, as laterais são cortadas.' },
  { id: 'ig-feed-1.91x1', network: 'instagram', placement: 'feed', label: 'Paisagem', ratioLabel: '1,91:1', width: 1080, height: 566, profileGrid: true,
    hint: 'Ocupa pouco espaço no feed. Use para vistas panorâmicas.' },
  { id: 'ig-carrossel-4x5', network: 'instagram', placement: 'carrossel', label: 'Retrato', ratioLabel: '4:5', width: 1080, height: 1350, profileGrid: true,
    hint: 'Até 20 fotos. O Instagram corta todas no formato da primeira: use o mesmo formato em todas.' },
  { id: 'ig-carrossel-3x4', network: 'instagram', placement: 'carrossel', label: 'Retrato alto', ratioLabel: '3:4', width: 1080, height: 1440, profileGrid: true,
    hint: 'Até 20 fotos, inteiras na grade do perfil. Publicando pelo app. Todas no mesmo formato da primeira.' },
  { id: 'ig-carrossel-1x1', network: 'instagram', placement: 'carrossel', label: 'Quadrado', ratioLabel: '1:1', width: 1080, height: 1080, profileGrid: true,
    hint: 'Até 20 fotos, todas no formato da primeira.' },
  { id: 'ig-story', network: 'instagram', placement: 'story', label: 'Tela cheia', ratioLabel: '9:16', width: 1080, height: 1920, bands: STORY_BANDS,
    hint: 'Deixe textos e rostos longe do topo e da base, onde ficam a foto do perfil, o nome e o campo de resposta.' },
  { id: 'ig-reels', network: 'instagram', placement: 'reels', label: 'Capa do Reels', ratioLabel: '9:16', width: 1080, height: 1920, bands: REELS_BANDS, profileGrid: true,
    hint: 'Tela cheia no Reels. Na grade do perfil aparece o centro em 3:4: mantenha o principal no meio.' },

  // ── Facebook ──
  { id: 'fb-feed-4x5', network: 'facebook', placement: 'feed', label: 'Retrato', ratioLabel: '4:5', width: 1080, height: 1350,
    hint: 'Ocupa mais espaço no feed do celular. É o formato recomendado pela Meta para o feed.' },
  { id: 'fb-feed-1x1', network: 'facebook', placement: 'feed', label: 'Quadrado', ratioLabel: '1:1', width: 1080, height: 1080,
    hint: 'Funciona bem no celular e no computador.' },
  { id: 'fb-feed-1.91x1', network: 'facebook', placement: 'feed', label: 'Paisagem', ratioLabel: '1,91:1', width: 1200, height: 630,
    hint: 'Formato de link e de foto horizontal. Ocupa pouco espaço no celular.' },
  { id: 'fb-carrossel-1x1', network: 'facebook', placement: 'carrossel', label: 'Quadrado', ratioLabel: '1:1', width: 1080, height: 1080,
    hint: 'O padrão do carrossel no Facebook. Use o mesmo formato em todas as fotos.' },
  { id: 'fb-carrossel-4x5', network: 'facebook', placement: 'carrossel', label: 'Retrato', ratioLabel: '4:5', width: 1080, height: 1350,
    hint: 'Mais espaço no celular. Use o mesmo formato em todas as fotos.' },
  { id: 'fb-story', network: 'facebook', placement: 'story', label: 'Tela cheia', ratioLabel: '9:16', width: 1080, height: 1920, bands: STORY_BANDS,
    hint: 'Deixe textos longe do topo e da base, onde ficam o nome da página e o campo de resposta.' },
  { id: 'fb-reels', network: 'facebook', placement: 'reels', label: 'Capa do Reels', ratioLabel: '9:16', width: 1080, height: 1920, bands: REELS_BANDS,
    hint: 'Tela cheia. A legenda e os botões cobrem a parte de baixo.' },
  { id: 'fb-capa', network: 'facebook', placement: 'capa', label: 'Capa', ratioLabel: '2,63:1', width: 1640, height: 624,
    hint: 'Aparece com 820 × 312 no computador (enviada em dobro para ficar nítida). No celular, as laterais são cortadas: mantenha o principal no centro.' },
];

export const INSTAGRAM_FORMATS = Object.fromEntries(list.map((format) => [format.id, format])) as Record<InstagramFormatId, InstagramFormat>;

export const ALL_FORMAT_IDS = list.map((format) => format.id);

export const NETWORKS: SocialNetwork[] = ['instagram', 'facebook'];

/** Lugares disponíveis numa rede, na ordem de exibição. */
export const placementsFor = (network: SocialNetwork) =>
  (Object.keys(PLACEMENT_LABELS) as SocialPlacement[]).filter((placement) =>
    list.some((format) => format.network === network && format.placement === placement),
  );

/** Formatos de uma rede num lugar; o primeiro é o recomendado. */
export const formatsFor = (network: SocialNetwork, placement: SocialPlacement) =>
  list.filter((format) => format.network === network && format.placement === placement).map((format) => format.id);

/** Formatos aceitos por tipo de conteúdo do Instagram (Programar Post); o primeiro é o recomendado. */
export const FORMATS_BY_CONTENT_TYPE: Record<InstagramContentType, InstagramFormatId[]> = {
  POST: ['ig-feed-4x5', 'ig-feed-3x4', 'ig-feed-1x1', 'ig-feed-1.91x1'],
  CARROSSEL: ['ig-carrossel-4x5', 'ig-carrossel-3x4', 'ig-carrossel-1x1'],
  STORY: ['ig-story'],
  REEL: ['ig-reels'],
};

export const getFormat = (id: InstagramFormatId) => INSTAGRAM_FORMATS[id];

export const getDefaultFormat = (contentType: InstagramContentType) =>
  INSTAGRAM_FORMATS[FORMATS_BY_CONTENT_TYPE[contentType][0]];

/** "Instagram · Feed" */
export const formatPlaceLabel = (format: InstagramFormat) =>
  `${NETWORK_LABELS[format.network]} · ${PLACEMENT_LABELS[format.placement]}`;

const byIds = (ids: InstagramFormatId[]) => ids.map(getFormat);

/** Formato aceito cujas medidas batem exatamente com a imagem, se houver. Sem tipo: procura em todas as redes. */
export function findExactFormat(
  contentType: InstagramContentType | null,
  width: number,
  height: number,
): InstagramFormat | null {
  const candidates = byIds(contentType ? FORMATS_BY_CONTENT_TYPE[contentType] : ALL_FORMAT_IDS);
  return candidates.find((format) => format.width === width && format.height === height) ?? null;
}

/** Formato aceito com a proporção mais próxima da imagem. Sem tipo: procura no feed do Instagram e do Facebook. */
export function findClosestFormat(contentType: InstagramContentType | null, width: number, height: number): InstagramFormat {
  const ratio = width / height;
  const candidates = byIds(contentType ? FORMATS_BY_CONTENT_TYPE[contentType] : FORMATS_BY_CONTENT_TYPE.POST);
  return candidates.reduce((best, format) =>
    Math.abs(format.width / format.height - ratio) < Math.abs(best.width / best.height - ratio) ? format : best,
  );
}
