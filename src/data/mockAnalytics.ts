import { AnalyticsData } from '@/types/analytics';

export const mockAnalyticsData: AnalyticsData = {
  reach: 124500,
  engagement: 8.4,
  followers: 45200,
  growthRate: 12.3,
  period: {
    startDate: '2026-03-01',
    endDate: '2026-03-25'
  },
  demographics: {
    ageGroups: [
      { range: '18-24', percentage: 15 },
      { range: '25-34', percentage: 45 },
      { range: '35-44', percentage: 25 },
      { range: '45+', percentage: 15 }
    ],
    gender: {
      female: 58,
      male: 42
    },
    topCities: [
      { name: 'São Paulo', percentage: 35 },
      { name: 'Rio de Janeiro', percentage: 25 },
      { name: 'Salvador', percentage: 15 },
      { name: 'Porto Seguro', percentage: 10 }
    ]
  },
  topContent: [
    {
      id: '1',
      title: 'Villa Vista Mar — Trancoso (Tour Completo)',
      thumbnail: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
      views: 45200,
      engagementRate: 9.2,
      platform: 'instagram',
      propertyRef: 'Villa Trancoso',
      reach: 38000,
      retentionRate: 74,
      likes: 4200,
      saves: 1250,
      shares: 890,
      publishedAt: '2026-03-10'
    },
    {
      id: '2',
      title: 'Bastidores de Gravação Bahia Homes',
      thumbnail: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
      views: 28400,
      engagementRate: 7.8,
      platform: 'youtube',
      propertyRef: 'Bastidores',
      reach: 24000,
      retentionRate: 65,
      likes: 2100,
      saves: 430,
      shares: 310,
      publishedAt: '2026-03-15'
    }
  ]
};