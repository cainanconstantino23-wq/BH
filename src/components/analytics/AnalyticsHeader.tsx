'use client';

import { SocialPlatform } from '@/types/analytics';
import { Calendar, FolderPlus } from 'lucide-react';

interface Props {
  activePlatform: SocialPlatform;
  onSelectPlatform: (platform: SocialPlatform) => void;
  period: { startDate: string; endDate: string };
  onOpenCatalog: () => void;
}

// ... Manter os componentes SVG de redes sociais intactos ...

export function AnalyticsHeader({ activePlatform, onSelectPlatform, period, onOpenCatalog }: Props) {
  // ... Manter array de platforms intacto ...

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
      <div className="flex items-center gap-4">
        {/* Botão Catálogo no canto superior esquerdo */}
        <button
          onClick={onOpenCatalog}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-3.5 py-2 rounded-lg transition shadow-lg"
        >
          <FolderPlus size={16} />
          Catálogo
        </button>

        <div>
          <h1 className="text-2xl font-bold text-white">Bahia Homes — Analytics</h1>
          <p className="text-sm text-gray-400">Desempenho de audiência e alcance de conteúdo</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Seletor de Redes */}
        {/* ... Manter seletor de redes e período ... */}
      </div>
    </div>
  );
}