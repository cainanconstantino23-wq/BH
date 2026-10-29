import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

const stateCookieName = 'meta_oauth_state';
const graphApiBaseUrl = 'https://graph.facebook.com/v20.0';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redirectToDashboard(request: NextRequest, status: 'connected' | 'error', reason?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const dashboardUrl = new URL('/', baseUrl);
  dashboardUrl.searchParams.set('meta', status);

  if (reason) dashboardUrl.searchParams.set('reason', reason);

  const response = NextResponse.redirect(dashboardUrl);
  response.cookies.set(stateCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/api/auth/meta/callback',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

async function fetchGraphResponse(
  url: URL,
  operation: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: 'no-store' });
  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `${operation} returned invalid JSON (HTTP ${response.status}): ${getErrorMessage(error)}`,
    );
  }

  if (!isRecord(payload)) {
    throw new Error(`${operation} returned an invalid response (HTTP ${response.status}).`);
  }

  if (!response.ok || payload.error) {
    const graphError = isRecord(payload.error) ? payload.error : null;
    const details = graphError
      ? JSON.stringify({
          message: graphError.message,
          type: graphError.type,
          code: graphError.code,
          fbtrace_id: graphError.fbtrace_id,
        })
      : JSON.stringify(payload);
    throw new Error(`${operation} failed (HTTP ${response.status}): ${details}`);
  }

  return payload;
}

export async function GET(request: NextRequest) {
  let operation = 'validating OAuth callback';

  try {
    const returnedState = request.nextUrl.searchParams.get('state');
    const expectedState = request.cookies.get(stateCookieName)?.value;
    const code = request.nextUrl.searchParams.get('code');
    const oauthError = request.nextUrl.searchParams.get('error');

    if (
      !returnedState ||
      !expectedState ||
      returnedState.length !== expectedState.length ||
      !timingSafeEqual(Buffer.from(returnedState), Buffer.from(expectedState))
    ) {
      console.error('Meta OAuth callback rejected because its state did not match.');
      return redirectToDashboard(request, 'error', 'invalid_oauth_state');
    }

    if (oauthError) {
      console.error('Meta OAuth authorization was denied:', {
        error: oauthError,
        description: request.nextUrl.searchParams.get('error_description'),
      });
      return redirectToDashboard(request, 'error', 'authorization_denied');
    }

    if (!code) {
      console.error('Meta OAuth callback did not include an authorization code.');
      return redirectToDashboard(request, 'error', 'missing_authorization_code');
    }

    operation = 'validating Supabase user';
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError && authError.name !== 'AuthSessionMissingError') {
      console.error('Supabase user validation failed during Meta OAuth:', authError);
      return redirectToDashboard(request, 'error', 'user_validation_failed');
    }

    if (!user) {
      console.error('Meta OAuth callback has no authenticated Supabase user.');
      return redirectToDashboard(request, 'error', 'authentication_required');
    }

    const appId = process.env.META_CLIENT_ID;
    const appSecret = process.env.META_CLIENT_SECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    if (!appId || !appSecret) {
      throw new Error('Meta OAuth client credentials are not configured.');
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase admin credentials are not configured.');
    }

    const redirectUri = new URL('/api/auth/meta/callback', baseUrl).toString();

    operation = 'exchanging authorization code for a short-lived access token';
    const shortTokenUrl = new URL(`${graphApiBaseUrl}/oauth/access_token`);
    shortTokenUrl.searchParams.set('client_id', appId);
    shortTokenUrl.searchParams.set('redirect_uri', redirectUri);
    shortTokenUrl.searchParams.set('client_secret', appSecret);
    shortTokenUrl.searchParams.set('code', code);

    const shortTokenData = await fetchGraphResponse(shortTokenUrl, operation);
    const shortLivedToken = shortTokenData.access_token;

    if (typeof shortLivedToken !== 'string' || !shortLivedToken) {
      throw new Error('Meta did not return a short-lived access token.');
    }

    operation = 'exchanging the short-lived token for a long-lived access token';
    const longTokenUrl = new URL(`${graphApiBaseUrl}/oauth/access_token`);
    longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longTokenUrl.searchParams.set('client_id', appId);
    longTokenUrl.searchParams.set('client_secret', appSecret);
    longTokenUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longTokenData = await fetchGraphResponse(longTokenUrl, operation);
    const longLivedToken = longTokenData.access_token;

    if (typeof longLivedToken !== 'string' || !longLivedToken) {
      throw new Error('Meta did not return a long-lived access token.');
    }

    operation = 'fetching the first Meta Ads account';
    const adAccountsUrl = new URL(`${graphApiBaseUrl}/me/adaccounts`);
    adAccountsUrl.searchParams.set('fields', 'name,account_id');
    adAccountsUrl.searchParams.set('access_token', longLivedToken);
    const adAccountsData = await fetchGraphResponse(adAccountsUrl, operation);
    const accounts = adAccountsData.data;
    const firstAccount = Array.isArray(accounts) ? accounts[0] : null;

    if (!isRecord(firstAccount)) {
      throw new Error('The authorized Meta user has no accessible ad accounts.');
    }

    const adAccountId =
      typeof firstAccount.account_id === 'string' || typeof firstAccount.account_id === 'number'
        ? String(firstAccount.account_id)
        : typeof firstAccount.id === 'string'
          ? firstAccount.id
          : null;

    if (!adAccountId) {
      throw new Error('Meta returned an ad account without an account ID.');
    }

    // --- NOVA ETAPA: Buscar a conta do Instagram Business conectada ---
    operation = 'fetching the connected Instagram Business account';
    let instagramAccountId: string | null = null;
    try {
      const pagesUrl = new URL(`${graphApiBaseUrl}/me/accounts`);
      pagesUrl.searchParams.set('fields', 'name,instagram_business_account');
      pagesUrl.searchParams.set('access_token', longLivedToken);
      const pagesData = await fetchGraphResponse(pagesUrl, operation);
      const pagesList = Array.isArray(pagesData.data) ? pagesData.data : [];

      for (const page of pagesList) {
        if (isRecord(page) && isRecord(page.instagram_business_account) && typeof page.instagram_business_account.id === 'string') {
          instagramAccountId = page.instagram_business_account.id;
          break;
        }
      }
    } catch (igError) {
      console.warn('Could not fetch connected Instagram account:', igError);
    }

    operation = 'saving the Meta configuration in Supabase';
    const adminClient = createAdminClient();
    const { error: databaseError } = await adminClient
      .from('user_meta_config')
      .upsert(
        {
          user_id: user.id,
          access_token: longLivedToken,
          ad_account_id: adAccountId,
          instagram_account_id: instagramAccountId,
        },
        { onConflict: 'user_id' },
      );

    if (databaseError) {
      console.error('Supabase failed to save the Meta configuration:', {
        code: databaseError.code,
        message: databaseError.message,
        details: databaseError.details,
        hint: databaseError.hint,
        userId: user.id,
      });
      return redirectToDashboard(request, 'error', 'configuration_save_failed');
    }

    return redirectToDashboard(request, 'connected');
  } catch (error) {
    console.error(`Meta OAuth failed while ${operation}:`, error);
    return redirectToDashboard(request, 'error', 'oauth_flow_failed');
  }
}