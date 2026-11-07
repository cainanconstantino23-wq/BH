// Tipos e cálculos das métricas do Instagram usados pela tela (sem dependências de servidor).

export interface DailyRow {
  date: string; // AAAA-MM-DD (fuso de São Paulo)
  followers_count: number | null;
  follows_count: number | null;
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  profile_links_taps: number | null;
  follows: number | null;
  unfollows: number | null;
}

export interface MediaRow {
  id: string;
  media_type: string | null;
  media_product_type: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  published_at: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  views: number | null;
  total_interactions: number | null;
  reels_avg_watch_time_ms: number | null;
}

export interface MetricsResponse {
  account: { username: string; lastSyncedAt: string | null; lastSyncError: string | null };
  today: string;
  daily: DailyRow[];
  media: MediaRow[];
}

export type PeriodDays = 7 | 30;
export type SummaryMetric = 'reach' | 'views' | 'total_interactions' | 'accounts_engaged';

function shiftDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Datas do período: os N dias completos que terminam ontem. */
export function periodDates(today: string, days: number, offsetPeriods = 0) {
  const end = shiftDate(today, -1 - offsetPeriods * days);
  return Array.from({ length: days }, (_, index) => shiftDate(end, -(days - 1 - index)));
}

function sumOver(rows: Map<string, DailyRow>, dates: string[], key: keyof DailyRow) {
  let total = 0;
  let covered = 0;
  for (const date of dates) {
    const value = rows.get(date)?.[key];
    if (typeof value === 'number') {
      total += value;
      covered++;
    }
  }
  return { total, complete: covered === dates.length, covered };
}

export interface PeriodSummary {
  dates: string[];
  followers: number | null;
  followersSince: string | null;
  newFollowers: number | null;
  lostFollowers: number | null;
  metrics: Record<SummaryMetric, { value: number; previous: number | null }>;
  series: { date: string; reach: number | null; views: number | null }[];
}

export function summarize(data: MetricsResponse, days: PeriodDays): PeriodSummary {
  const byDate = new Map(data.daily.map((row) => [row.date, row]));
  const dates = periodDates(data.today, days);
  const previousDates = periodDates(data.today, days, 1);

  const metrics = {} as PeriodSummary['metrics'];
  for (const key of ['reach', 'views', 'total_interactions', 'accounts_engaged'] as SummaryMetric[]) {
    const current = sumOver(byDate, dates, key);
    const previous = sumOver(byDate, previousDates, key);
    metrics[key] = { value: current.total, previous: previous.complete ? previous.total : null };
  }

  const snapshots = data.daily.filter((row) => typeof row.followers_count === 'number').sort((a, b) => a.date.localeCompare(b.date));
  const follows = sumOver(byDate, dates, 'follows');
  const unfollows = sumOver(byDate, dates, 'unfollows');

  return {
    dates,
    followers: snapshots.at(-1)?.followers_count ?? null,
    followersSince: snapshots[0]?.date ?? null,
    newFollowers: follows.covered ? follows.total : null,
    lostFollowers: unfollows.covered ? unfollows.total : null,
    metrics,
    series: dates.map((date) => ({ date, reach: byDate.get(date)?.reach ?? null, views: byDate.get(date)?.views ?? null })),
  };
}

export function percentChange(value: number, previous: number | null) {
  if (previous === null || previous === 0) return null;
  return ((value - previous) / previous) * 100;
}
