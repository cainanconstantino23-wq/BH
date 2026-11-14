import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { GOOGLE_CALLBACK_PATH, GOOGLE_STATE_COOKIE, exchangeGoogleCode, getGoogleEmail } from '@/lib/google/drive';

// Retorno do login do Google: valida o state, troca o código pelos tokens e guarda em google_drive_connections.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const finish = (status: 'connected' | 'error', reason?: string) => {
    const url = new URL('/', origin);
    url.searchParams.set('drive', status);
    if (reason) url.searchParams.set('reason', reason);
    const response = NextResponse.redirect(url);
    response.cookies.set(GOOGLE_STATE_COOKIE, '', { path: GOOGLE_CALLBACK_PATH, maxAge: 0 });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const returnedState = params.get('state') ?? '';
  const expectedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? '';
  if (
    !returnedState ||
    returnedState.length !== expectedState.length ||
    !timingSafeEqual(Buffer.from(returnedState), Buffer.from(expectedState))
  ) {
    return finish('error', 'invalid_state');
  }
  if (params.get('error')) return finish('error', 'authorization_denied');

  const code = params.get('code');
  if (!code) return finish('error', 'missing_code');

  const member = await getActiveMember();
  if (!member) return finish('error', 'authentication_required');
  if (!member.can('conectar_instagram')) return finish('error', 'admin_only');

  try {
    const token = await exchangeGoogleCode(code, new URL(GOOGLE_CALLBACK_PATH, origin).toString());
    if (!token.scope?.includes('drive')) return finish('error', 'missing_scope');
    if (!token.refresh_token) return finish('error', 'missing_refresh_token');

    const { error } = await createAdminClient()
      .from('google_drive_connections')
      .upsert(
        {
          user_id: member.user.id,
          google_email: await getGoogleEmail(token.access_token),
          refresh_token: token.refresh_token,
          access_token: token.access_token,
          access_token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
          scopes: token.scope ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) {
      console.error('Falha ao salvar a conexão do Drive:', error.message);
      return finish('error', 'save_failed');
    }
    return finish('connected');
  } catch (error) {
    console.error('Falha ao conectar o Google Drive:', error);
    // ex.: "Google token: invalid_client Unauthorized" → mostra o código do Google para achar a causa
    const code = String(error).match(/Google token: ([a-z_]+)/)?.[1];
    return finish('error', code ? `exchange_failed_${code}` : 'exchange_failed');
  }
}
