'use client';

import { VideoContentMetric } from '@/types/analytics';
import { Film, Eye, Bookmark, Share2, Heart } from 'lucide-react';

interface Props {
  content: VideoContentMetric[];
}

export function ContentPerformance({ content }: Props) {
  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Film className="w-5 h-5 text-indigo-500" />
          Desempenho dos Vídeos de Imóveis
        </h2>
        <span className="text-xs text-gray-500">Tours, Reels e Minidocumentários</span>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider border-b border-gray-200 text-xs">
              <tr>
                <th className="p-4 font-semibold">Vídeo / Imóvel</th>
                <th className="p-4 font-semibold">Ref. Imóvel</th>
                <th className="p-4 font-semibold">Alcance</th>
                <th className="p-4 font-semibold">Visualizações</th>
                <th className="p-4 font-semibold">Retenção</th>
                <th className="p-4 font-semibold text-right">Interações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {content.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900 flex items-center gap-2">
                    <span className="truncate max-w-xs">{item.title}</span>
                  </td>
                  <td className="p-4">
                    {item.propertyRef ? (
                      <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold">
                        {item.propertyRef}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-4 font-semibold text-gray-600">
                    {item.reach.toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4 font-semibold text-gray-900 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                    {item.views.toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700 text-xs">{item.retentionRate}%</span>
                      <div className="w-16 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${item.retentionRate}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-3 text-gray-500">
                      <span className="flex items-center gap-1 hover:text-red-500 transition cursor-pointer">
                        <Heart className="w-3.5 h-3.5" /> {item.likes}
                      </span>
                      <span className="flex items-center gap-1 hover:text-amber-500 transition cursor-pointer">
                        <Bookmark className="w-3.5 h-3.5" /> {item.saves}
                      </span>
                      <span className="flex items-center gap-1 hover:text-blue-500 transition cursor-pointer">
                        <Share2 className="w-3.5 h-3.5" /> {item.shares}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}