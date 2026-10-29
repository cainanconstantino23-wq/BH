import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { redirect } from 'next/navigation';
import { ConnectMetaButton } from '@/components/ConnectMetaButton';

interface MetaInsights {
  spend: string;
  impressions: string;
  clicks: string;
  cpc: string;
  ctr: string;
  reach: string;
}

async function getClientMetaInsights(userId: string): Promise<MetaInsights | null> {
  const supabase = createAdminClient();

  // 1. Procura as credenciais do Meta ligadas ao utilizador autenticado
  const { data: config } = await supabase
    .from('user_meta_config')
    .select('ad_account_id, access_token')
    .eq('user_id', userId)
    .single();

  if (!config?.access_token || !config?.ad_account_id) {
    return null;
  }

  try {
    // 2. Consulta as estatísticas em tempo real na API do Meta
    const adAccountId = config.ad_account_id.startsWith('act_')
      ? config.ad_account_id
      : `act_${config.ad_account_id}`;
    const url = new URL(`https://graph.facebook.com/v20.0/${encodeURIComponent(adAccountId)}/insights`);
    url.searchParams.set('fields', 'spend,impressions,clicks,cpc,ctr,reach');
    url.searchParams.set('date_preset', 'last_30d');
    url.searchParams.set('access_token', config.access_token);

    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    return data.data?.[0] || null;
  } catch (error) {
    console.error('Erro ao consultar a API do Meta:', error);
    return null;
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const stats = await getClientMetaInsights(user.id);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        {/* Cabeçalho do Dashboard */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Dashboard & Performance</h1>
            <p className="mt-1 text-sm text-slate-500">Métricas de anúncios em tempo real dos últimos 30 dias</p>
          </div>
          {!stats && <ConnectMetaButton />}
        </header>

        {/* Bloco das Métricas do Meta Ads */}
        {stats ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Investimento Total</p>
              <p className="mt-3 text-3xl font-black text-slate-900">
                R$ {parseFloat(stats.spend || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Impressões</p>
              <p className="mt-3 text-3xl font-black text-slate-900">
                {parseInt(stats.impressions || '0').toLocaleString('pt-BR')}
              </p>
              <p className="mt-1 text-xs text-slate-500">Alcance único: {parseInt(stats.reach || '0').toLocaleString('pt-BR')}</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cliques nos Anúncios</p>
              <p className="mt-3 text-3xl font-black text-slate-900">
                {parseInt(stats.clicks || '0').toLocaleString('pt-BR')}
              </p>
              <p className="mt-1 text-xs text-slate-500">CTR: {parseFloat(stats.ctr || '0').toFixed(2)}%</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CPC Médio</p>
              <p className="mt-3 text-3xl font-black text-slate-900">
                R$ {parseFloat(stats.cpc || '0').toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <h3 className="text-lg font-medium text-slate-900">Nenhuma conta do Meta Ads ligada</h3>
            <p className="mt-1 mb-6 text-sm text-slate-500">
              Conecte a conta do Meta para visualizar as métricas de anúncios dos seus clientes aqui.
            </p>
            <ConnectMetaButton />
          </div>
        )}
      </div>
    </div>
  );
}