'use client';

import { VideoContentMetric } from '@/types/analytics';
import { Eye, Heart, Share2, Bookmark, TrendingUp } from 'lucide-react';

interface Props {
  content?: VideoContentMetric[];
}

export function ContentPerformance({ content = [] }: Props) {
  const safeContent = Array.isArray(content) ? content : [];

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <TrendingUp size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Desempenho de Conteúdo</h3>
            <p className="text-xs text-gray-500">Métricas de visualizações, alcance e engajamento dos vídeos</p>
          </div>
        </div>
      </div>

      {/* Tabela de Conteúdos */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <th className="pb-3 font-semibold">Conteúdo / Imóvel</th>
              <th className="pb-3 font-semibold">Plataforma</th>
              <th className="pb-3 font-semibold">Visualizações</th>
              <th className="pb-3 font-semibold">Alcance</th>
              <th className="pb-3 font-semibold">Engajamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
            {safeContent.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="py-3.5 pr-4 flex items-center gap-3">
                  <img 
                    src={item.thumbnail} 
                    alt={item.title} 
                    className="w-12 h-10 object-cover rounded-lg border border-gray-200 shrink-0" 
                  />
                  <div>
                    <span className="font-semibold text-gray-900 line-clamp-1">{item.title}</span>
                    <span className="text-[11px] text-gray-400">{item.propertyRef || 'Campanha Geral'}</span>
                  </div>
                </td>
                <td className="py-3.5 capitalize font-medium text-gray-600">
                  <span className="px-2.5 py-1 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-800">
                    {item.platform}
                  </span>
                </td>
                <td className="py-3.5 font-semibold text-gray-900">
                  {item.views.toLocaleString()}
                </td>
                <td className="py-3.5 text-gray-600 font-medium">
                  {(item.reach ?? 0).toLocaleString()}
                </td>
                <td className="py-3.5">
                  <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-md text-[11px]">
                    {item.engagementRate}%
                  </span>
                </td>
              </tr>
            ))}
            {safeContent.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400 text-xs">
                  Nenhum conteúdo registado para este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}