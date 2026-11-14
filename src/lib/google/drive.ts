import 'server-only';

import { createAdminClient } from '@/utils/supabase/admin';

// Google Drive: login OAuth (escopo só leitura), tokens em google_drive_connections (só servidor)
// e chamadas à API do Drive. A conexão vale para a equipe inteira (a mais recente).

export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
export const GOOGLE_STATE_COOKIE = 'bh_google_state';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.readonly'];
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export function getGoogleAppConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline'); // devolve refresh token
  url.searchParams.set('prompt', 'consent'); // garante o refresh token mesmo em reconexão
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(`Google token: ${data.error ?? response.status} ${data.error_description ?? ''}`.trim());
  }
  return data;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const app = getGoogleAppConfig();
  if (!app) throw new Error('Google não configurado');
  return tokenRequest({
    code,
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
}

export async function getGoogleEmail(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { email?: string };
  return data.email ?? null;
}

export class DriveNotConnectedError extends Error {}

interface ConnectionRow {
  user_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

/** A conexão da equipe (a mais recente), ou null. */
export async function getDriveConnection() {
  const { data, error } = await createAdminClient()
    .from('google_drive_connections')
    .select('user_id, google_email, refresh_token, access_token, access_token_expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a conexão do Drive: ${error.message}`);
  return data as ConnectionRow | null;
}

/** Access token válido; renova com o refresh token quando falta menos de 1 minuto. */
export async function getDriveAccessToken() {
  const connection = await getDriveConnection();
  if (!connection) throw new DriveNotConnectedError();

  const expiresAt = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0;
  if (connection.access_token && expiresAt - Date.now() > 60_000) return connection.access_token;

  const app = getGoogleAppConfig();
  if (!app) throw new Error('Google não configurado');
  let token: TokenResponse;
  try {
    token = await tokenRequest({
      refresh_token: connection.refresh_token,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: 'refresh_token',
    });
  } catch (error) {
    // invalid_grant: acesso revogado ou expirado (no modo de teste do Google, a cada 7 dias)
    if (String(error).includes('invalid_grant')) throw new DriveNotConnectedError();
    throw error;
  }

  await createAdminClient()
    .from('google_drive_connections')
    .update({
      access_token: token.access_token,
      access_token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
    })
    .eq('user_id', connection.user_id);

  return token.access_token;
}

export async function driveFetch(path: string, params: Record<string, string> = {}) {
  const accessToken = await getDriveAccessToken();
  const url = new URL(`${DRIVE_API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  if (response.status === 401) throw new DriveNotConnectedError();
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Drive ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response;
}

/** IDs do Drive: letras, números, - e _. "root" é a raiz do Meu Drive. */
export const DRIVE_ID = /^(root|[A-Za-z0-9_-]{10,200})$/;

/** Miniatura de uma imagem do Drive (lado maior = size px), pronta para devolver ao navegador. */
export async function driveThumbnail(fileId: string, size: number, cacheControl = 'private, max-age=3600') {
  const meta = (await (await driveFetch(`/files/${fileId}`, { fields: 'thumbnailLink', supportsAllDrives: 'true' })).json()) as {
    thumbnailLink?: string;
  };
  if (!meta.thumbnailLink) return new Response(null, { status: 404 });

  const link = meta.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, `=s${size}`);
  const image = await fetch(link, { headers: { Authorization: `Bearer ${await getDriveAccessToken()}` }, cache: 'no-store' });
  if (!image.ok || !image.body) return new Response(null, { status: 502 });
  return new Response(image.body, {
    headers: { 'Content-Type': image.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': cacheControl },
  });
}

export const clampThumbSize = (value: string | null) => Math.min(Math.max(Number(value) || 400, 100), 2000);
