'use client';

import { useState } from 'react';
import { ImageOff, Video } from 'lucide-react';
import { isVideoMedia } from '@/lib/media';

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
}: MediaPreviewProps) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const isVideo = isVideoMedia(src, mediaType);

  if (!src || hasLoadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#e8e4de] p-2 text-center text-[#625d63]">
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
