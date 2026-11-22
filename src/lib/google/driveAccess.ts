import 'server-only';

import { driveFetch } from '@/lib/google/drive';

// REGRA DO PROJETO (21/11/2026): o app só enxerga o que está em "Compartilhados comigo" no Drive conectado.
// "Meu Drive" e os drives compartilhados (de equipe) ficam bloqueados para todos, inclusive por ID direto.
//
// Um arquivo/pasta é liberado quando:
// - não pertence à conta conectada (ownedByMe = false: alguém compartilhou), ou
// - pertence à conta, mas está dentro de uma pasta de outra pessoa (ex.: "Capas Selecionadas" criada pelo app
//   dentro da pasta compartilhada da casa) — sobe pelas pastas de cima até achar uma que não é da conta.
// Bloqueado: qualquer coisa num drive compartilhado (driveId) ou que sobe até a raiz do Meu Drive.

interface Meta { id: string; ownedByMe?: boolean; parents?: string[]; driveId?: string }

const MAX_DEPTH = 12;
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { ok: boolean; at: number }>();

const meta = async (id: string): Promise<Meta> =>
  (await (await driveFetch(`/files/${encodeURIComponent(id)}`, { fields: 'id,ownedByMe,parents,driveId', supportsAllDrives: 'true' })).json()) as Meta;

const remember = (ids: string[], ok: boolean) => {
  const at = Date.now();
  if (cache.size > 5000) cache.clear();
  for (const id of ids) cache.set(id, { ok, at });
  return ok;
};

/** O arquivo ou a pasta veio de "Compartilhados comigo"? Erro do Drive (sem acesso, apagado) = bloqueado. */
export async function isSharedWithMe(fileId: string): Promise<boolean> {
  if (!fileId || fileId === 'root') return false;
  const seen: string[] = [];
  let id: string | undefined = fileId;
  for (let depth = 0; id && depth < MAX_DEPTH; depth++) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL) return remember(seen, hit.ok);
    seen.push(id);
    const row: Meta | null = await meta(id).catch(() => null);
    if (!row || row.driveId) return remember(seen, false);
    if (row.ownedByMe === false) return remember(seen, true);
    id = row.parents?.[0];
  }
  // chegou na raiz do Meu Drive (sem pasta de cima) ou subiu demais
  return remember(seen, false);
}

/** Só os IDs liberados, na mesma ordem. */
export async function onlyShared(ids: string[]): Promise<string[]> {
  const checks = await Promise.all(ids.map(async (id) => ((await isSharedWithMe(id)) ? id : null)));
  return checks.filter((id): id is string => id !== null);
}
