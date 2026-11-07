import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import {
  GraphError,
  INSTAGRAM_CALLBACK_PATH,
  INSTAGRAM_STATE_COOKIE,
  connectInstagram,
  getMetaAppConfig,
} from '@/lib/meta/graph';

// Retorno do login unificado: valida o state, troca o código pelo token,
// descobre a conta do Instagram e guarda tudo em user_meta_config (só o servidor acessa).
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const finish = (status: 'connected' | 'error', reason?: string) => {
    const url = new URL('/', origin);
    url.searchParams.set('instagram', status);
    if (reason) url.searchParams.set('reason', reason);
    const response = NextResponse.redirect(url);
    response.cookies.set(INSTAGRAM_STATE_COOKIE, '', { path: INSTAGRAM_CALLBACK_PATH, maxAge: 0 });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const returnedState = params.get('state') ?? '';
  const expectedState = request.cookies.get(INSTAGRAM_STATE_COOKIE)?.value ?? '';
  if (
    !returnedState ||
    returnedState.length !== expectedState.length ||
    !timingSafeEqual(Buffer.from(returnedState), Buffer.from(expectedState))
  ) {
    return finish('error', 'invalid_state');
  }

  if (params.get('error')) {
    console.warn('Login do Instagram cancelado ou negado:', params.get('error_reason') ?? params.get('error'));
    return finish('error', 'authorization_denied');
  }

  const code = params.get('code');
  if (!code) return finish('error', 'missing_code');

  const app = getMetaAppConfig();
  if (!app) return finish('error', 'not_configured');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return finish('error', 'authentication_required');

  try {
    const connection = await connectInstagram(code, new URL(INSTAGRAM_CALLBACK_PATH, origin).toString(), app);

    if (!connection.scopes.includes('instagram_manage_insights')) {
      console.warn('Instagram conectado sem a permissão instagram_manage_insights.');
    }

    const { error } = await createAdminClient()
      .from('user_meta_config')
      .upsert(
        {
          user_id: user.id,
          access_token: connection.accessToken,
          token_expires_at: connection.tokenExpiresAt,
          instagram_account_id: connection.instagramAccountId,
          instagram_username: connection.instagramUsername,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('Falha ao salvar a conexão do Instagram:', error.message);
      return finish('error', 'save_failed');
    }

    // Token salvo, mas a conta ainda não foi identificada: o diagnóstico fica no log.
    if (!connection.instagramAccountId) return finish('error', 'no_instagram_account');

    return finish('connected');
  } catch (error) {
    console.error('Falha no login do Instagram:', error instanceof Error ? error.message : error);
    const reason = error instanceof GraphError && error.status === 422 ? 'no_instagram_account' : 'meta_request_failed';
    return finish('error', reason);
  }
}
