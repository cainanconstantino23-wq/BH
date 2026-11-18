// Corte de capa enviado pelo link público (/capa/[token]): só JPEG gerado pelo editor, nas medidas do Instagram.
// Sem imports com "@/": também roda no `node --test`.

/** Abaixo do limite de corpo da Vercel (4,5 MB); um 1080×1350 em JPEG fica perto de 1 MB. */
export const MAX_CROP_BYTES = 4 * 1024 * 1024;

export type CropUploadError = 'not_jpeg' | 'too_large' | 'bad_size';

export function checkCropUpload({ bytes, width, height }: { bytes: Uint8Array; width: number; height: number }): CropUploadError | null {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return 'not_jpeg';
  if (bytes.length > MAX_CROP_BYTES) return 'too_large';
  const ok = (n: number) => Number.isInteger(n) && n >= 320 && n <= 2160;
  if (!ok(width) || !ok(height)) return 'bad_size';
  return null;
}
