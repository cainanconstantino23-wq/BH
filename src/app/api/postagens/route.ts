import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getActiveMember } from '@/lib/team-server';
import { DRIVE_ID, DriveNotConnectedError, driveFetch } from '@/lib/google/drive';
import { parsePostagens, prioritize } from '@/lib/postagens';

// Tabela de postagens: lê a planilha "POSTAGENS INSTA 2025" do Drive (só leitura) e devolve as casas em ordem de prioridade.
// POSTAGENS_SHEET_ID fixa o arquivo; sem ele, procura pelo nome.

const noStore = { 'Cache-Control': 'private, no-store' };
const FILE_NAME = 'POSTAGENS INSTA 2025';
const SHEET_NAME = 'postagens';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

const FILE_FIELDS = 'id,name,mimeType,modifiedTime,shortcutDetails';
const ALL_DRIVES = { supportsAllDrives: 'true' };
const SHORTCUT = 'application/vnd.google-apps.shortcut';
// .xlsx enviado ao Drive às vezes fica como octet-stream ou ms-excel
const SPREADSHEET_TYPES = [GOOGLE_SHEET, XLSX, 'application/vnd.ms-excel', 'application/octet-stream'];
const wanted = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').includes(FILE_NAME.toLowerCase());

async function getFile(id: string) {
  const response = await driveFetch(`/files/${encodeURIComponent(id)}`, { fields: FILE_FIELDS, ...ALL_DRIVES });
  return (await response.json()) as DriveFile;
}

/** Atalho ("Adicionar atalho ao Drive") aponta para o arquivo de verdade. */
async function resolve(file: DriveFile): Promise<DriveFile> {
  if (file.mimeType !== SHORTCUT || !file.shortcutDetails?.targetId) return file;
  const target = await getFile(file.shortcutDetails.targetId);
  return { ...target, name: file.name };
}

async function findFile(): Promise<DriveFile | null> {
  const fixed = process.env.POSTAGENS_SHEET_ID?.trim();
  if (fixed && DRIVE_ID.test(fixed)) return resolve(await getFile(fixed));

  // procura em Meu Drive, "Compartilhados comigo" e drives compartilhados; o filtro fino é feito aqui
  const response = await driveFetch('/files', {
    q: "name contains 'POSTAGENS' and trashed = false",
    fields: `files(${FILE_FIELDS})`,
    orderBy: 'modifiedTime desc',
    pageSize: '50',
    corpora: 'allDrives',
    includeItemsFromAllDrives: 'true',
    ...ALL_DRIVES,
  });
  const { files = [] } = (await response.json()) as { files?: DriveFile[] };
  const candidates = files.filter(
    (file) => wanted(file.name) && (SPREADSHEET_TYPES.includes(file.mimeType) || (file.mimeType === SHORTCUT && SPREADSHEET_TYPES.includes(file.shortcutDetails?.targetMimeType ?? ''))),
  );
  if (candidates.length === 0) {
    console.warn('Tabela de postagens: planilha não encontrada. Arquivos com "POSTAGENS" no nome:', files.map((file) => `${file.name} (${file.mimeType})`));
    return null;
  }
  // a Planilha Google ganha de uma cópia .xlsx com o mesmo nome
  const best = candidates.find((file) => file.mimeType === GOOGLE_SHEET || file.shortcutDetails?.targetMimeType === GOOGLE_SHEET) ?? candidates[0];
  return resolve(best);
}

async function download(file: DriveFile) {
  const id = encodeURIComponent(file.id);
  const response =
    file.mimeType === GOOGLE_SHEET
      ? await driveFetch(`/files/${id}/export`, { mimeType: XLSX })
      : await driveFetch(`/files/${id}`, { alt: 'media', ...ALL_DRIVES });
  return response.arrayBuffer();
}

/** Valor "cru" de uma célula do exceljs: fórmulas, links e texto formatado viram valor simples. */
function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  return null;
}

function sheetRows(sheet: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellValue(cell.value);
    });
    rows[rowNumber - 1] = cells;
  });
  return Array.from(rows, (row) => row ?? []);
}

export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  // a planilha lista todas as casas: quem só vê algumas pastas do Drive não abre a tabela
  if (member.driveFolders) return NextResponse.json({ error: 'drive_restrito' }, { status: 403, headers: noStore });

  try {
    const file = await findFile();
    if (!file) return NextResponse.json({ error: 'file_not_found' }, { status: 404, headers: noStore });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await download(file));
    const sheet = workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === SHEET_NAME);
    if (!sheet) return NextResponse.json({ error: 'sheet_not_found' }, { status: 422, headers: noStore });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
    const rows = prioritize(parsePostagens(sheetRows(sheet)), today);
    return NextResponse.json(
      { file: { id: file.id, name: file.name, modifiedTime: file.modifiedTime ?? null }, rows },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof DriveNotConnectedError) {
      return NextResponse.json({ error: 'drive_not_connected' }, { status: 409, headers: noStore });
    }
    console.error('Falha ao ler a planilha de postagens:', error);
    return NextResponse.json({ error: 'read_failed' }, { status: 500, headers: noStore });
  }
}
