// Aprovação da grade: regras puras (sem banco), usadas pelo servidor, pela aba da equipe e pelo link da Thereza.
// 1 post de foto por dia; domingo é dia de Reels (vídeo), que fica fora da grade por enquanto e aparece só como espaço reservado.

export const PLAN_DAY_OPTIONS = [15, 30] as const;
export const DEFAULT_POST_HOUR = 19;

export type PlanStatus = 'rascunho' | 'enviado' | 'aprovado';

export interface PlanSlot {
  date: string; // AAAA-MM-DD
  kind: 'post' | 'reels';
}

export interface PlanCandidate {
  driveId: string;
  name: string;
  /** corte já salvo (URL do R2), se houver */
  editedUrl: string | null;
}

export interface PlanHouse {
  collectionId: number;
  label: string;
  /** null = reserva */
  slotDate: string | null;
  coverDriveId: string | null;
  candidates: PlanCandidate[];
}

export interface PlanLayoutItem {
  collectionId: number;
  slotDate: string | null;
  coverDriveId: string | null;
}

export interface PublishedTile {
  id: string;
  imageUrl: string | null;
  publishedAt: string | null;
  isVideo: boolean;
}

export interface FeedPlanSummary {
  id: number;
  startDate: string;
  days: number;
  hour: number;
  status: PlanStatus;
  houseCount: number;
  respondedAt: string | null;
  createdBy: string;
  createdAt: string;
  hasLink: boolean;
}

export interface FeedPlanDetail extends FeedPlanSummary {
  feedback: string;
  shareToken: string | null;
  houses: PlanHouse[];
  published: PublishedTile[];
}

/** O que o link público recebe (sem nomes da equipe nem o token). */
export interface PublicFeedPlan {
  startDate: string;
  days: number;
  hour: number;
  status: PlanStatus;
  feedback: string;
  respondedAt: string | null;
  houses: PlanHouse[];
  published: PublishedTile[];
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** Dias do plano, em ordem: domingo = Reels, os outros = post de foto. */
export function planSlots(startDate: string, days: number): PlanSlot[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(startDate, i);
    return { date, kind: isSunday(date) ? 'reels' : 'post' };
  });
}

export const postDates = (startDate: string, days: number) => planSlots(startDate, days).filter((slot) => slot.kind === 'post').map((slot) => slot.date);

/** Primeiras casas vão para os dias de post, na ordem; as que sobrarem ficam na reserva. */
export function distribute(collectionIds: number[], startDate: string, days: number): PlanLayoutItem[] {
  const dates = postDates(startDate, days);
  return collectionIds.map((collectionId, i) => ({ collectionId, slotDate: dates[i] ?? null, coverDriveId: null }));
}

/**
 * Confere uma grade enviada (pela equipe ou pela Thereza) contra as casas do plano:
 * mesmas casas, cada dia de post com no máximo uma casa, capa entre as candidatas daquela casa.
 * Devolve a grade limpa ou null se for inválida.
 */
export function validateLayout(input: unknown, houses: PlanHouse[], startDate: string, days: number): PlanLayoutItem[] | null {
  if (!Array.isArray(input)) return null;
  const allowedDates = new Set(postDates(startDate, days));
  const byId = new Map(houses.map((house) => [house.collectionId, house]));
  const seen = new Set<number>();
  const usedDates = new Set<string>();
  const items: PlanLayoutItem[] = [];
  for (const raw of input) {
    if (typeof raw !== 'object' || !raw) return null;
    const entry = raw as Record<string, unknown>;
    const collectionId = Number(entry.collectionId);
    const house = byId.get(collectionId);
    if (!house || seen.has(collectionId)) return null;
    seen.add(collectionId);
    const slotDate = entry.slotDate === null || entry.slotDate === undefined ? null : entry.slotDate;
    if (slotDate !== null) {
      if (!isIsoDate(slotDate) || !allowedDates.has(slotDate) || usedDates.has(slotDate)) return null;
      usedDates.add(slotDate);
    }
    const cover = typeof entry.coverDriveId === 'string' ? entry.coverDriveId : null;
    if (cover !== null && !house.candidates.some((candidate) => candidate.driveId === cover)) return null;
    items.push({ collectionId, slotDate, coverDriveId: cover });
  }
  if (seen.size !== houses.length) return null;
  return items;
}

/** Capa mostrada da casa: a escolhida, senão a primeira candidata. */
export const coverOf = (house: PlanHouse) =>
  house.candidates.find((candidate) => candidate.driveId === house.coverDriveId) ?? house.candidates[0] ?? null;

/** Troca as casas de dois dias (ou move para um dia vazio). */
export function swapSlots(houses: PlanHouse[], fromDate: string, toDate: string): PlanHouse[] {
  return houses.map((house) =>
    house.slotDate === fromDate ? { ...house, slotDate: toDate } : house.slotDate === toDate ? { ...house, slotDate: fromDate } : house,
  );
}

/** Põe uma casa da reserva no dia de outra (a outra vai para a reserva). */
export function replaceHouse(houses: PlanHouse[], date: string, reserveId: number): PlanHouse[] {
  return houses.map((house) =>
    house.collectionId === reserveId ? { ...house, slotDate: date } : house.slotDate === date ? { ...house, slotDate: null } : house,
  );
}

export const setCover = (houses: PlanHouse[], collectionId: number, driveId: string): PlanHouse[] =>
  houses.map((house) => (house.collectionId === collectionId ? { ...house, coverDriveId: driveId } : house));

export const toLayout = (houses: PlanHouse[]): PlanLayoutItem[] =>
  houses.map(({ collectionId, slotDate, coverDriveId }) => ({ collectionId, slotDate, coverDriveId }));

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
/** "sex 21/11" */
export function shortDay(date: string) {
  const [, m, d] = date.split('-');
  return `${weekday.format(new Date(`${date}T00:00:00Z`)).replace('.', '')} ${d}/${m}`;
}
/** "20/11 a 04/12" */
export function periodLabel(startDate: string, days: number) {
  const fmt = (date: string) => date.split('-').reverse().slice(0, 2).join('/');
  return `${fmt(startDate)} a ${fmt(addDays(startDate, days - 1))}`;
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  rascunho: 'Em montagem',
  enviado: 'Com a Thereza',
  aprovado: 'Aprovada',
};
