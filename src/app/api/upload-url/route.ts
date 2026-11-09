import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getActiveMember } from '@/lib/team-server';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;

// Gera uma URL assinada para enviar mídia ao R2. Só para quem cria ou edita publicações.
export async function POST(request: Request) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  if (!member.can('criar_publicacoes') && !member.can('editar_publicacoes')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const { fileName, fileType } = (await request.json()) as { fileName?: unknown; fileType?: unknown };
    if (typeof fileName !== 'string' || typeof fileType !== 'string' || !ALLOWED_TYPES.test(fileType)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 400 });
    }

    const fileExt = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const key = `uploads/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error('Erro ao gerar permissão no Cloudflare R2:', error);
    return NextResponse.json({ error: 'Erro ao autorizar upload no R2' }, { status: 500 });
  }
}
