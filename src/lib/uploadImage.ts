import { captureVideoCover } from '@/lib/media';

// Envia uma imagem do navegador para o R2 (URL assinada em /api/upload-url) e devolve o endereço público.
export async function uploadImage(file: File) {
  const response = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type || 'image/jpeg' }),
  });
  if (!response.ok) throw new Error(`upload-url respondeu ${response.status}`);
  const { uploadUrl, publicUrl } = (await response.json()) as { uploadUrl: string; publicUrl: string };
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
  if (!put.ok) throw new Error(`envio respondeu ${put.status}`);
  return publicUrl;
}

const isVideoUpload = (file: File) => file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);

/**
 * Envia foto ou vídeo direto do navegador para o Cloudflare R2 (URL assinada), com progresso real.
 * Vídeo: também envia uma capa JPG ao lado (mesmo nome + ".jpg"). Devolve o endereço público.
 * Usado na Aprovação vídeos e no post criado pela aprovação de capa (nada vai para o Supabase Storage).
 */
export async function uploadMedia(file: File, onPercent: (percent: number) => void = () => {}) {
  const isVideo = isVideoUpload(file);
  const fileType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType }),
  });
  if (!res.ok) throw new Error(`upload-url respondeu ${res.status}`);
  const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', fileType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onPercent(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`envio respondeu ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('falha de rede no envio'));
    xhr.send(file);
  });

  // Vídeo: tira um quadro e envia como capa (JPG leve para listas e grade). Se falhar, segue sem capa.
  if (isVideo) {
    try {
      const cover = await captureVideoCover(file);
      if (cover) {
        const coverRes = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: 'capa.jpg', fileType: 'image/jpeg', coverFor: publicUrl }),
        });
        if (coverRes.ok) {
          const { uploadUrl: coverUploadUrl } = (await coverRes.json()) as { uploadUrl: string };
          await fetch(coverUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: cover });
        }
      }
    } catch (error) {
      console.warn('Capa do vídeo não foi gerada:', error);
    }
  }
  return publicUrl;
}
