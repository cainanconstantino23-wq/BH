'use client';

import { useState } from 'react';
import { Eye, Heart, MessageCircle, Share2, TrendingUp, Video, Image as ImageIcon } from 'lucide-react';

interface ContentItem {
  id: string;
  title: string;
  type: 'REEL' | 'POST' | 'CAROUSEL';
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
}

const mockContent: ContentItem[] = [
  {
    id: '1',
    title: 'Tour Casa Trancoso - Luxo e Natureza',
    type: 'REEL',
    thumbnail: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
    publishedAt: '2 dias atrás',
    views: 45200,
    likes: 3840,
    comments: 142,
    shares: 890,
    engagementRate: 10.8
  },
  {
    id: '2',
    title: 'Design Biofílico em Imóveis de Alto Padrão',
    type: 'POST',
    thumbnail: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
    publishedAt: '4 dias atrás',
    views: 18300,
    likes: 1250,
    comments: 48,
    shares: 210,
    engagementRate: 8.2
  },
  {
    id: '3',
    title: 'Bastidores de Gravação - Praia do Espelho',
    type: 'REEL',
    thumbnail: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80',
    publishedAt: '1 semana atrás',
    views: 62100,
    likes: 5120,
    comments: 204,
    shares: 1150,
    engagementRate: 12.4
  }
];

export function ContentPerformance() {
  const [filter, setFilter] = useState<'ALL' | 'REEL' | 'POST'>('ALL');

  const filteredContent = mockContent.filter(item => {
    if (filter === 'ALL') return true;
    return item.type === filter;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">Performance de Conteúdo</h3>
          <p className="text-xs text-gray-500 mt-0.5">Análise das últimas publicações e engajamento</p>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'ALL' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('REEL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'REEL' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Reels
          </button>
          <button
            onClick={() => setFilter('POST')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'POST' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Posts
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              <th className="pb-3 font-semibold">Conteúdo</th>
              <th className="pb-3 font-semibold">Tipo</th>
              <th className="pb-3 font-semibold">Visualizações</th>
              <th className="pb-3 font-semibold">Curtidas</th>
              <th className="pb-3 font-semibold">Comentários</th>
              <th className="pb-3 font-semibold">Compartilhamentos</th>
              <th className="pb-3 font-semibold text-right">Taxa Engajamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-xs">
            {filteredContent.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/80 transition">
                <td className="py-3.5 pr-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={item.thumbnail} 
                      alt={item.title} 
                      className="w-12 h-12 rounded-lg object-cover shrink-0" 
                    />
                    <div>
                      <p className="font-bold text-gray-900 truncate max-w-xs">{item.title}</p>
                      <span className="text-[10px] text-gray-400">{item.publishedAt}</span>
                    </div>
                  </div>
                </td>
                <td className="py-3.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.type === 'REEL' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {item.type === 'REEL' ? <Video size={12} /> : <ImageIcon size={12} />}
                    {item.type}
                  </span>
                </td>
                <td className="py-3.5 font-semibold text-gray-900">
                  {item.views.toLocaleString('pt-BR')}
                </td>
                <td className="py-3.5 text-gray-600">
                  <span className="flex items-center gap-1">
                    <Heart size={13} className="text-red-500" />
                    {item.likes.toLocaleString('pt-BR')}
                  </span>
                </td>
                <td className="py-3.5 text-gray-600">
                  <span className="flex items-center gap-1">
                    <MessageCircle size={13} className="text-blue-500" />
                    {item.comments.toLocaleString('pt-BR')}
                  </span>
                </td>
                <td className="py-3.5 text-gray-600">
                  <span className="flex items-center gap-1">
                    <Share2 size={13} className="text-emerald-500" />
                    {item.shares.toLocaleString('pt-BR')}
                  </span>
                </td>
                <td className="py-3.5 text-right font-bold text-emerald-600">
                  <span className="inline-flex items-center gap-0.5 bg-emerald-50 px-2 py-1 rounded-lg">
                    <TrendingUp size={12} />
                    {item.engagementRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}