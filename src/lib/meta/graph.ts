import 'server-only';

// Login unificado do Instagram (Login do Facebook para Empresas com configuração)
// e chamadas à Graph API. Só roda no servidor.

export const GRAPH_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const INSTAGRAM_CALLBACK_PATH = '/api/auth/instagram/callback';
export const INSTAGRAM_STATE_COOKIE = 'instagram_oauth_state';

export interface MetaAppConfig {
  appId: string;
  appSecret: string;
  configId: string;
}

/** Credenciais do app no Meta; null se alguma variável de ambiente faltar. */
export function getMetaAppConfig(): MetaAppConfig | null {
  const appId = process.env.META_CLIENT_ID;
  const appSecret = process.env.META_CLIENT_SECRET;
  const configId = process.env.META_INSTAGRAM_CONFIG_ID;
  if (!appId || !appSecret || !configId) return null;
  return { appId, appSecret, configId };
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** GET na Graph API. Lança GraphError com a mensagem do Meta (sem expor o token). */
export async function graphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, { cache: 'no-store' });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GraphError(`Resposta inválida do Meta em ${path} (HTTP ${response.status}).`, response.status);
  }

  if (!response.ok || (isRecord(payload) && payload.error)) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    const message = typeof error.message === 'string' ? error.message : 'erro desconhecido';
    const code = typeof error.code === 'number' ? error.code : undefined;
    throw new GraphError(`Meta recusou ${path}: ${message}`, response.status, code);
  }

  return payload as T;
}

interface DebugTokenData {
  is_valid?: boolean;
  expires_at?: number;
  scopes?: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
}

export interface InstagramConnection {
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  instagramAccountId: string;
  instagramUsername: string;
}

/**
 * Troca o código do login pelo token e descobre a conta do Instagram autorizada.
 * Com o token de usuário do sistema não há troca por token de longa duração: ele não expira.
 */
export async function connectInstagram(code: string, redirectUri: string, app: MetaAppConfig): Promise<InstagramConnection> {
  const tokenData = await graphGet<{ access_token?: string }>('/oauth/access_token', {
    client_id: app.appId,
    client_secret: app.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new GraphError('O Meta não devolveu um token de acesso.', 502);

  const { data: debug } = await graphGet<{ data: DebugTokenData }>('/debug_token', {
    input_token: accessToken,
    access_token: `${app.appId}|${app.appSecret}`,
  });
  if (!debug?.is_valid) throw new GraphError('O token recebido do Meta não é válido.', 502);

  const scopes = debug.scopes ?? [];
  const granular = debug.granular_scopes ?? [];
  const targetIds =
    granular.find((item) => item.scope === 'instagram_basic')?.target_ids ??
    granular.find((item) => item.scope === 'instagram_manage_insights')?.target_ids ??
    [];

  let instagramAccountId: string | undefined = targetIds[0];

  // Alternativa: conta do Instagram ligada a uma Página do Facebook.
  if (!instagramAccountId) {
    const pages = await graphGet<{ data?: { instagram_business_account?: { id?: string } }[] }>('/me/accounts', {
      fields: 'instagram_business_account',
      access_token: accessToken,
    }).catch(() => ({ data: [] }));
    instagramAccountId = pages.data?.find((page) => page.instagram_business_account?.id)?.instagram_business_account?.id;
  }

  if (!instagramAccountId) {
    throw new GraphError('Nenhuma conta do Instagram foi autorizada no login.', 422);
  }

  const profile = await graphGet<{ id: string; username?: string }>(`/${instagramAccountId}`, {
    fields: 'id,username',
    access_token: accessToken,
  });

  return {
    accessToken,
    tokenExpiresAt: debug.expires_at ? new Date(debug.expires_at * 1000).toISOString() : null,
    scopes,
    instagramAccountId: profile.id,
    instagramUsername: profile.username ?? '',
  };
}
