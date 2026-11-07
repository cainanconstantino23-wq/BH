import 'server-only';

// Login unificado do Instagram (Login do Facebook para Empresas com configuração)
// e chamadas à Graph API. Só roda no servidor.

export const GRAPH_VERSION = 'v23.0';
const GRAPH_HOSTS = {
  facebook: `https://graph.facebook.com/${GRAPH_VERSION}`,
  instagram: `https://graph.instagram.com/${GRAPH_VERSION}`,
} as const;
export type GraphHost = keyof typeof GRAPH_HOSTS;

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
  host: GraphHost = 'facebook',
): Promise<T> {
  const url = new URL(`${GRAPH_HOSTS[host]}${path}`);
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
  type?: string;
  app_id?: string;
  user_id?: string;
  profile_id?: string;
  is_valid?: boolean;
  expires_at?: number;
  scopes?: string[];
  granular_scopes?: { scope: string; target_ids?: string[] }[];
}

export interface InstagramConnection {
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  /** null quando o login funcionou mas a conta ainda não foi identificada. */
  instagramAccountId: string | null;
  instagramUsername: string;
  businessId: string | null;
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
  const attempts: Record<string, string> = {};
  let found: { id: string; username?: string; host: GraphHost } | null = null;

  // 1) IDs liberados por permissão (granular_scopes) ou o perfil do token.
  const candidateIds = [
    ...granular.filter((item) => item.scope.startsWith('instagram')).flatMap((item) => item.target_ids ?? []),
    ...(debug.profile_id ? [debug.profile_id] : []),
  ];
  for (const id of [...new Set(candidateIds)]) {
    try {
      const profile = await graphGet<{ id: string; username?: string }>(`/${id}`, { fields: 'id,username', access_token: accessToken });
      if (profile.username) {
        found = { id: profile.id, username: profile.username, host: 'facebook' };
        attempts[`id_${id}`] = 'ok';
        break;
      }
      attempts[`id_${id}`] = 'sem username (não é conta do Instagram)';
    } catch (error) {
      attempts[`id_${id}`] = error instanceof Error ? error.message : 'falhou';
    }
  }

  // 2) Conta do Instagram ligada a uma Página do Facebook.
  if (!found) {
    try {
      const pages = await graphGet<{ data?: { instagram_business_account?: { id?: string; username?: string } }[] }>(
        '/me/accounts',
        { fields: 'instagram_business_account{id,username}', access_token: accessToken },
      );
      const account = pages.data?.find((page) => page.instagram_business_account?.id)?.instagram_business_account;
      attempts.me_accounts = `${pages.data?.length ?? 0} páginas`;
      if (account?.id) found = { id: account.id, username: account.username, host: 'facebook' };
    } catch (error) {
      attempts.me_accounts = error instanceof Error ? error.message : 'falhou';
    }
  }

  // 3) Token emitido pelo login do Instagram (graph.instagram.com).
  if (!found) {
    try {
      const me = await graphGet<{ user_id?: string; id?: string; username?: string }>(
        '/me',
        { fields: 'user_id,username', access_token: accessToken },
        'instagram',
      );
      attempts.instagram_me = me.username ? 'ok' : 'sem username';
      const id = me.user_id ?? me.id;
      if (id && me.username) found = { id, username: me.username, host: 'instagram' };
    } catch (error) {
      attempts.instagram_me = error instanceof Error ? error.message : 'falhou';
    }
  }

  // 4) Token de usuário do sistema: a conta vem da empresa (client_business_id).
  let businessId: string | null = null;
  try {
    const me = await graphGet<{ id?: string; client_business_id?: string }>('/me', {
      fields: 'id,client_business_id',
      access_token: accessToken,
    });
    businessId = me.client_business_id ?? null;
    attempts.client_business_id = businessId ? 'ok' : 'ausente';
  } catch (error) {
    attempts.client_business_id = error instanceof Error ? error.message : 'falhou';
  }
  if (!found && businessId) {
    for (const edge of ['owned_instagram_accounts', 'instagram_business_accounts', 'instagram_accounts']) {
      try {
        const list = await graphGet<{ data?: { id?: string; username?: string }[] }>(`/${businessId}/${edge}`, {
          fields: 'id,username',
          access_token: accessToken,
        });
        const account = list.data?.find((item) => item.id);
        attempts[edge] = `${list.data?.length ?? 0} contas`;
        if (account?.id) {
          found = { id: account.id, username: account.username, host: 'facebook' };
          break;
        }
      } catch (error) {
        attempts[edge] = error instanceof Error ? error.message : 'falhou';
      }
    }
  }

  // Diagnóstico sem o token: tipo, permissões e o que cada tentativa encontrou.
  console.info(
    'Diagnóstico do login do Instagram:',
    JSON.stringify({
      type: debug.type,
      user_id: debug.user_id,
      business_id: businessId,
      profile_id: debug.profile_id,
      expires_at: debug.expires_at,
      scopes,
      granular_scopes: granular,
      attempts,
      found: found ? { id: found.id, username: found.username, host: found.host } : null,
    }),
  );

  return {
    accessToken,
    tokenExpiresAt: debug.expires_at ? new Date(debug.expires_at * 1000).toISOString() : null,
    scopes,
    instagramAccountId: found?.id ?? null,
    instagramUsername: found?.username ?? '',
    businessId,
  };
}
