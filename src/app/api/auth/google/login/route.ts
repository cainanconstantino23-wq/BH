import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';
import { GOOGLE_CALLBACK_PATH, GOOGLE_STATE_COOKIE, buildGoogleAuthUrl, getGoogleAppConfig } from '@/lib/google/drive';

// Inicia o login do Google para ler o Drive (só leitura).
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (reason: string) => NextResponse.redirect(new URL(`/?drive=error&reason=${reason}`, origin));

  const app = getGoogleAppConfig();
  if (!app) {
    console.error('Login do Google sem configuração: defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.');
    return back('not_configured');
  }

  const member = await getActiveMember();
  if (!member) return NextResponse.redirect(new URL('/login?reason=authentication_required', origin));
  if (!member.can('conectar_instagram')) return back('admin_only');

  const state = randomBytes(32).toString('base64url');
  const response = NextResponse.redirect(buildGoogleAuthUrl(app.clientId, new URL(GOOGLE_CALLBACK_PATH, origin).toString(), state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: GOOGLE_CALLBACK_PATH,
    maxAge: 600,
  });
  return response;
}
