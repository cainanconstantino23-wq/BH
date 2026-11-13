'use client';

import { useState } from 'react';
import { ImageOff, Video } from 'lucide-react';
import { coverUrlFor, isVideoMedia } from '@/lib/media';

interface MediaPreviewProps {
  src: string;
  mediaType?: string;
  alt: string;
  className: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  /** Miniatura: para vídeo, mostra a capa JPG (leve) em vez de carregar o vídeo. Sem capa, usa o vídeo. */
  cover?: boolean;
}

export function MediaPreview({
  src,
  mediaType,
  alt,
  className,
  controls = false,
  autoPlay = false,
  muted = false,
  loop = false,
  preload = 'metadata',
  cover = false,
}: MediaPreviewProps) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const isVideo = isVideoMedia(src, mediaType);
  const coverUrl = cover && isVideo ? coverUrlFor(src, mediaType) : null;

  if (coverUrl && !coverFailed && !hasLoadError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={coverUrl} alt={alt} loading="lazy" onError={() => setCoverFailed(true)} className={className} />
    );
  }

  if (!src || hasLoadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-surface-muted p-2 text-center text-ink-muted">
        {isVideo ? <Video size={18} aria-hidden="true" /> : <ImageOff size={18} aria-hidden="true" />}
        <span className="text-[10px] font-medium">
          {hasLoadError ? 'Não foi possível carregar a mídia' : 'Sem mídia'}
        </span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={src}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        preload={preload}
        aria-label={alt}
        onError={() => setHasLoadError(true)}
        className={className}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={preload === 'none' ? 'lazy' : undefined}
      onError={() => setHasLoadError(true)}
      className={className}
    />
  );
}
