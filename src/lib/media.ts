const videoExtensions = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'avi', 'mkv']);

export const isVideoMedia = (mediaUrl: string, mediaType?: string) => {
  if (mediaType?.toLowerCase().startsWith('video/')) return true;
  if (mediaType?.toLowerCase() === 'video') return true;
  if (mediaUrl.toLowerCase().startsWith('data:video/')) return true;

  const cleanUrl = mediaUrl.split(/[?#]/, 1)[0];
  const extension = cleanUrl.split('.').pop()?.toLowerCase();
  return extension ? videoExtensions.has(extension) : false;
};

/**
 * Capa (JPG) de um vídeo enviado ao R2: fica ao lado do vídeo, com o mesmo nome + ".jpg".
 * Retorna null para fotos e para vídeos de outros lugares (aí a tela usa o próprio vídeo).
 */
export const coverUrlFor = (mediaUrl: string, mediaType?: string) => {
  if (!mediaUrl || !isVideoMedia(mediaUrl, mediaType)) return null;
  const clean = mediaUrl.split('#', 1)[0];
  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const isR2 = (r2Base && clean.startsWith(`${r2Base}/uploads/`)) || /\.r2\.dev\/uploads\//.test(clean);
  return isR2 ? `${clean}.jpg` : null;
};

/** Tira um quadro do vídeo (no navegador, do arquivo local) e devolve um JPG de até 720 px. */
export function captureVideoCover(file: File, atSeconds = 0.5): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (blob: Blob | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(blob);
    };
    const timer = window.setTimeout(() => finish(null), 15000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(0, (video.duration || 1) - 0.1));
    };
    video.onseeked = () => {
      window.clearTimeout(timer);
      const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context || !canvas.width) return finish(null);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82);
    };
    video.src = url;
  });
}
