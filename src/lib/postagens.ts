// Planilha "POSTAGENS INSTA 2025" (aba POSTAGENS): linhas normalizadas e ordem de prioridade.
// Sem imports com "@/": também roda direto no `node --test`.

export interface PostagemRow {
  /** Número da linha na planilha. */
  line: number;
  /** Coluna ATUALIZADO (condomínio / região). */
  atualizado: string;
  casa: string;
  /** Data ISO (AAAA-MM-DD); se a coluna estiver vazia, a maior das postagens. */
  ultimaPostagem: string | null;
  observacoes: string;
  /** Coluna QUALIF CORRETORAS. */
  qualif: string;
  entradaSite: string | null;
  /** Todas as colunas POSTAGEM com data, em ordem crescente. */
  postagens: string[];
  /** "Não publicar" / "Não postar" na qualificação ou nas observações. */
  bloqueada: boolean;
}

export type PrioritizedRow = PostagemRow & { diasSemPostar: number | null };

const DAY = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Data da planilha → ISO. Aceita número serial do Excel, Date e texto dd/mm/aaaa. */
export function excelDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : iso(value.getTime());
  if (typeof value === 'number') {
    // só datas plausíveis (1954–2119); evita tratar "4 suítes" como data
    return value > 20000 && value < 80000 ? iso(EXCEL_EPOCH + Math.round(value) * DAY) : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (br) return iso(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    if (/^\d{5}(\.0+)?$/.test(text)) return excelDate(Number(text));
  }
  return null;
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const text = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const result = String(value).trim();
  return result === 'None' ? '' : result;
};

const BLOCKED = /n[aã]o (pode )?(publicar|postar)/i;

/** rows[0] é o cabeçalho. Colunas achadas pelo nome; linhas sem CASA ficam de fora. */
export function parsePostagens(rows: unknown[][]): PostagemRow[] {
  const header = (rows[0] ?? []).map(normalize);
  const col = (name: string) => header.indexOf(name);
  const cols = {
    atualizado: col('atualizado'),
    casa: col('casa'),
    ultima: col('ultima postagem'),
    observacoes: col('observacoes'),
    qualif: col('qualif corretoras'),
    entrada: col('data entrada site'),
  };
  const postCols = header.flatMap((name, index) => (name === 'postagem' ? [index] : []));
  const at = (row: unknown[], index: number) => (index >= 0 ? row[index] : undefined);

  const result: PostagemRow[] = [];
  rows.slice(1).forEach((row, index) => {
    const casa = text(at(row, cols.casa));
    if (!casa) return;
    const postagens = postCols
      .map((c) => excelDate(row[c]))
      .filter((d): d is string => d !== null)
      .sort();
    const observacoes = text(at(row, cols.observacoes));
    const qualif = text(at(row, cols.qualif));
    result.push({
      line: index + 2,
      atualizado: text(at(row, cols.atualizado)),
      casa,
      ultimaPostagem: excelDate(at(row, cols.ultima)) ?? postagens.at(-1) ?? null,
      observacoes,
      qualif,
      entradaSite: excelDate(at(row, cols.entrada)),
      postagens,
      bloqueada: BLOCKED.test(qualif) || BLOCKED.test(observacoes),
    });
  });
  return result;
}

/** Ordem de prioridade: nunca postadas, depois as postadas há mais tempo; bloqueadas no fim. */
export function prioritize(rows: PostagemRow[], today: string): PrioritizedRow[] {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return rows
    .map((row) => ({
      ...row,
      diasSemPostar: row.ultimaPostagem ? Math.round((todayMs - Date.parse(`${row.ultimaPostagem}T00:00:00Z`)) / DAY) : null,
    }))
    .sort((a, b) => {
      if (a.bloqueada !== b.bloqueada) return a.bloqueada ? 1 : -1;
      if (a.ultimaPostagem !== b.ultimaPostagem) {
        if (!a.ultimaPostagem) return -1;
        if (!b.ultimaPostagem) return 1;
        return a.ultimaPostagem < b.ultimaPostagem ? -1 : 1;
      }
      return a.casa.localeCompare(b.casa, 'pt-BR');
    });
}
