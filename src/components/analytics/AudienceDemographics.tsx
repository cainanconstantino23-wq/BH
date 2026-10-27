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
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
      
      {/* Header do Bloco */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-50 text-pink-600 rounded-xl">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Demografia da Audiência</h3>
            <p className="text-xs text-gray-500">Distribuição por faixa etária, género e localização</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 1. Género */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <PieChart size={14} className="text-pink-600" /> Género
            </span>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                <span>Feminino ({femalePercent}%)</span>
                <span>Masculino ({malePercent}%)</span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex">
                <div style={{ width: `${femalePercent}%` }} className="bg-pink-500 h-full transition-all duration-500" />
                <div style={{ width: `${malePercent}%` }} className="bg-blue-600 h-full transition-all duration-500" />
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-500"></span> Mulheres</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600"></span> Homens</span>
            </div>
          </div>
        </div>

        {/* 2. Faixa Etária */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
            Faixa Etária Principal
          </span>
          <div className="space-y-2">
            {(safeData.ageGroups || []).map((group, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-gray-700">
                  <span>{group.range} anos</span>
                  <span className="font-bold">{group.percentage}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div style={{ width: `${group.percentage}%` }} className="bg-[#231b2d] h-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Principais Cidades */}
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <MapPin size={14} className="text-pink-600" /> Top Cidades
          </span>
          <div className="space-y-2.5">
            {(safeData.topCities || []).map((city, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-medium">{city.name}</span>
                <span className="bg-white px-2 py-0.5 rounded border border-gray-200 font-bold text-gray-900 shadow-2xs">
                  {city.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}