// Pastas do Drive por pessoa (team_members.drive_folders). Regras puras, sem acesso ao Drive (testadas em driveScope.test.ts).
// null = vê tudo; [] = nada; lista = só essas pastas e o que está abaixo delas.

export interface DriveFolder {
  id: string;
  name: string;
}

const FOLDER_ID = /^[\w-]{10,}$/;

/** Lê a coluna drive_folders: null/ausente = null (tudo); outro valor que não é lista = [] (nada); itens inválidos são descartados. */
export function parseDriveFolders(value: unknown): DriveFolder[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is DriveFolder => {
      const row = item as Partial<DriveFolder> | null;
      return typeof row?.id === 'string' && FOLDER_ID.test(row.id) && typeof row.name === 'string';
    })
    .map(({ id, name }) => ({ id, name }));
}

/** O item é uma das pastas liberadas ou está abaixo dela (sobe pelo primeiro pai)? Erro ao ler = não. */
export async function isWithinFolders(
  id: string,
  allowed: ReadonlySet<string>,
  parentsOf: (id: string) => Promise<string[] | null>,
  maxDepth = 12,
): Promise<boolean> {
  if (allowed.size === 0) return false;
  let current: string | undefined = id;
  for (let depth = 0; current && depth <= maxDepth; depth++) {
    if (allowed.has(current)) return true;
    const parents: string[] | null = await parentsOf(current).catch(() => null);
    if (!parents) return false;
    current = parents[0];
  }
  return false;
}
