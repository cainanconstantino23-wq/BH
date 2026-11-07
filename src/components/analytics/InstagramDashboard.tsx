'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import {
  percentChange,
  summarize,
  type MediaRow,
  type MetricsResponse,
  type PeriodDays,
  type SummaryMetric,
} from '@/lib/instagramMetrics';

const number = new Intl.NumberFormat('pt-BR');
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const formatDay = (iso: string) => shortDate.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');

function relativeTime(iso: string | null) {
  if (!iso) return 'ainda não atualizado';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'atualizado agora';
  if (minutes < 60) return `atualizado há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `atualizado há ${hours} h`;
  const days = Math.round(hours / 24);
  return `atualizado há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/* ------------------------------------------------------------------ */
/* Contêiner: busca os dados e dispara a atualização                   */
/* ------------------------------------------------------------------ */

export function InstagramDashboard() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/instagram/metrics', { cache: 'no-store' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return (await response.json()) as MetricsResponse;
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .then((result) => active && setData(result))
      .catch((error: unknown) => {
        console.error('Erro ao carregar métricas do Instagram:', error);
        if (active) setLoadError('Não foi possível carregar as métricas. Recarregue a página.');
      });
    return () => {
      active = false;
    };
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const response = await fetch('/api/instagram/sync', { method: 'POST' });
      if (response.status === 429) {
        setSyncMessage('Os dados foram atualizados há menos de 2 minutos. Tente de novo em instantes.');
        return;
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      setData(await load());
      setSyncMessage('Métricas atualizadas.');
    } catch (error) {
      console.error('Erro ao atualizar métricas do Instagram:', error);
      setSyncMessage('A atualização falhou. Tente de novo em alguns minutos.');
    } finally {
      setSyncing(false);
    }
  };

  if (loadError) {
    return (
      <p role="alert" className="rounded-control border border-status-danger-border bg-status-danger-soft px-4 py-3 text-xs text-status-danger">
        {loadError}
      </p>
    );
  }

  if (!data) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-panel border border-border bg-surface p-6 text-sm text-ink-muted">
        <LoaderCircle aria-hidden="true" size={16} className="animate-spin motion-reduce:animate-none" />
        Carregando métricas do Instagram…
      </div>
    );
  }

  return <InstagramDashboardView data={data} syncing={syncing} syncMessage={syncMessage} onSync={handleSync} />;
}

/* ------------------------------------------------------------------ */
/* Visualização                                                        */
/* ------------------------------------------------------------------ */

interface ViewProps {
  data: MetricsResponse;
  syncing: boolean;
  syncMessage: string;
  onSync: () => void;
}

const SUMMARY_TILES: { key: SummaryMetric; label: string; hint: string }[] = [
  { key: 'views', label: 'Visualizações', hint: 'Vezes que o conteúdo foi exibido' },
  { key: 'reach', label: 'Alcance', hint: 'Contas alcançadas, somadas dia a dia' },
  { key: 'total_interactions', label: 'Interações', hint: 'Curtidas, comentários, compartilhamentos e salvamentos' },
];

export function InstagramDashboardView({ data, syncing, syncMessage, onSync }: ViewProps) {
  const [days, setDays] = useState<PeriodDays>(30);
  const summary = useMemo(() => summarize(data, days), [data, days]);
  const hasData = data.daily.length > 0 || data.media.length > 0;
  const periodLabel = `${formatDay(summary.dates[0])} – ${formatDay(summary.dates.at(-1)!)}`;

  return (
    <div className="space-y-4">
      {/* Barra: conta, atualização e período */}
      <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-platform-instagram">
            <InstagramGlyph />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">@{data.account.username || 'instagram'}</p>
            <p className="text-xs text-ink-muted">
              {relativeTime(data.account.lastSyncedAt)}
              {data.account.lastSyncError && !syncing ? (
                <span className="ml-1 text-status-warning">(a última tentativa falhou)</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="flex rounded-control bg-canvas p-1">
            {([7, 30] as PeriodDays[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
                  days === option ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {option} dias
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-xs font-semibold text-ink transition-colors duration-150 ease-out hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw aria-hidden="true" size={14} className={syncing ? 'animate-spin motion-reduce:animate-none' : ''} />
            {syncing ? 'Atualizando…' : 'Atualizar agora'}
          </button>
        </div>
      </div>

      {syncMessage && (
        <p role="status" className="text-xs text-ink-muted">
          {syncMessage}
        </p>
      )}

      {!hasData ? (
        <div className="rounded-panel border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-ink">Ainda não há métricas guardadas</p>
          <p className="mt-1 text-xs text-ink-muted">Clique em Atualizar agora para buscar os dados da conta no Instagram.</p>
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <section aria-label={`Resumo de ${periodLabel}`} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="min-w-0 rounded-control border border-border bg-surface px-4 py-3">
              <p className="text-xs font-medium text-ink-muted">Seguidores</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">
                {summary.followers === null ? '–' : number.format(summary.followers)}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {summary.newFollowers !== null && summary.lostFollowers !== null
                  ? `${signed(summary.newFollowers - summary.lostFollowers)} no período`
                  : 'Total atual da conta'}
              </p>
            </div>
            {SUMMARY_TILES.map((tile) => {
              const metric = summary.metrics[tile.key];
              return (
                <div key={tile.key} className="min-w-0 rounded-control border border-border bg-surface px-4 py-3" title={tile.hint}>
                  <p className="text-xs font-medium text-ink-muted">{tile.label}</p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">{number.format(metric.value)}</p>
                  <Delta value={metric.value} previous={metric.previous} days={days} />
                </div>
              );
            })}
          </section>

          {/* Gráfico diário + seguidores */}
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.8fr)]">
            <section className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-ink">Visualizações e alcance por dia</h2>
                  <p className="mt-1 text-xs text-ink-muted">{periodLabel}</p>
                </div>
                <div className="flex gap-4 text-xs text-ink-muted" aria-hidden="true">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-0.5 w-4 rounded-full bg-brand-plum" /> Visualizações
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-0.5 w-4 rounded-full bg-chart-secondary" /> Alcance
                  </span>
                </div>
              </div>
              <DailyChart series={summary.series} />
            </section>

            <section className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
              <h2 className="text-base font-semibold text-ink">Saldo de seguidores</h2>
              <p className="mt-1 text-xs text-ink-muted">{periodLabel}</p>
              <dl className="mt-4 divide-y divide-border border-y border-border">
                <FollowerRow label="Novos seguidores" value={summary.newFollowers} />
                <FollowerRow label="Deixaram de seguir" value={summary.lostFollowers} />
                <FollowerRow
                  label="Saldo"
                  value={
                    summary.newFollowers !== null && summary.lostFollowers !== null
                      ? summary.newFollowers - summary.lostFollowers
                      : null
                  }
                  emphasis
                />
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                O Instagram não informa o histórico do total de seguidores. A contagem diária começou em{' '}
                {summary.followersSince ? fullDate.format(new Date(`${summary.followersSince}T12:00:00Z`)) : 'hoje'}.
              </p>
            </section>
          </div>

          <MediaRanking media={data.media} />
        </>
      )}
    </div>
  );
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${number.format(value)}`;
}

function Delta({ value, previous, days }: { value: number; previous: number | null; days: number }) {
  const change = percentChange(value, previous);
  if (change === null) return <p className="mt-1 text-[11px] text-ink-muted">Sem comparação com o período anterior</p>;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className={`mt-1 flex items-start gap-0.5 text-[11px] font-medium leading-tight ${up ? 'text-status-success' : 'text-status-danger'}`}
      title={`Comparado aos ${days} dias anteriores`}
    >
      <Icon aria-hidden="true" size={13} className="mt-px shrink-0" />
      <span>{`${up ? '+' : ''}${change.toFixed(0)}% vs. período anterior`}</span>
    </p>
  );
}

function FollowerRow({ label, value, emphasis = false }: { label: string; value: number | null; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`tabular-nums ${emphasis ? 'text-lg font-semibold text-brand-plum' : 'text-sm font-semibold text-ink'}`}>
        {value === null ? '–' : emphasis ? signed(value) : number.format(value)}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gráfico diário (SVG, mesmo estilo dos gráficos do painel)          */
/* ------------------------------------------------------------------ */

function DailyChart({ series }: { series: { date: string; reach: number | null; views: number | null }[] }) {
  const width = 720;
  const height = 200;
  const max = Math.max(1, ...series.flatMap((point) => [point.views ?? 0, point.reach ?? 0]));
  const niceMax = niceCeil(max);
  const x = (index: number) => (width * index) / Math.max(series.length - 1, 1);
  const y = (value: number) => height * (1 - value / niceMax);
  const labelEvery = Math.max(1, Math.ceil(series.length / 5));
  const ticks = [1, 0.5, 0];

  const line = (key: 'views' | 'reach') =>
    series
      .map((point, index) => (point[key] === null ? null : `${x(index)},${y(point[key]!)}`))
      .filter(Boolean)
      .join(' ');

  const totalViews = series.reduce((sum, point) => sum + (point.views ?? 0), 0);
  const peak = series.reduce((best, point) => ((point.views ?? 0) > (best.views ?? 0) ? point : best), series[0]);

  return (
    <div
      className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2"
      role="img"
      aria-label={`Gráfico diário: ${number.format(totalViews)} visualizações no período; pico de ${number.format(peak?.views ?? 0)} em ${peak ? formatDay(peak.date) : '–'}.`}
    >
      <div className="flex h-48 flex-col justify-between text-right text-[11px] tabular-nums leading-none text-ink-muted sm:h-52" aria-hidden="true">
        {ticks.map((fraction) => (
          <span key={fraction}>{compact.format(Math.round(niceMax * fraction))}</span>
        ))}
      </div>
      <svg className="h-48 w-full overflow-visible sm:h-52" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {ticks.map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={width}
            y1={y(niceMax * fraction)}
            y2={y(niceMax * fraction)}
            stroke="var(--color-border)"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline points={line('reach')} fill="none" stroke="var(--color-chart-secondary)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polyline points={line('views')} fill="none" stroke="var(--color-brand-plum)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {series.map((point, index) => (
          <g key={`hit-${point.date}`}>
            <title>{`${formatDay(point.date)}: ${number.format(point.views ?? 0)} visualizações, ${number.format(point.reach ?? 0)} de alcance`}</title>
            <rect x={x(index) - width / series.length / 2} y={0} width={width / series.length} height={height} fill="transparent" />
          </g>
        ))}
      </svg>
      <span aria-hidden="true" />
      <div className="relative mt-2 h-4 text-[11px] text-ink-muted" aria-hidden="true">
        {series.map((point, index) => {
          const last = series.length - 1;
          const middle = Math.round(last / 2);
          const onGrid = index % labelEvery === 0 && last - index >= labelEvery * 0.6;
          if (!onGrid && index !== last && index !== middle) return null;
          const onMobile = index === 0 || index === last || index === middle;
          const visibility = !onMobile ? 'hidden sm:inline' : onGrid || index === last ? '' : 'sm:hidden';
          return (
            <span
              key={point.date}
              className={`absolute top-0 whitespace-nowrap ${visibility}`}
              style={{
                left: `${(index / Math.max(last, 1)) * 100}%`,
                transform: index === 0 ? 'none' : index === last ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {formatDay(point.date)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function niceCeil(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/* ------------------------------------------------------------------ */
/* Ranking das publicações                                             */
/* ------------------------------------------------------------------ */

type SortKey = 'views' | 'reach' | 'shares' | 'saved' | 'likes' | 'comments';
type TypeFilter = 'ALL' | 'REELS' | 'FEED';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'views', label: 'Visualizações' },
  { key: 'reach', label: 'Alcance' },
  { key: 'shares', label: 'Compartilhamentos' },
  { key: 'saved', label: 'Salvamentos' },
  { key: 'likes', label: 'Curtidas' },
  { key: 'comments', label: 'Comentários' },
];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'views', label: 'Visualizações' },
  { key: 'reach', label: 'Alcance' },
  { key: 'likes', label: 'Curtidas' },
  { key: 'comments', label: 'Coment.' },
  { key: 'shares', label: 'Compart.' },
  { key: 'saved', label: 'Salvos' },
];

function mediaKind(item: MediaRow) {
  if (item.media_product_type === 'REELS') return { label: 'Reel', icon: Film };
  if (item.media_type === 'CAROUSEL_ALBUM') return { label: 'Carrossel', icon: Layers };
  return { label: 'Post', icon: ImageIcon };
}

function MediaRanking({ media }: { media: MediaRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [filter, setFilter] = useState<TypeFilter>('ALL');

  const rows = useMemo(
    () =>
      media
        .filter((item) =>
          filter === 'ALL' ? true : filter === 'REELS' ? item.media_product_type === 'REELS' : item.media_product_type !== 'REELS',
        )
        .sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1)),
    [media, sortKey, filter],
  );

  return (
    <section className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Publicações que mais performaram</h2>
          <p className="mt-1 text-xs text-ink-muted">Todas as publicações da conta, com as métricas acumuladas de cada uma</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Tipo de publicação" className="flex rounded-control bg-canvas p-1">
            {(
              [
                ['ALL', 'Todas'],
                ['REELS', 'Reels'],
                ['FEED', 'Posts'],
              ] as [TypeFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
                  filter === value ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Ordenar por
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="min-h-9 rounded-control border border-border bg-surface px-2 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">Nenhuma publicação deste tipo.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] text-ink-muted">
                <th scope="col" className="w-8 py-2 pr-2 font-medium">#</th>
                <th scope="col" className="py-2 pr-4 font-medium">Publicação</th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sortKey === column.key ? 'descending' : undefined}
                    className={`px-2 py-2 text-right ${sortKey === column.key ? 'font-semibold text-ink' : 'font-medium'}`}
                  >
                    {column.label}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-2 text-right font-medium">Tempo médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((item, index) => {
                const kind = mediaKind(item);
                const KindIcon = kind.icon;
                const image = item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url ?? item.thumbnail_url;
                const caption = (item.caption ?? '').split('\n')[0] || 'Sem legenda';
                return (
                  <tr key={item.id} className={index === 0 ? 'bg-surface-muted/50' : ''}>
                    <td className="py-2.5 pr-2 tabular-nums text-ink-muted">{index + 1}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-3">
                        <Thumb src={image} />
                        <div className="min-w-0 max-w-[18rem]">
                          <a
                            href={item.permalink ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex max-w-full items-center gap-1 font-medium text-ink hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                          >
                            <span className="truncate">{caption}</span>
                            <ExternalLink aria-hidden="true" size={12} className="shrink-0 opacity-50 group-hover:opacity-100" />
                            <span className="sr-only">(abre no Instagram)</span>
                          </a>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                            <KindIcon aria-hidden="true" size={12} />
                            {kind.label}
                            {item.published_at ? `, ${fullDate.format(new Date(item.published_at))}` : ''}
                            {index === 0 ? (
                              <span className="ml-1 rounded-full bg-brand-plum px-1.5 py-px text-[10px] font-semibold text-white">Destaque</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`px-2 py-2.5 text-right tabular-nums ${sortKey === column.key ? 'font-semibold text-ink' : 'text-ink-muted'}`}
                      >
                        {item[column.key] === null ? '–' : number.format(item[column.key]!)}
                      </td>
                    ))}
                    <td className="py-2.5 pl-2 text-right tabular-nums text-ink-muted">
                      {item.reels_avg_watch_time_ms ? `${(item.reels_avg_watch_time_ms / 1000).toFixed(1).replace('.', ',')} s` : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-muted text-ink-muted">
        <ImageIcon size={14} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-control object-cover"
    />
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
