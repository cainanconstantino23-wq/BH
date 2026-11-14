// Nome e número da casa, como aparecem na grade, na fila e no link de aprovação.
// Ex.: houseLabel('Vila dos Coqueiros', '110') → "Casa 110 · Vila dos Coqueiros".

export function houseLabel(name?: string | null, number?: string | null) {
  const cleanName = (name ?? '').trim();
  const cleanNumber = (number ?? '').trim();
  if (cleanNumber && cleanName) return `Casa ${cleanNumber} · ${cleanName}`;
  if (cleanNumber) return `Casa ${cleanNumber}`;
  return cleanName;
}

/** Pasta da aprovação de capa: "Casa 110 · Vila dos Coqueiros · Trancoso". */
export function coverFolderLabel(name?: string | null, neighborhood?: string | null, number?: string | null) {
  return [houseLabel(name, number), (neighborhood ?? '').trim()].filter(Boolean).join(' · ');
}

const withoutAccents = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

// O que aparece no nome do arquivo e não é o nome da casa: marca, peça, versão, cor, extras de edição.
const FILE_NOISE = [
  /\bbahia\s*homes\b/gi,
  /^\d{1,3}\s+/g, // ordem no início ("07 CASA 110 ...")
  /\b(?:p[ií]lula|reels?|stories|story|post|teaser|final|corte|edit)\s*\d*\b/gi,
  /\bv\d+\b/gi,
  /\b(?:color|colorido|c)\b/gi,
  /\(\s*\)/g,
];
const CAMERA_NAME = /^(?:img|dsc|dji|mvi|vid|pxl|gopr|whatsapp)\b/i;

/**
 * Tenta tirar nome e número da casa do nome do arquivo do vídeo/foto. É um palpite: a pessoa confere.
 * "07 CASA 110 Vila dos coqueiros PILULA 01 V1.mp4"   → { number: "110", name: "Vila dos coqueiros" }
 * "Bahia Homes - Casa 58 - Pílula 02 v1 Color_c.mp4" → { number: "58",  name: "" }
 * "CASA RIO DA BARRA 06.mp4"                          → { number: "06",  name: "CASA RIO DA BARRA" }
 */
export function guessHouseFromFileName(fileName: string) {
  const text = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (CAMERA_NAME.test(text)) return { name: '', number: '' };

  // "Casa 110", "Villa 123", "Vila nº 7"... ou, sem isso, um número no fim ("Casa Rio da Barra 06")
  const housePattern = /\b(?:casa|villa|vila)\s*(?:n[ºo°.]?\s*)?(\d{1,4})\b/i;
  let number = withoutAccents(text).match(housePattern)?.[1] ?? '';
  let name = text.replace(new RegExp(housePattern.source, 'gi'), ' ');
  if (!number) {
    const trailing = text.match(/\s(\d{1,4})$/);
    if (trailing) {
      number = trailing[1];
      name = text.slice(0, trailing.index);
    }
  }

  for (const pattern of FILE_NOISE) name = name.replace(pattern, ' ');
  name = name
    .split(/\s+-\s+|\s+-|-\s+/) // partes separadas por " - "
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => /[a-zà-ú]{2,}/i.test(part))
    .join(' ');

  return { name, number };
}
