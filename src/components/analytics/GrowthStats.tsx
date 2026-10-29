'use client';

import type { PeriodData } from '@/types/analytics';

interface GrowthStatsProps {
  period: PeriodData;
}

interface ChartPoint {
  date: string;
  followers: number;
  following: number;
  acquired: number;
  lost: number;
}

const chartValues = [
  { followers: 1204, following: 431, acquired: 0, lost: 0 },
  { followers: 1218, following: 438, acquired: 8, lost: 2 },
  { followers: 1237, following: 445, acquired: 19, lost: 4 },
  { followers: 1250, following: 450, acquired: 24, lost: 6 },
];

const chartWidth = 720;
const chartHeight = 220;
const chartPadding = { top: 16, right: 12, bottom: 34, left: 48 };

function createChartPoints(period: PeriodData): ChartPoint[] {
  const start = new Date(`${period.startDate}T00:00:00`);
  const end = new Date(`${period.endDate}T00:00:00`);
  const range = end.getTime() - start.getTime();

  return chartValues.map((values, index) => {
    const date = new Date(start.getTime() + (range * index) / (chartValues.length - 1));

    return {
      ...values,
      date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
        .format(date)
        .replace('.', ''),
    };
  });
}

function LineChart({
  points,
  series,
  maxValue,
  label,
  compact = false,
}: {
  points: ChartPoint[];
  series: { key: 'followers' | 'following' | 'acquired' | 'lost'; color: string; label: string }[];
  maxValue: number;
  label: string;
  compact?: boolean;
}) {
  const viewWidth = compact ? 360 : chartWidth;
  const padding = compact ? { top: 16, right: 8, bottom: 34, left: 34 } : chartPadding;
  const plotWidth = viewWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxValue * fraction));

  const getX = (index: number) =>
    padding.left + (plotWidth * index) / Math.max(points.length - 1, 1);
  const getY = (value: number) => padding.top + plotHeight * (1 - value / maxValue);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-2" aria-hidden="true">
        {series.map(({ key, color, label: seriesLabel }) => (
          <span key={key} className="inline-flex items-center gap-2 text-xs text-ink-muted">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />
            {seriesLabel}
          </span>
        ))}
      </div>
      <div className={`w-full ${compact ? 'h-40' : 'h-56'}`} role="img" aria-label={label}>
        <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${viewWidth} ${chartHeight}`} preserveAspectRatio="none">
          {yTicks.map((tick) => {
            const y = getY(tick);

            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={viewWidth - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="3 5"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize={compact ? '8' : '11'}
                >
                  {tick.toLocaleString('pt-BR')}
                </text>
              </g>
            );
          })}

          {points.map((point, index) => (
            <text
              key={`${point.date}-${index}`}
              x={getX(index)}
              y={chartHeight - 8}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              fill="#6b7280"
              fontSize={compact ? '8' : '11'}
            >
              {point.date}
            </text>
          ))}

          {series.map(({ key, color }) => {
            const coordinates = points.map((point, index) => `${getX(index)},${getY(point[key])}`).join(' ');

            return (
              <g key={key}>
                <polyline
                  points={coordinates}
                  fill="none"
                  stroke={color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {points.map((point, index) => (
                  <circle
                    key={`${key}-${point.date}`}
                    cx={getX(index)}
                    cy={getY(point[key])}
                    r="4"
                    fill="white"
                    stroke={color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <span className="block text-base font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-[11px] leading-tight text-ink-muted">{label}</span>
    </div>
  );
}

export function GrowthStats({ period }: GrowthStatsProps) {
  const points = createChartPoints(period);
  const summary = [
    { label: 'Seguindo', value: '450' },
    { label: 'Posts diários', value: '0,5' },
    { label: 'Posts por semana', value: '3' },
  ];

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
      <section className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Crescimento da comunidade</h2>
            <p className="mt-1 text-xs text-ink-muted">Evolução de seguidores e perfis seguidos</p>
          </div>
        </div>

        <LineChart
          points={points}
          maxValue={1300}
          label="Evolução de seguidores e perfis seguidos durante o período"
          series={[
            { key: 'followers', color: '#231b2d', label: 'Seguidores' },
            { key: 'following', color: '#87909d', label: 'Seguindo' },
          ]}
        />

        <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
          {summary.map((item) => (
            <SummaryCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-ink">Saldo de seguidores</h2>
          <p className="mt-1 text-xs text-ink-muted">Entradas e saídas no período</p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-y border-border py-3 text-center">
          <div className="px-1">
            <span className="block text-lg font-semibold tabular-nums text-ink">24</span>
            <span className="text-[10px] text-ink-muted">Adquiridos</span>
          </div>
          <div className="px-1">
            <span className="block text-lg font-semibold tabular-nums text-ink">6</span>
            <span className="text-[10px] text-ink-muted">Perdidos</span>
          </div>
          <div className="px-1">
            <span className="block text-lg font-semibold tabular-nums text-brand-plum">18</span>
            <span className="text-[10px] text-ink-muted">Saldo líquido</span>
          </div>
        </div>

        <LineChart
          points={points}
          maxValue={24}
          label="Seguidores adquiridos e perdidos durante o período"
          series={[
            { key: 'acquired', color: '#231b2d', label: 'Adquiridos' },
            { key: 'lost', color: '#87909d', label: 'Perdidos' },
          ]}
          compact
        />
      </section>
    </div>
  );
}
