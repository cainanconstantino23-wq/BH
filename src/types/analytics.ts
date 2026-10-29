export interface HousePhoto {
  id: string;
  url: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface House {
  id: string;
  title: string;
  location: string;
  price: string;
  description: string;
  photos: HousePhoto[];
}

export interface ScheduledPost {
  id: string;
  title: string;
  caption: string;
  dayIndex: number;
  hour: number;
  timeString: string;
  image: string;
  platform: 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin';
  postType: 'reels' | 'post' | 'story';
}

export interface MessageItem {
  id: string;
  senderName: string;
  senderAvatar: string;
  preview: string;
  time: string;
  unread: boolean;
  platform: 'instagram' | 'whatsapp';
}

export type SocialPlatform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin';

export interface CityData {
  name?: string;
  city?: string;
  state?: string;
  percentage: number;
}

export interface DemographicData {
  ageGroups: { range: string; percentage: number }[];
  cities?: CityData[];
  topCities?: CityData[];
  topCountries?: { name: string; percentage: number }[];
  gender: { female: number; male: number; other?: number };
}

export interface VideoContentMetric {
  id: string;
  title: string;
  thumbnail?: string;
  views: number;
  engagementRate?: number;
  platform: SocialPlatform;
  propertyRef?: string;
  reach?: number;
  retentionRate?: number;
  likes?: number;
  saves?: number;
  shares?: number;
  publishedAt?: string;
}

export interface PeriodData {
  startDate: string;
  endDate: string;
}

export interface AnalyticsData {
  reach: number;
  engagement: number;
  followers: number;
  growthRate: number;
  period?: PeriodData;
  platform?: SocialPlatform;
  topContent?: VideoContentMetric[];
  demographics?: DemographicData;
}