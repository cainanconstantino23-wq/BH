// Salvar no Drive as capas aprovadas pela aprovadora: nome da pasta nova, nome de cada arquivo e o registro.
// Regras puras (sem rede), usadas por src/lib/coverDrive-server.ts e pelos testes.

import { APPROVER_LABEL, APPROVER_NAME, formatLongStamp, type CoverCollectionDetail, type CoverPhoto } from './covers.ts';

/** Ação do registro (activity_log) quando as capas são salvas no Drive. */
export const SAVED_TO_DRIVE_ACTION = 'capa.salvas_no_drive';
export const RECORD_FILE_NAME = 'Registro da aprovação.txt';

/** Data e hora da Bahia sem "/" nem ":" (o Drive para Mac troca esses caracteres): "19-11-2026 14h32". */
export function fileStamp(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Bahia' })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}h${parts.minute}`;
}

/** Nome da pasta nova: "Capas aprovadas por Thereza em 19-11-2026 14h32" (data da resposta dela). */
export const approvedFolderName = (respondedAt: string) => `Capas aprovadas por ${APPROVER_NAME} em ${fileStamp(respondedAt)}`;

/** A foto que vai para o Drive: o corte (quando existe) ou a original. */
export const usesCrop = (photo: CoverPhoto) => Boolean(photo.edited?.url);

/** Nome do arquivo no Drive. Corte: "IMG_10 - corte Thereza.jpg"; original: o mesmo nome. */
export function savedFileName(photo: CoverPhoto) {
  if (!photo.edited) return photo.name;
  const base = photo.name.replace(/\.[A-Za-z0-9]{2,5}$/, '') || 'capa';
  const ext = photo.edited.url.match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase() ?? 'jpg';
  const who = photo.editedBy === APPROVER_LABEL ? ` ${APPROVER_NAME}` : '';
  return `${base} - corte${who}.${ext}`;
}

/** O que aconteceu com uma capa, em linhas (vai no registro e na descrição do arquivo no Drive). */
export function photoRecordLines(photo: CoverPhoto) {
  const lines: string[] = [];
  const by = (label: string | null) => (label === APPROVER_LABEL ? APPROVER_NAME : label || 'equipe');
  if (photo.approvedAt) lines.push(`Aprovada por ${by(photo.approvedBy)} em ${formatLongStamp(photo.approvedAt)}`);
  if (photo.favoritedByApprover && photo.favoritedAt) lines.push(`Adicionada às capas por ${APPROVER_NAME} em ${formatLongStamp(photo.favoritedAt)}`);
  if (photo.edited) {
    const when = photo.editedAt ? ` em ${formatLongStamp(photo.editedAt)}` : '';
    lines.push(`Cortada por ${by(photo.editedBy)}${when}${photo.edited.label ? ` (${photo.edited.label})` : ''}`);
  }
  lines.push(`Foto original: ${photo.name}`);
  return lines;
}

/** Texto do arquivo "Registro da aprovação.txt". */
export function approvalRecord(collection: CoverCollectionDetail, house: string, savedBy: string, savedAt: string) {
  const capas = collection.photos.filter((photo) => photo.approved);
  return [
    `Capas aprovadas por ${APPROVER_NAME} — ${house}`,
    '',
    `Resposta enviada em ${formatLongStamp(collection.respondedAt)} pelo link de aprovação.`,
    ...(collection.feedback ? [`Comentário: "${collection.feedback}"`] : []),
    ...(collection.confirmedAt ? [`Capas confirmadas por ${collection.confirmedBy} em ${formatLongStamp(collection.confirmedAt)}.`] : []),
    `Salvo no Drive por ${savedBy} em ${formatLongStamp(savedAt)}.`,
    '',
    `${capas.length} ${capas.length === 1 ? 'capa' : 'capas'}:`,
    ...capas.flatMap((photo, index) => ['', `${index + 1}. ${savedFileName(photo)}`, ...photoRecordLines(photo).map((line) => `   ${line}`)]),
    '',
  ].join('\n');
}
