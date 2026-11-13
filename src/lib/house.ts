// Nome e número da casa, como aparecem na grade, na fila e no link de aprovação.
// Ex.: houseLabel('Vila dos Coqueiros', '110') → "Casa 110 · Vila dos Coqueiros".

export function houseLabel(name?: string | null, number?: string | null) {
  const cleanName = (name ?? '').trim();
  const cleanNumber = (number ?? '').trim();
  if (cleanNumber && cleanName) return `Casa ${cleanNumber} · ${cleanName}`;
  if (cleanNumber) return `Casa ${cleanNumber}`;
  return cleanName;
}
