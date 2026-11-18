// Tipos da aprovação de capa (pastas por casa com fotos do Google Drive). Usados no painel, nas rotas e na página pública.

/** 'capa' = aba Aprovação de capa; 'fotos' = aba Aprovação fotos (15 fotos do carrossel por casa). */
export type CollectionKind = 'capa' | 'fotos';
/** Máximo de fotos do carrossel por casa na Aprovação fotos. */
export const CAROUSEL_LIMIT = 15;
export const photoLimit = (kind: CollectionKind) => (kind === 'fotos' ? CAROUSEL_LIMIT : null);
export const parseKind = (value: unknown): CollectionKind => (value === 'fotos' ? 'fotos' : 'capa');

export interface CoverPhoto {
  driveId: string;
  name: string;
  width: number | null;
  height: number | null;
  favorite: boolean;
  approved: boolean;
  /** Versão cortada no editor (R2); quando existe, é ela que aparece e vai para a aprovação. */
  edited: EditedImage | null;
  /** Registro: quem/quando escolheu, marcou como capa e aprovou. */
  addedBy: string | null;
  addedAt: string | null;
  favoritedBy: string | null;
  favoritedAt: string | null;
  /** A aprovadora pôs esta foto nas capas pelo link ("Encontrar mais fotos"). */
  favoritedByApprover: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Quem cortou (edited) e quando; a aprovadora aparece como APPROVER_LABEL. */
  editedBy: string | null;
  editedAt: string | null;
}

/** Data e hora curtas para o registro: "16/11 14:32". */
export const formatStamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
    : '';

/** Data e hora completas: "18/11/2026 às 14:32". */
export const formatLongStamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')
    : '';

/** Quem fez o quê e quando, numa linha, para a miniatura da foto. */
export function photoStamp(photo: CoverPhoto) {
  if (photo.approved) return `Aprovada por ${shortName(photo.approvedBy)}${photo.approvedAt ? ` · ${formatStamp(photo.approvedAt)}` : ''}`;
  if (photo.favorite) return `Capa por ${shortName(photo.favoritedBy)}${photo.favoritedAt ? ` · ${formatStamp(photo.favoritedAt)}` : ''}`;
  return `Escolhida por ${shortName(photo.addedBy)}${photo.addedAt ? ` · ${formatStamp(photo.addedAt)}` : ''}`;
}
const shortName = (label: string | null) => (label ? label.replace(/ \(link de aprovação\)$/, '') : '—');

/** Nome da aprovadora (link público, sem login) no registro e nos rótulos. */
export const APPROVER_NAME = 'Thereza';
export const APPROVER_LABEL = `${APPROVER_NAME} (link de aprovação)`;

/** Uma linha do registro da pasta (activity_log). */
export interface CoverActivity {
  id: number;
  createdAt: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
}

export interface EditedImage {
  url: string;
  width: number;
  height: number;
  /** Ex.: "Instagram · Feed 4:5" */
  label: string;
}

export interface CoverCollectionSummary {
  id: number;
  houseName: string;
  neighborhood: string;
  houseNumber: string;
  photoCount: number;
  favoriteCount: number;
  approvedCount: number;
  coverDriveId: string | null;
  /** Corte da foto de capa, se houver. */
  coverEditedUrl: string | null;
  shareToken: string | null;
  responded: boolean;
  updatedAt: string;
  /** Data planejada da publicação (AAAA-MM-DD) e hora; null se ainda não definida. */
  plannedDate: string | null;
  plannedHour: number | null;
  /** Post programado a partir desta pasta (posts.cover_collection_id): o mais recente. Só na listagem. */
  post?: CollectionPostInfo | null;
}

/** Data planejada válida (AAAA-MM-DD) e hora 0–23, para as rotas. */
export function parsePlanned(date: unknown, hour: unknown): { planned_date: string | null; planned_hour: number | null } | undefined {
  if (date === null) return { planned_date: null, planned_hour: null };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`))) return undefined;
  const h = Number(hour);
  return { planned_date: date, planned_hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 19 };
}

export interface CollectionPostInfo {
  id: number;
  /** published = no ar no Instagram; scheduled = vai sozinho no horário; saved = no calendário sem agendar */
  status: 'published' | 'scheduled' | 'saved';
  scheduledDate: string | null;
  hour: number | null;
  permalink: string | null;
}

export interface CoverCollectionDetail extends CoverCollectionSummary {
  feedback: string;
  respondedAt: string | null;
  photos: CoverPhoto[];
  linkCreatedBy: string | null;
  linkCreatedAt: string | null;
  /** O social media confirmou as capas escolhidas pela aprovadora. */
  confirmedBy: string | null;
  confirmedAt: string | null;
  history: CoverActivity[];
}

/** Resposta pública do link: as favoritas e, em "Encontrar mais fotos", as demais da pasta (ex.: as 15 do carrossel). */
export interface PublicCoverCollection {
  label: string;
  feedback: string;
  respondedAt: string | null;
  photos: CoverPhoto[];
  morePhotos: CoverPhoto[];
}
