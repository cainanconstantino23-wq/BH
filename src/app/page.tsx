'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { mockAnalyticsData } from '@/data/mockAnalytics';
import type { SocialPlatform } from '@/types/analytics';
import { ContentPerformance } from '@/components/analytics/ContentPerformance';
import { GrowthStats } from '@/components/analytics/GrowthStats';
import { InstagramDashboard } from '@/components/analytics/InstagramDashboard';
import { supabase } from '@/lib/supabase';
import { TeamProvider, toSession, type TeamMember } from '@/lib/team';
import { AccountMenu, type AccountPage } from '@/components/team/AccountMenu';
import { NotificationBell } from '@/components/team/NotificationBell';
import { HomeHub, type HubTarget } from '@/components/home/HomeHub';
import { HistoryPanel, MyAccountPanel, PeoplePanel } from '@/components/team/TeamPanel';
import { CoverApprovalPanel } from '@/components/drive/CoverApprovalPanel';
import {
  BarChart2,
  Inbox,
  FolderPlus,
  LogOut,
  UserPlus,
  ShieldBan,
  Clock3,
  CalendarDays,
  CheckCircle2,
  Menu,
  X,
  MapPin,
  Users,
  Star,
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

interface DashboardUser {
  name: string;
  email: string;
}

type InstagramStatus = { connected: false; canConnect: boolean } | { connected: true; username: string; canConnect: boolean };

const instagramErrorMessages: Record<string, string> = {
  requires_production: 'A conexão com o Instagram só funciona no endereço publicado (bh-analytics-murex.vercel.app), não no localhost.',
  authorization_denied: 'A autorização foi cancelada no Facebook. Tente de novo e confirme o acesso à conta do Instagram.',
  no_instagram_account: 'Nenhuma conta do Instagram foi selecionada no login. Tente de novo e marque a conta da Daime Filmes.',
  invalid_state: 'O login expirou ou foi aberto em outra aba. Clique em Conectar Instagram de novo.',
  authentication_required: 'Sua sessão expirou durante a conexão. Entre de novo e repita.',
  admin_only: 'Você não tem permissão para conectar o Instagram da empresa. Peça a quem administra a equipe.',
};

type DashboardTab = 'comunidade' | 'demografia' | 'inbox' | 'approval' | 'planner' | 'capa' | AccountPage;

const driveErrorMessages: Record<string, string> = {
  not_configured: 'Faltam as credenciais do Google no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).',
  admin_only: 'Só um administrador pode conectar o Google Drive.',
  authorization_denied: 'A conexão foi cancelada no Google.',
  missing_scope: 'Marque a permissão de ver os arquivos do Google Drive na tela do Google e tente de novo.',
  missing_refresh_token: 'O Google não liberou o acesso contínuo. Tente conectar de novo.',
};

const sectionEntranceClass = 'section-enter';

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
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<DashboardUser | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('comunidade');
  const [instagramStatus, setInstagramStatus] = useState<InstagramStatus | null>(null);
  const [instagramNotice, setInstagramNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [driveNotice, setDriveNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isSupabaseAuthenticated, setIsSupabaseAuthenticated] = useState(false);
  const [isRestoringUser, setIsRestoringUser] = useState(true);
  const [membership, setMembership] = useState<TeamMember | null | undefined>(undefined);
  const [pendingCount, setPendingCount] = useState(0);
  // Tela inicial (dock) logo após o login; o logo do painel volta para ela.
  const [showHub, setShowHub] = useState(true);
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let isActive = true;
    const url = new URL(window.location.href);
    let hasAuthenticatedUser = false;

    const restoreUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error && error.name !== 'AuthSessionMissingError') {
          console.error('Não foi possível restaurar a sessão Supabase:', error);
        }

        if (!isActive) return;

        if (user) {
          hasAuthenticatedUser = true;
          const fullName = user.user_metadata?.full_name;
          const displayName = typeof fullName === 'string'
            ? fullName
            : user.email?.split('@')[0] || 'Usuário';
          setCurrentUser({ name: displayName, email: user.email ?? '' });
          setIsSupabaseAuthenticated(true);
          const { data: member } = await supabase
            .from('team_members')
            .select('user_id, email, full_name, role, status, permissions, created_at, approved_at')
            .eq('user_id', user.id)
            .maybeSingle();
          if (isActive) setMembership((member as TeamMember | null) ?? null);
        }
      } catch (error) {
        console.error('Falha ao restaurar a sessão Supabase:', error);
      } finally {
        if (isActive) {
          if (!hasAuthenticatedUser) {
            const loginUrl = new URL('/login', window.location.origin);
            for (const key of ['meta', 'error', 'reason']) {
              const value = url.searchParams.get(key);
              if (value) loginUrl.searchParams.set(key, value);
            }
            router.replace(`${loginUrl.pathname}${loginUrl.search}`);
          } else {
            const instagramResult = url.searchParams.get('instagram');
            if (instagramResult === 'connected') {
              setInstagramNotice({ tone: 'success', text: 'Instagram conectado.' });
            } else if (instagramResult === 'error') {
              const reason = url.searchParams.get('reason') ?? '';
              setInstagramNotice({
                tone: 'error',
                text: instagramErrorMessages[reason] ?? 'Não foi possível conectar o Instagram. Tente de novo em alguns minutos.',
              });
            }
            const driveResult = url.searchParams.get('drive');
            if (driveResult) {
              setActiveTab('capa');
              setShowHub(false);
              setDriveNotice(
                driveResult === 'connected'
                  ? { tone: 'success', text: 'Google Drive conectado.' }
                  : {
                      tone: 'error',
                      text: driveErrorMessages[url.searchParams.get('reason') ?? ''] ?? 'Não foi possível conectar o Google Drive. Tente de novo.',
                    },
              );
              url.searchParams.delete('drive');
            }
            url.searchParams.delete('instagram');
            url.searchParams.delete('meta');
            url.searchParams.delete('error');
            url.searchParams.delete('reason');
            if (url.hash === '#_=_') url.hash = '';

            if (
              url.pathname !== window.location.pathname ||
              url.search !== window.location.search ||
              url.hash !== window.location.hash
            ) {
              window.history.replaceState(
                window.history.state,
                '',
                `${url.pathname}${url.search}${url.hash}`,
              );
            }
          }

          setIsRestoringUser(false);
        }
      }
    };

    void restoreUser();

    return () => {
      isActive = false;
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser || !isSupabaseAuthenticated || membership?.status !== 'ativo') return;

    const controller = new AbortController();
    fetch('/api/instagram/status', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        const result = (await response.json()) as InstagramStatus;
        setInstagramStatus(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Erro ao verificar a conexão do Instagram:', error);
        setInstagramStatus({ connected: false, canConnect: false });
      });

    return () => controller.abort();
  }, [currentUser, isSupabaseAuthenticated, membership?.status]);

  // Cadastros aguardando aprovação (para quem gerencia pessoas), ao vivo.
  const canManagePeople = membership?.status === 'ativo' && (membership.permissions ?? []).includes('gerenciar_pessoas');
  useEffect(() => {
    if (!canManagePeople) return;
    const load = async () => {
      const { count } = await supabase
        .from('team_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('status', 'pendente');
      setPendingCount(count ?? 0);
    };
    void load();
    const channel = supabase
      .channel('pending-signups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canManagePeople]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Não foi possível encerrar a sessão Supabase:', error);
      return;
    }
    setIsSupabaseAuthenticated(false);
    setCurrentUser(null);
    router.replace('/login');
  };

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
    if (isRestoringUser) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-sm text-ink-muted">
          <p role="status">Validando sessão…</p>
        </main>
      );
    }

    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-sm text-ink-muted">
        <p role="status">Redirecionando para o login…</p>
      </main>
    );
  }

  if (membership === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-sm text-ink-muted">
        <p role="status">Verificando seu acesso…</p>
      </main>
    );
  }

  if (!membership || membership.status !== 'ativo') {
    const blocked = membership?.status === 'bloqueado';
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-10 font-sans text-ink">
        <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6 sm:p-8">
          <Image src="/bahia-homes-logo.png" alt="Bahia Homes" width={1834} height={276} className="h-auto w-32" priority />
          <span
            aria-hidden="true"
            className={`mt-8 flex h-11 w-11 items-center justify-center rounded-full ${
              blocked ? 'bg-status-danger-soft text-status-danger' : 'bg-status-warning-soft text-status-warning'
            }`}
          >
            {blocked ? <ShieldBan size={20} /> : <Clock3 size={20} />}
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {blocked ? 'Seu acesso está bloqueado' : 'Cadastro recebido, aguardando aprovação'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {blocked
              ? 'Um administrador da Bahia Homes bloqueou ou recusou este acesso. Se for um engano, fale com a equipe.'
              : 'Um administrador da Bahia Homes precisa aprovar o seu acesso e definir o que você pode fazer. Assim que for aprovado, é só entrar de novo.'}
          </p>
          <p className="mt-4 rounded-control bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            Conta: <span className="font-medium text-ink">{currentUser.email}</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {!blocked && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover"
              >
                <UserPlus size={15} aria-hidden="true" /> Verificar de novo
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-4 text-xs font-semibold text-ink hover:bg-surface-muted"
            >
              <LogOut size={15} aria-hidden="true" /> Sair
            </button>
          </div>
        </div>
      </main>
    );
  }

  const team = toSession(membership);

  if (showHub) {
    const openFromHub = (target: HubTarget) => {
      setShowHub(false);
      if (target === 'feed') setIsCatalogOpen(true);
      else setActiveTab(target === 'analytics' ? 'comunidade' : target);
    };
    return (
      <TeamProvider value={team}>
        <HomeHub
          firstName={(membership.full_name || currentUser.name).trim().split(/\s+/)[0]}
          canSeeAnalytics={team.can('ver_estatisticas')}
          onOpen={openFromHub}
          onSkip={() => setShowHub(false)}
          onSignOut={() => void signOut()}
        />
      </TeamProvider>
    );
  }

  return (
    <TeamProvider value={team}>
    <div className="press-feedback flex h-dvh min-h-0 overflow-hidden overscroll-none bg-canvas font-sans text-ink antialiased">
      <aside className="z-10 hidden w-64 shrink-0 flex-col border-r border-border bg-surface xl:flex">
        <div className="flex h-16 items-center border-b border-border px-6">
          <button
            type="button"
            onClick={() => setShowHub(true)}
            aria-label="Voltar ao início"
            className="flex min-h-11 items-center gap-2.5 rounded-xl text-sm font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
          >
            <Image
              src="/bahia-homes-logo.png"
              alt=""
              width={1834}
              height={276}
              className="h-auto w-28"
            />
            <span className="font-normal text-ink-muted">Analytics</span>
          </button>
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
                    const isActive = item.tab === activeTab || (item.tab === 'comunidade' && activeTab === 'demografia');

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
                  <li>
                    <button
                      type="button"
                      aria-current={activeTab === 'capa' ? 'page' : undefined}
                      onClick={() => {
                        setActiveTab('capa');
                        closeMobileMenu();
                      }}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out ${
                        activeTab === 'capa' ? 'bg-brand-plum text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-brand-plum'
                      }`}
                    >
                      <Star size={16} />
                      Aprovação de capa
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
            <button
              type="button"
              onClick={() => setShowHub(true)}
              aria-label="Voltar ao início"
              className="flex min-h-11 items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
            >
              <Image
                src="/bahia-homes-logo.png"
                alt=""
                width={1834}
                height={276}
                className="h-auto w-28"
              />
            </button>
          </div>

          <nav aria-label="Navegação principal" className="hidden h-full items-center gap-2 text-xs font-medium xl:flex 2xl:gap-3">
            <button 
              onClick={() => setActiveTab('comunidade')} 
              aria-current={['comunidade', 'demografia'].includes(activeTab) ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 transition-[background-color,color,transform] duration-150 ease-out ${
                activeTab === 'comunidade' || activeTab === 'demografia' 
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

            <button
              onClick={() => setActiveTab('capa')}
              aria-current={activeTab === 'capa' ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-3 transition-[background-color,color,transform] duration-150 ease-out ${activeTab === 'capa' ? 'bg-surface-muted font-semibold text-brand-plum' : 'text-ink-muted hover:bg-canvas hover:text-brand-plum'}`}
            >
              <Star size={15} /> Aprovação de capa
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell onOpenTarget={(target) => setActiveTab(target)} />
            <AccountMenu
              pendingCount={pendingCount}
              current={activeTab}
              onNavigate={(page) => setActiveTab(page)}
              onSignOut={() => void signOut()}
            />
          </div>

        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7 xl:px-8">
          <div className="mx-auto max-w-[1600px] space-y-5">
            {pendingCount > 0 && activeTab !== 'equipe' && (
              <div role="status" className="flex flex-col gap-3 rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-status-warning">
                  <UserPlus size={16} aria-hidden="true" />
                  {pendingCount === 1 ? '1 pessoa se cadastrou e aguarda sua aprovação.' : `${pendingCount} pessoas se cadastraram e aguardam sua aprovação.`}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('equipe')}
                  className="min-h-9 shrink-0 rounded-control bg-surface px-3.5 text-xs font-semibold text-ink hover:bg-surface-muted"
                >
                  Revisar cadastros
                </button>
              </div>
            )}

            {(activeTab === 'comunidade' || activeTab === 'demografia') && (
              <>
                <div className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Bahia Homes <span className="px-1 opacity-60">/</span> Instagram</p>
                    <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">
                      {activeTab === 'comunidade' ? 'Desempenho' : 'Audiência'}
                    </h1>
                    <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
                      {activeTab === 'comunidade'
                        ? 'Acompanhe o crescimento e o impacto das publicações.'
                        : 'Conheça o perfil e a distribuição da sua audiência.'}
                    </p>
                  </div>
                </div>

                <div className="flex max-w-full gap-6 overflow-x-auto border-b border-border text-xs font-semibold tracking-wide text-ink-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button type="button" aria-current={activeTab === 'comunidade' ? 'page' : undefined} onClick={() => setActiveTab('comunidade')} className={`min-h-12 shrink-0 border-b-2 px-1 transition-colors duration-150 ease-out ${activeTab === 'comunidade' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}>
                    Comunidade
                  </button>
                  <button type="button" aria-current={activeTab === 'demografia' ? 'page' : undefined} onClick={() => setActiveTab('demografia')} className={`min-h-12 shrink-0 border-b-2 px-1 transition-colors duration-150 ease-out ${activeTab === 'demografia' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}>
                    Demografia
                  </button>
                </div>
              </>
            )}

            {activeTab === 'comunidade' && !team.can('ver_estatisticas') && (
              <p className="rounded-control border border-border bg-surface px-4 py-5 text-sm text-ink-muted">
                Você não tem permissão para ver as estatísticas. Fale com quem administra a equipe.
              </p>
            )}

            {activeTab === 'comunidade' && team.can('ver_estatisticas') && (
               <div key="community" className={`space-y-4 ${sectionEntranceClass}`}>

                 {instagramNotice && (
                   <p
                     role={instagramNotice.tone === 'error' ? 'alert' : 'status'}
                     className={`rounded-control border px-4 py-3 text-xs ${
                       instagramNotice.tone === 'error'
                         ? 'border-status-danger-border bg-status-danger-soft text-status-danger'
                         : 'border-status-success-border bg-status-success-soft text-status-success'
                     }`}
                   >
                     {instagramNotice.text}
                   </p>
                 )}

                 {instagramStatus === null ? (
                   <div role="status" className="rounded-control border border-border bg-surface p-5 text-sm text-ink-muted">
                     Verificando a conexão com o Instagram…
                   </div>
                 ) : instagramStatus.connected ? (
                   <InstagramDashboard />
                 ) : (
                   <section aria-label="Conectar Instagram" className="flex flex-col items-start justify-between gap-4 rounded-control border border-dashed border-border bg-surface p-5 sm:flex-row sm:items-center">
                     <div>
                       <h3 className="text-sm font-semibold text-ink">Conectar Instagram</h3>
                       <p className="mt-0.5 text-xs text-ink-muted">
                         Autorize o acesso à conta para ver curtidas, compartilhamentos, alcance e o desempenho de cada post.
                       </p>
                     </div>
                     {instagramStatus.canConnect ? (
                       <a
                         href="/api/auth/instagram/login"
                         className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                       >
                         <InstagramIcon className="h-4 w-4" />
                         Conectar Instagram
                       </a>
                     ) : (
                       <p className="text-xs text-ink-muted">Peça a quem administra a equipe para conectar.</p>
                     )}
                   </section>
                 )}

                 {instagramStatus?.connected === false && (
                   <>
                     <p className="text-xs text-ink-muted">Exemplo ilustrativo. Conecte o Instagram para ver os números reais da conta.</p>
                     {mockAnalyticsData.period && <GrowthStats period={mockAnalyticsData.period} />}

                     <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
                       <ContentPerformance />
                       <AudienceSnapshot />
                     </div>
                   </>
                 )}
               </div>
            )}

            {activeTab === 'demografia' && (
              <div key="demographics" className={sectionEntranceClass}>
                <AudienceDemographics data={mockAnalyticsData?.demographics || { ageGroups: [], topCities: [], gender: { female: 50, male: 50 } }} />
              </div>
            )}

            {activeTab === 'minha-conta' && (
              <div key="my-account" className={sectionEntranceClass}>
                <MyAccountPanel />
              </div>
            )}

            {activeTab === 'equipe' && team.can('gerenciar_pessoas') && (
              <div key="team" className={sectionEntranceClass}>
                <PeoplePanel />
              </div>
            )}

            {activeTab === 'historico' && team.can('ver_historico') && (
              <div key="history" className={sectionEntranceClass}>
                <HistoryPanel />
              </div>
            )}

            {activeTab === 'conexoes' && (
              <div key="connections" className={`space-y-5 ${sectionEntranceClass}`}>
                <div className="border-b border-border pb-5">
                  <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-[1.75rem]">Conexões</h1>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">Os canais conectados ao BH Analytics. A conexão vale para toda a equipe.</p>
                </div>
                <section className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-platform-instagram">
                      <InstagramIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-ink">Instagram</h2>
                      <p className="text-xs text-ink-muted">
                        {instagramStatus === null
                          ? 'Verificando…'
                          : instagramStatus.connected
                            ? `Conectado: @${instagramStatus.username}. A conexão não expira e as métricas atualizam todo dia.`
                            : 'Não conectado.'}
                      </p>
                    </div>
                  </div>
                  {instagramStatus?.canConnect && (
                    <a
                      href="/api/auth/instagram/login"
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-control border border-border px-4 text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      {instagramStatus.connected ? 'Conectar outra conta' : 'Conectar Instagram'}
                    </a>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'inbox' && (
              <div key="inbox" className={`min-w-0 ${sectionEntranceClass}`}>
                <MessagesInbox />
              </div>
            )}

            {activeTab === 'capa' && (
              <div key="cover-approval" className={sectionEntranceClass}>
                <CoverApprovalPanel notice={driveNotice} />
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
    </TeamProvider>
  );
}