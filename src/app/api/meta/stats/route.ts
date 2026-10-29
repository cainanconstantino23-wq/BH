import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

const emptyStats = {
  spend: '0',
  impressions: '0',
  clicks: '0',
  cpc: '0',
  ctr: '0',
  reach: '0',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError && authError.name !== 'AuthSessionMissingError') {
      console.error('Supabase user validation failed for Meta stats:', authError);
      return NextResponse.json(
        { stats: null, error: 'user_validation_failed' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    if (!user) {
      return NextResponse.json(
        { stats: null, error: 'authentication_required' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const adminClient = createAdminClient();
    const { data: config, error: databaseError } = await adminClient
      .from('user_meta_config')
      .select('access_token, ad_account_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (databaseError) {
      console.error('Supabase failed to load Meta stats configuration:', {
        code: databaseError.code,
        message: databaseError.message,
        details: databaseError.details,
        hint: databaseError.hint,
        userId: user.id,
      });
      return NextResponse.json(
        { stats: null, error: 'configuration_lookup_failed' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    if (!config?.access_token || !config.ad_account_id) {
      return NextResponse.json(
        { stats: null },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const adAccountId = config.ad_account_id.startsWith('act_')
      ? config.ad_account_id
      : `act_${config.ad_account_id}`;
    const graphUrl = new URL(`https://graph.facebook.com/v20.0/${encodeURIComponent(adAccountId)}/insights`);
    graphUrl.searchParams.set('fields', 'spend,impressions,clicks,cpc,ctr,reach');
    graphUrl.searchParams.set('date_preset', 'last_30d');
    graphUrl.searchParams.set('access_token', config.access_token);

    const graphResponse = await fetch(graphUrl, { cache: 'no-store' });
    let graphData: unknown;

    try {
      graphData = await graphResponse.json();
    } catch (error) {
      console.error('Meta Graph API returned invalid JSON for ad insights:', {
        status: graphResponse.status,
        message: getErrorMessage(error),
        userId: user.id,
      });
      return NextResponse.json(
        { stats: null, error: 'meta_api_invalid_response' },
        { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    if (
      !graphResponse.ok ||
      !isRecord(graphData) ||
      graphData.error
    ) {
      const metaError = isRecord(graphData) && isRecord(graphData.error)
        ? graphData.error
        : null;
      console.error('Meta Graph API failed to load ad insights:', {
        status: graphResponse.status,
        error: metaError
          ? {
              message: metaError.message,
              type: metaError.type,
              code: metaError.code,
              fbtrace_id: metaError.fbtrace_id,
            }
          : graphData,
        userId: user.id,
      });
      return NextResponse.json(
        { stats: null, error: 'meta_api_request_failed' },
        { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const insights = graphData.data;
    const firstInsight = Array.isArray(insights) && isRecord(insights[0])
      ? insights[0]
      : emptyStats;

    return NextResponse.json(
      { stats: firstInsight },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Meta stats request failed:', error);
    return NextResponse.json(
      { stats: null, error: 'meta_stats_unavailable' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
