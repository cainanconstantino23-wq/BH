import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import {
  GRAPH_VERSION,
  INSTAGRAM_CALLBACK_PATH,
  INSTAGRAM_STATE_COOKIE,
  getMetaAppConfig,
} from '@/lib/meta/graph';

// Inicia o login unificado do Instagram (Login do Facebook para Empresas com config_id).
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (reason: string) => NextResponse.redirect(new URL(`/?instagram=error&reason=${reason}`, origin));

  const app = getMetaAppConfig();
  if (!app) {
    console.error('Login do Instagram sem configuração: defina META_CLIENT_ID, META_CLIENT_SECRET e META_INSTAGRAM_CONFIG_ID.');
    return NextResponse.json({ error: 'instagram_not_configured' }, { status: 500 });
  }

  // O Meta só aceita retorno em endereço público com HTTPS.
  if (['localhost', '127.0.0.1'].includes(request.nextUrl.hostname)) return back('requires_production');

  const member = await getActiveMember();
  if (!member) return NextResponse.redirect(new URL('/login?reason=authentication_required', origin));
  if (!member.can('conectar_instagram')) return back('admin_only');

  const state = randomBytes(32).toString('base64url');
  const authUrl = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id', app.appId);
  authUrl.searchParams.set('config_id', app.configId);
  authUrl.searchParams.set('redirect_uri', new URL(INSTAGRAM_CALLBACK_PATH, origin).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('override_default_response_type', 'true');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(INSTAGRAM_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: INSTAGRAM_CALLBACK_PATH,
    maxAge: 600,
  });
  return response;
}
