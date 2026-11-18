import 'server-only';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2 (mídias). Credenciais só no servidor.
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export const r2PublicUrl = (key: string) => `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

/** Envia um arquivo pelo próprio servidor e devolve o endereço público. */
export async function putR2Object(key: string, body: Uint8Array, contentType: string) {
  await r2Client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }));
  return r2PublicUrl(key);
}
