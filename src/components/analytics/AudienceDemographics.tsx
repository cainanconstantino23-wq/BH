'use client';

import { DemographicData } from '@/types/analytics';
import { Users, MapPin, PieChart } from 'lucide-react';

interface Props {
  data: DemographicData;
}

export function AudienceDemographics({ data }: Props) {
  const safeData = data || {
    ageGroups: [],
    topCities: [],
    gender: { female: 50, male: 50 }
  };

  const totalGender = (safeData.gender.female || 0) + (safeData.gender.male || 0) + (safeData.gender.other || 0);
  const femalePercent = totalGender > 0 ? Math.round(((safeData.gender.female || 0) / totalGender) * 100) : 50;
  const malePercent = totalGender > 0 ? Math.round(((safeData.gender.male || 0) / totalGender) * 100) : 50;

  return (
    <section className="space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-6">
      
      {/* Header do Bloco */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-control bg-surface-muted p-2 text-brand-plum">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Demografia da Audiência</h3>
            <p className="text-xs text-ink-muted">Distribuição por faixa etária, género e localização</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-0">
        
        {/* 1. Género */}
        <div className="flex min-w-0 flex-col justify-between space-y-3 md:pr-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <PieChart size={14} className="text-brand-plum" /> Género
            </span>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium text-ink">
                <span>Feminino ({femalePercent}%)</span>
                <span>Masculino ({malePercent}%)</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted">
                <div style={{ width: `${femalePercent}%` }} className="h-full bg-brand-plum" />
                <div style={{ width: `${malePercent}%` }} className="h-full bg-chart-secondary" />
              </div>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-plum"></span> Mulheres</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-secondary"></span> Homens</span>
            </div>
          </div>
        </div>

        {/* 2. Faixa Etária */}
        <div className="min-w-0 space-y-3 border-t border-border pt-5 md:border-l md:border-t-0 md:pl-5 md:pr-5 md:pt-0">
          <span className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Faixa Etária Principal
          </span>
          <div className="space-y-2">
            {(safeData.ageGroups || []).map((group, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-ink">
                  <span>{group.range} anos</span>
                  <span className="font-semibold tabular-nums">{group.percentage}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div style={{ width: `${group.percentage}%` }} className="h-full rounded-full bg-brand-plum" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Principais Cidades */}
        <div className="min-w-0 space-y-3 border-t border-border pt-5 md:border-l md:pl-5">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <MapPin size={14} className="text-brand-plum" /> Top Cidades
          </span>
          <div className="space-y-2.5">
            {(safeData.topCities || []).map((city, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{city.name}</span>
                <span className="font-semibold tabular-nums text-ink">
                  {city.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </section>
  );
}