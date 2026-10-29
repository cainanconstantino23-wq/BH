'use client';

import { useState } from 'react';
import { Heart, MessageCircle, Share2, TrendingUp, Video, Image as ImageIcon } from 'lucide-react';

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
    <section className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Conteúdo de melhor desempenho</h2>
          <p className="mt-1 text-xs text-ink-muted">Publicações recentes e principais indicadores</p>
        </div>

        <div className="flex items-center gap-1 rounded-control bg-canvas p-1">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            aria-pressed={filter === 'ALL'}
            className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
              filter === 'ALL' ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter('REEL')}
            aria-pressed={filter === 'REEL'}
            className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
              filter === 'REEL' ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Reels
          </button>
          <button
            type="button"
            onClick={() => setFilter('POST')}
            aria-pressed={filter === 'POST'}
            className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${
              filter === 'POST' ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Posts
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left">
          <thead className="bg-canvas">
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2.5 font-semibold">Conteúdo</th>
              <th className="px-3 py-2.5 font-semibold">Tipo</th>
              <th className="px-3 py-2.5 font-semibold">Visualizações</th>
              <th className="px-3 py-2.5 font-semibold">Interações</th>
              <th className="px-3 py-2.5 text-right font-semibold">Taxa de engajamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs">
            {filteredContent.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-canvas/70">
                <td className="py-2.5 pl-3 pr-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={item.thumbnail} 
                      alt={item.title} 
                      className="h-10 w-10 shrink-0 rounded-control object-cover"
                    />
                    <div>
                      <p className="max-w-xs truncate font-medium text-ink">{item.title}</p>
                      <span className="text-[10px] text-ink-muted">{item.publishedAt}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                    item.type === 'REEL' ? 'bg-brand-plum text-white' : 'bg-canvas text-ink'
                  }`}>
                    {item.type === 'REEL' ? <Video size={12} /> : <ImageIcon size={12} />}
                    {item.type}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-ink">
                  {item.views.toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">
                  <div className="flex items-center gap-3">
                    <span aria-label={`${item.likes.toLocaleString('pt-BR')} curtidas`} className="inline-flex items-center gap-1">
                      <Heart aria-hidden="true" size={13} className="text-red-500" />
                      {item.likes.toLocaleString('pt-BR')}
                    </span>
                    <span aria-label={`${item.comments.toLocaleString('pt-BR')} comentários`} className="inline-flex items-center gap-1">
                      <MessageCircle aria-hidden="true" size={13} className="text-blue-500" />
                      {item.comments.toLocaleString('pt-BR')}
                    </span>
                    <span aria-label={`${item.shares.toLocaleString('pt-BR')} compartilhamentos`} className="inline-flex items-center gap-1">
                      <Share2 aria-hidden="true" size={13} className="text-emerald-500" />
                      {item.shares.toLocaleString('pt-BR')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-brand-plum">
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-canvas px-2 py-1">
                    <TrendingUp size={12} />
                    {item.engagementRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}