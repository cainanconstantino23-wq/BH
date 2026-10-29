'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRef, useState, type ComponentType } from 'react';
import { mockAnalyticsData } from '@/data/mockAnalytics';
import type { SocialPlatform } from '@/types/analytics';
import { ContentPerformance } from '@/components/analytics/ContentPerformance';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { GrowthStats } from '@/components/analytics/GrowthStats';
import {
  BarChart2,
  Inbox,
  Calendar as CalendarIcon,
  FolderPlus,
  User,
  LogOut,
  CalendarDays,
  CheckCircle2,
  Menu,
  X,
  MapPin,
  Users,
} from 'lucide-react';

const SectionLoading = () => (
  <div role="status" className="rounded-panel border border-border bg-surface p-8 text-center text-sm text-ink-muted">
    Carregando seção…
  </div>
);

const AudienceDemographics = dynamic(
  () => import('@/components/analytics/AudienceDemographics').then((module) => module.AudienceDemographics),
  { loading: SectionLoading },
);
const AccountManagement = dynamic(
  () => import('@/components/analytics/AccountManagement').then((module) => module.AccountManagement),
  { loading: SectionLoading },
);
const CatalogModal = dynamic(
  () => import('@/components/analytics/CatalogModal').then((module) => module.CatalogModal),
  { loading: SectionLoading },
);
const MessagesInbox = dynamic(
  () => import('@/components/analytics/MessagesInbox').then((module) => module.MessagesInbox),
  { loading: SectionLoading },
);
const PlannerScheduler = dynamic(
  () => import('@/components/analytics/PlannerScheduler').then((module) => module.PlannerScheduler),
  { loading: SectionLoading },
);
const ApprovalSectionOrange = dynamic(() => import('@/components/ApprovalSectionOrange'), {
  loading: SectionLoading,
});

const InstagramIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z" />
  </svg>
);
const FacebookIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);
const YoutubeIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93 0.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);
const LinkedinIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);

interface DemoUser {
  name: string;
  email: string;
}

type DashboardTab = 'comunidade' | 'demografia' | 'conta' | 'inbox' | 'approval' | 'planner';

const sectionEntranceClass = 'section-enter';

const overviewMetrics = [
  { label: 'Seguidores', value: '1.250', context: 'base atual' },
  { label: 'Seguidores diários', value: '3,5', context: 'média do período' },
  { label: 'Seguidores por publicação', value: '12', context: 'média' },
  { label: 'Conteúdo total', value: '84', context: 'publicações' },
];

function AudienceSnapshot() {
  const demographics = mockAnalyticsData.demographics;
  const leadingAgeGroup = demographics?.ageGroups.reduce(
    (leading, group) => (group.percentage > leading.percentage ? group : leading),
    demographics.ageGroups[0],
  );
  const topCities = (demographics?.topCities ?? demographics?.cities ?? []).slice(0, 3);

  if (!demographics) return null;

  return (
    <section className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Perfil da audiência</h2>
          <p className="mt-1 text-xs text-ink-muted">Uma leitura rápida do público</p>
        </div>
        <Users aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-brand-plum" />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between gap-3 text-xs">
          <span className="font-medium text-ink">Feminino</span>
          <span className="tabular-nums text-ink-muted">{demographics.gender.female}%</span>
        </div>
        <div
          className="flex h-2 overflow-hidden rounded-full bg-canvas"
          role="img"
          aria-label={`Audiência: ${demographics.gender.female}% feminino e ${demographics.gender.male}% masculino`}
        >
          <span className="h-full bg-brand-plum" style={{ width: `${demographics.gender.female}%` }} />
          <span className="h-full bg-brand-lime" style={{ width: `${demographics.gender.male}%` }} />
        </div>
        <div className="flex justify-between gap-3 text-[11px] text-ink-muted">
          <span>Feminino</span>
          <span>Masculino {demographics.gender.male}%</span>
        </div>
      </div>

      {leadingAgeGroup && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Faixa etária principal</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink">{leadingAgeGroup.range} anos</span>
            <span className="text-sm font-semibold tabular-nums text-brand-plum">{leadingAgeGroup.percentage}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
            <span
              className="block h-full rounded-full bg-brand-plum"
              style={{ width: `${leadingAgeGroup.percentage}%` }}
            />
          </div>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          <MapPin aria-hidden="true" size={12} />
          Principais cidades
        </p>
        <ul className="space-y-2">
          {topCities.map((city) => (
            <li key={city.name ?? city.city} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-ink">{city.name ?? city.city}</span>
              <span className="shrink-0 tabular-nums text-ink-muted">{city.percentage}%</span>
            </li>
          ))}
        </ul>
      </div>

    </section>
  );
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('comunidade');
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

  const openMobileMenu = () => {
    mobileMenuRef.current?.showModal();
    setIsMobileMenuOpen(true);
  };

  const closeMobileMenu = () => {
    mobileMenuRef.current?.close();
    setIsMobileMenuOpen(false);
  };

  const platforms: { id: SocialPlatform; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { id: 'instagram', label: 'Instagram', icon: InstagramIcon },
    { id: 'facebook', label: 'Facebook', icon: FacebookIcon },
    { id: 'youtube', label: 'YouTube', icon: YoutubeIcon },
    { id: 'linkedin', label: 'LinkedIn', icon: LinkedinIcon },
  ];

  if (!currentUser) {
    return <AuthScreen onEnterDemo={setCurrentUser} />;
  }

  return (
    <div className="press-feedback flex h-dvh min-h-0 overflow-hidden overscroll-none bg-canvas font-sans text-ink antialiased">
      <aside className="z-10 hidden w-64 shrink-0 flex-col border-r border-border bg-surface xl:flex">
        <div className="flex h-16 items-center border-b border-border px-6">
          <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink">
            <Image
              src="/bahia-homes-logo.png"
              alt="Bahia Homes"
              width={1834}
              height={276}
              className="h-auto w-28"
            />
            <span className="font-normal text-ink-muted">Analytics</span>
          </span>
        </div>
        <nav className="flex-1 space-y-8 px-3 py-7">
          <div>
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Plataformas</p>
          <ul className="space-y-1">
            {platforms.map((p) => {
              const Icon = p.icon;
              const isActive = platform === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setPlatform(p.id)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-semibold transition-[background-color,color,transform] duration-150 ease-out ${
                      isActive 
                        ? 'bg-brand-plum text-white'
                        : 'text-ink-muted hover:bg-surface-muted hover:text-brand-plum'
                    }`}
                  >
                    <Icon className="h-4 w-4 opacity-80" />
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
        </nav>
      </aside>

      <dialog
        ref={mobileMenuRef}
        id="mobile-navigation-dialog"
        aria-labelledby="mobile-menu-title"
        className="mobile-nav-drawer fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none translate-x-0 scale-100 bg-transparent p-0 opacity-100 transition-[opacity,transform,display,overlay] duration-200 ease-drawer [transition-behavior:allow-discrete] starting:open:-translate-x-3 starting:open:opacity-0 starting:open:scale-[0.98] backdrop:bg-brand-plum/35 xl:hidden"
        onCancel={(event) => {
          event.preventDefault();
          closeMobileMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeMobileMenu();
          }
        }}
        onClose={() => setIsMobileMenuOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMobileMenu();
        }}
      >
          <aside className="flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5 pt-[env(safe-area-inset-top)]">
              <span id="mobile-menu-title" className="flex items-center gap-2.5 text-sm font-bold tracking-tight text-ink">
                <Image
                  src="/bahia-homes-logo.png"
                  alt="Bahia Homes"
                  width={1834}
                  height={276}
                  className="h-auto w-32"
                />
                <span className="font-normal text-ink-muted">Analytics</span>
              </span>
              <button
                type="button"
                aria-label="Fechar menu de navegação"
                onClick={closeMobileMenu}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="space-y-8 p-4">
              <div>
                <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Plataformas</p>
                <ul className="space-y-1">
                  {platforms.map((item) => {
                    const Icon = item.icon;
                    const isActive = platform === item.id;

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => {
                            setPlatform(item.id);
                            closeMobileMenu();
                          }}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out ${
                            isActive ? 'bg-brand-plum text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-brand-plum'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Workspace</p>
                <ul className="space-y-1">
                  {[
                    { label: 'Analytics', icon: BarChart2, tab: 'comunidade' as const },
                    { label: 'Inbox', icon: Inbox, tab: 'inbox' as const },
                    { label: 'Aprovação', icon: CheckCircle2, tab: 'approval' as const },
                    { label: 'Programar Post', icon: CalendarDays, tab: 'planner' as const },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = item.tab === activeTab || (
                      item.tab === 'comunidade' &&
                      ['demografia', 'conta'].includes(activeTab)
                    );

                    return (
                      <li key={item.tab}>
                        <button
                          type="button"
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            setActiveTab(item.tab);
                            closeMobileMenu();
                          }}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out ${
                            isActive ? 'bg-brand-plum text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-brand-plum'
                          }`}
                        >
                          <Icon size={16} />
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCatalogOpen(true);
                        closeMobileMenu();
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-muted hover:text-brand-plum"
                    >
                      <FolderPlus size={16} />
                      Grade do feed
                    </button>
                  </li>
                </ul>
              </div>
            </nav>
          </aside>
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)] text-ink sm:px-6 xl:h-16 xl:flex-nowrap xl:px-8">
          <div className="flex min-w-0 items-center gap-3 xl:hidden">
            <button
              type="button"
              aria-label="Abrir menu"
              aria-expanded={isMobileMenuOpen}
              aria-haspopup="dialog"
              aria-controls="mobile-navigation-dialog"
              onClick={openMobileMenu}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
            >
              <Menu size={20} />
            </button>
            <Image
              src="/bahia-homes-logo.png"
              alt="Bahia Homes"
              width={1834}
              height={276}
              className="h-auto w-28"
            />
          </div>

          <nav aria-label="Navegação principal" className="hidden h-full items-center gap-2 text-xs font-medium xl:flex 2xl:gap-3">
            <button 
              onClick={() => setActiveTab('comunidade')} 
              aria-current={['comunidade', 'demografia', 'conta'].includes(activeTab) ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 transition-[background-color,color,transform] duration-150 ease-out ${
                activeTab === 'comunidade' || activeTab === 'demografia' || activeTab === 'conta' 
                  ? 'bg-surface-muted font-semibold text-brand-plum'
                  : 'text-ink-muted hover:bg-canvas hover:text-brand-plum'
              }`}
            >
              <BarChart2 size={15} /> Analytics
            </button>

            <button 
              onClick={() => setActiveTab('inbox')} 
              aria-current={activeTab === 'inbox' ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 transition-[background-color,color,transform] duration-150 ease-out ${activeTab === 'inbox' ? 'bg-surface-muted font-semibold text-brand-plum' : 'text-ink-muted hover:bg-canvas hover:text-brand-plum'}`}
            >
              <Inbox size={15} /> Inbox
            </button>

            {/* Nova aba de Aprovação em Laranja */}
            <button 
              onClick={() => setActiveTab('approval')} 
              aria-current={activeTab === 'approval' ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 transition-[background-color,color,transform] duration-150 ease-out ${activeTab === 'approval' ? 'bg-surface-muted font-semibold text-brand-plum' : 'text-ink-muted hover:bg-canvas hover:text-brand-plum'}`}
            >
              <CheckCircle2 size={15} /> Aprovação
            </button>

            <button 
              onClick={() => setActiveTab('planner')} 
              aria-current={activeTab === 'planner' ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 transition-[background-color,color,transform] duration-150 ease-out ${activeTab === 'planner' ? 'bg-surface-muted font-semibold text-brand-plum' : 'text-ink-muted hover:bg-canvas hover:text-brand-plum'}`}
            >
              <CalendarDays size={15} /> Programar Post
            </button>
            
            <button onClick={() => setIsCatalogOpen(true)} className="ml-1 flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-brand-plum transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-muted hover:text-brand-plum-hover">
              <FolderPlus size={15} /> Grade do feed
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <button onClick={() => alert('A aceder ao painel de subscrição...')} className="hidden min-h-11 items-center gap-2 rounded-xl bg-brand-plum px-4 text-xs font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum sm:flex">
              Atualizar Plano
            </button>
            
            <div className="flex items-center gap-2 border-l border-border pl-3 text-xs sm:ml-2 sm:gap-3 sm:pl-4">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-surface-muted p-1.5"><User size={13} className="text-ink-muted" /></div>
                <span className="hidden font-semibold capitalize text-ink sm:inline">{currentUser.name}</span>
              </div>
              <button 
                onClick={() => setCurrentUser(null)} 
                title="Sair da demonstração"
                aria-label="Sair da demonstração"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-status-danger-soft hover:text-status-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
          
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7 xl:px-8">
          <div className="mx-auto max-w-[1600px] space-y-5">
            <div role="note" className="flex flex-col gap-1 rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-xs leading-relaxed text-status-warning sm:flex-row sm:items-center sm:gap-2">
              <span className="font-semibold">Modo demonstração</span>
              <span>O painel não protege dados. Não use informações reais ou confidenciais.</span>
            </div>
            
            {(activeTab === 'comunidade' || activeTab === 'demografia' || activeTab === 'conta') && (
              <>
                <div className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Bahia Homes <span className="px-1 opacity-60">/</span> Instagram</p>
                    <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">
                      {activeTab === 'comunidade' ? 'Desempenho' : activeTab === 'demografia' ? 'Audiência' : 'Conta'}
                    </h1>
                    <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
                      {activeTab === 'comunidade'
                        ? 'Acompanhe o crescimento e o impacto das publicações.'
                        : activeTab === 'demografia'
                          ? 'Conheça o perfil e a distribuição da sua audiência.'
                          : 'Gerencie os canais conectados à sua operação.'}
                    </p>
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">Período principal</span>
                    <div className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-xs font-medium text-ink">
                      <CalendarIcon size={14} className="text-ink-muted" />
                      <span>
                        {new Intl.DateTimeFormat('pt-BR').format(new Date(`${mockAnalyticsData.period?.startDate}T00:00:00`))}
                        {' – '}
                        {new Intl.DateTimeFormat('pt-BR').format(new Date(`${mockAnalyticsData.period?.endDate}T00:00:00`))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex max-w-full gap-6 overflow-x-auto border-b border-border text-xs font-semibold tracking-wide text-ink-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button type="button" aria-current={activeTab === 'comunidade' ? 'page' : undefined} onClick={() => setActiveTab('comunidade')} className={`min-h-12 shrink-0 border-b-2 px-1 transition-colors duration-150 ease-out ${activeTab === 'comunidade' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}>
                    Comunidade
                  </button>
                  <button type="button" aria-current={activeTab === 'demografia' ? 'page' : undefined} onClick={() => setActiveTab('demografia')} className={`min-h-12 shrink-0 border-b-2 px-1 transition-colors duration-150 ease-out ${activeTab === 'demografia' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}>
                    Demografia
                  </button>
                  <button type="button" aria-current={activeTab === 'conta' ? 'page' : undefined} onClick={() => setActiveTab('conta')} className={`min-h-12 shrink-0 border-b-2 px-1 transition-colors duration-150 ease-out ${activeTab === 'conta' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}>
                    Conta
                  </button>
                </div>
              </>
            )}

            {activeTab === 'comunidade' && (
               <div key="community" className={`space-y-4 ${sectionEntranceClass}`}>
                 <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                   {overviewMetrics.map((metric) => (
                     <div key={metric.label} className="min-w-0 rounded-control border border-border bg-surface px-4 py-3">
                       <p className="line-clamp-2 min-h-7 text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink-muted">{metric.label}</p>
                       <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                         <span className="text-xl font-semibold tracking-tight tabular-nums text-ink sm:text-2xl">{metric.value}</span>
                         <span className="text-[10px] text-ink-muted">{metric.context}</span>
                       </div>
                     </div>
                   ))}
                 </section>

                 {mockAnalyticsData.period && <GrowthStats period={mockAnalyticsData.period} />}

                 <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
                   <ContentPerformance />
                   <AudienceSnapshot />
                 </div>
               </div>
            )}

            {activeTab === 'demografia' && (
              <div key="demographics" className={sectionEntranceClass}>
                <AudienceDemographics data={mockAnalyticsData?.demographics || { ageGroups: [], topCities: [], gender: { female: 50, male: 50 } }} />
              </div>
            )}

            {activeTab === 'conta' && (
              <div key="account" className={sectionEntranceClass}>
                <AccountManagement />
              </div>
            )}

            {activeTab === 'inbox' && (
              <div key="inbox" className={`min-w-0 ${sectionEntranceClass}`}>
                <MessagesInbox />
              </div>
            )}

            {activeTab === 'planner' && (
              <div key="planner" className={`min-w-0 ${sectionEntranceClass}`}>
                <PlannerScheduler />
              </div>
            )}

            {activeTab === 'approval' && (
              <div key="approval" className={sectionEntranceClass}>
                <ApprovalSectionOrange />
              </div>
            )}

          </div>
        </main>
      </div>

      {isCatalogOpen && (
        <div className="modal-backdrop-enter">
          <CatalogModal isOpen onClose={() => setIsCatalogOpen(false)} />
        </div>
      )}
    </div>
  );
}