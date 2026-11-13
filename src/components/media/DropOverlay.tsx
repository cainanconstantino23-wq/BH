import { Upload } from 'lucide-react';

// Aviso por cima da janela enquanto um arquivo está sendo arrastado (ver useFileDrop).
export function DropOverlay({ hint = 'MP4, MOV, JPG, PNG ou WEBP' }: { hint?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-brand-plum bg-surface/90 p-6">
      <div className="text-center">
        <Upload size={32} className="mx-auto text-brand-plum" aria-hidden="true" />
        <p className="mt-3 text-base font-semibold text-ink">Solte o vídeo ou a foto aqui</p>
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      </div>
    </div>
  );
}
