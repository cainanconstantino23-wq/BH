'use client';

import { useState } from 'react';
import { mockAnalyticsData } from '@/data/mockAnalytics';
import { SocialPlatform } from '@/types/analytics';
import { AudienceDemographics } from '@/components/analytics/AudienceDemographics';
import { ContentPerformance } from '@/components/analytics/ContentPerformance';
import { AccountManagement } from '@/components/analytics/AccountManagement';
import { CatalogModal } from '@/components/analytics/CatalogModal';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { GrowthStats } from '@/components/analytics/GrowthStats';
import { MessagesInbox } from '@/components/analytics/MessagesInbox';
import { PlannerScheduler } from '@/components/analytics/PlannerScheduler';
import { 
  BarChart2, Inbox, Calendar as CalendarIcon, 
  FolderPlus, User, LogOut, CalendarDays
} from 'lucide-react';

function InstagramIcon({ className = 'w-4 h-4' }) { return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z"/></svg>; }
function FacebookIcon({ className = 'w-4 h-4' }) { return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>; }
function YoutubeIcon({ className = 'w-4 h-4' }) { return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>; }
function LinkedinIcon({ className = 'w-4 h-4' }) { return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>; }

export default function Home() {
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>({ name: 'Cainan', email: 'cainan@daimefilmes.com' });
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'comunidade' | 'demografia' | 'conta' | 'inbox' | 'planner'>('comunidade');

  if (!currentUser) {
    return <AuthScreen onLogin={(data) => setCurrentUser(data)} />;
  }

  const platforms: { id: SocialPlatform; label: string; icon: any }[] = [
    { id: 'instagram', label: 'Instagram', icon: InstagramIcon },
    { id: 'facebook', label: 'Facebook', icon: FacebookIcon },
    { id: 'youtube', label: 'YouTube', icon: YoutubeIcon },
    { id: 'linkedin', label: 'LinkedIn', icon: LinkedinIcon },
  ];

  return (
    <div className="flex h-screen bg-[#f8faf8] text-gray-900 font-sans overflow-hidden antialiased">
      
      {/* 1. BARRA LATERAL */}
      <aside className="w-64 border-r border-gray-200/80 flex flex-col bg-white shrink-0 shadow-2xs z-10">
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <span className="font-bold text-gray-900 flex items-center gap-2.5 tracking-tight text-sm">
            <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center font-bold text-xs">BH</div>
            Bahia Homes Analytics
          </span>
        </div>
        <nav className="flex-1 py-6 px-3">
          <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Plataformas</p>
          <ul className="space-y-1">
            {platforms.map((p) => {
              const Icon = p.icon;
              const isActive = platform === p.id;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setPlatform(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive 
                        ? 'bg-gray-900 text-white shadow-sm' 
                        : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 opacity-80" />
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* 2. TOPBAR */}
        <header className="h-16 bg-white border-b border-gray-200/80 text-gray-800 flex items-center justify-between px-8 shrink-0 shadow-2xs z-20">
          <div className="flex items-center gap-6 text-xs font-medium">
            <button 
              onClick={() => setActiveTab('comunidade')} 
              className={`flex items-center gap-2 transition ${
                activeTab === 'comunidade' || activeTab === 'demografia' || activeTab === 'conta' 
                  ? 'text-gray-900 border-b-2 border-gray-900 pb-1 font-bold' 
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <BarChart2 size={15} /> Analytics
            </button>

            <button 
              onClick={() => setActiveTab('inbox')} 
              className={`flex items-center gap-2 transition ${activeTab === 'inbox' ? 'text-gray-900 border-b-2 border-gray-900 pb-1 font-bold' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <Inbox size={15} /> Inbox
            </button>

            <button 
              onClick={() => setActiveTab('planner')} 
              className={`flex items-center gap-2 transition ${activeTab === 'planner' ? 'text-gray-900 border-b-2 border-gray-900 pb-1 font-bold' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <CalendarDays size={15} /> Programar Post
            </button>
            
            <button onClick={() => setIsCatalogOpen(true)} className="flex items-center gap-2 text-pink-600 hover:text-pink-700 ml-2 font-semibold transition">
              <FolderPlus size={15} /> Catálogo de Imóveis
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => alert('A aceder ao painel de subscrição...')} className="bg-gray-900 text-white font-medium text-xs px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-gray-800 transition shadow-2xs">
              Atualizar Plano
            </button>
            
            <div className="flex items-center gap-3 text-xs ml-2 border-l border-gray-200 pl-4">
              <div className="flex items-center gap-2">
                <div className="bg-gray-100 p-1.5 rounded-full"><User size={13} className="text-gray-600" /></div>
                <span className="font-semibold text-gray-800 capitalize">{currentUser.name}</span>
              </div>
              <button 
                onClick={() => setCurrentUser(null)} 
                title="Terminar Sessão"
                className="text-gray-400 hover:text-red-500 transition ml-1 p-1 rounded-lg hover:bg-gray-50"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* 3. CONTEÚDO */}
        <main className="flex-1 overflow-y-auto bg-[#fafbfc] p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {(activeTab === 'comunidade' || activeTab === 'demografia' || activeTab === 'conta') && (
              <div className="flex items-center justify-between border-b border-gray-200/80 pb-4 mb-2">
                <div className="flex gap-6 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <button onClick={() => setActiveTab('comunidade')} className={`pb-4 -mb-4 transition-all ${activeTab === 'comunidade' ? 'text-gray-900 border-b-2 border-gray-900' : 'hover:text-gray-700'}`}>
                    Comunidade
                  </button>
                  <button onClick={() => setActiveTab('demografia')} className={`pb-4 -mb-4 transition-all ${activeTab === 'demografia' ? 'text-gray-900 border-b-2 border-gray-900' : 'hover:text-gray-700'}`}>
                    Demografia
                  </button>
                  <button onClick={() => setActiveTab('conta')} className={`pb-4 -mb-4 transition-all ${activeTab === 'conta' ? 'text-gray-900 border-b-2 border-gray-900' : 'hover:text-gray-700'}`}>
                    Conta
                  </button>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Período principal</span>
                  <div className="flex items-center gap-2 border border-gray-200/80 rounded-xl px-3 py-1 mt-1 text-xs text-gray-700 bg-white shadow-2xs font-medium">
                    <CalendarIcon size={13} className="text-gray-400" />
                    <span>{mockAnalyticsData?.period?.startDate} - {mockAnalyticsData?.period?.endDate}</span>
                  </div>
                </div>
              </div>
            )}

            {/* RENDERIZAÇÃO DAS ABAS */}
            {activeTab === 'comunidade' && (
               <div className="space-y-6 animate-in fade-in duration-300">
                 <GrowthStats />
                 <ContentPerformance content={mockAnalyticsData?.topContent || []} />
               </div>
            )}

            {activeTab === 'demografia' && (
              <div className="animate-in fade-in duration-300">
                <AudienceDemographics data={mockAnalyticsData?.demographics || { ageGroups: [], topCities: [], gender: { female: 50, male: 50 } }} />
              </div>
            )}

            {activeTab === 'conta' && (
              <div className="animate-in fade-in duration-300">
                <AccountManagement />
              </div>
            )}

            {activeTab === 'inbox' && (
              <MessagesInbox />
            )}

            {activeTab === 'planner' && (
              <PlannerScheduler content={mockAnalyticsData?.topContent || []} />
            )}

          </div>
        </main>
      </div>

      <CatalogModal isOpen={isCatalogOpen} onClose={() => setIsCatalogOpen(false)} />
    </div>
  );
}