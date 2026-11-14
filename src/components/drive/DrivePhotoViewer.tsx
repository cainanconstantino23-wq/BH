'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Crop, Loader2, Star, Undo2 } from 'lucide-react';
import { InstagramImageEditor } from '@/components/media/InstagramImageEditor';
import { OnScreen } from '@/components/drive/OnScreen';
import { formatPlaceLabel } from '@/lib/instagramFormats';
import { uploadImage } from '@/lib/uploadImage';
import type { EditedImage } from '@/lib/covers';

// Prévia grande de uma foto do Drive já com o editor de recorte aberto:
// formatos, aproximação e corte ao lado, setas para passar as fotos, Escolher / Capa no topo.

export interface ViewerItem {
  id: string;
  name: string;
  edited: EditedImage | null;
}

export function DrivePhotoViewer({
  items,
  index,
  onIndex,
  onClose,
  selected,
  favorite,
  onToggleSelect,
  onToggleFavorite,
  onEdited,
  extraActions,
}: {
  items: ViewerItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** undefined = sem o botão Escolher (ex.: dentro da pasta, onde todas já estão escolhidas) */
  selected?: boolean;
  favorite: boolean;
  onToggleSelect?: () => void;
  onToggleFavorite: () => void;
  /** corte salvo (ou null = voltar para a original) */
  onEdited: (edited: EditedImage | null) => void;
  extraActions?: ReactNode;
}) {
  const item = items[index];
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // aviso no centro da tela ao salvar o corte: carregando → "Foto salva" (some sozinho)
  const [toast, setToast] = useState<{ state: 'saving' | 'saved' | 'error'; detail?: string } | null>(null);

  useEffect(() => {
    if (toast?.state !== 'saved' && toast?.state !== 'error') return;
    const timer = window.setTimeout(() => setToast(null), toast.state === 'saved' ? 1600 : 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  // ← → passam as fotos, a não ser que o foco esteja no recorte (lá as setas movem o corte) ou num campo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[role="application"], input, select, textarea')) return;
      if (event.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) onIndex(index + 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndex]);

  if (!item) return null;

  const go = (next: number) => {
    setNotice(null);
    onIndex(next);
  };

  const action = (active: boolean, activeClass: string) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-control px-3 text-xs font-semibold transition-colors ${
      active ? activeClass : 'border border-border text-ink hover:bg-surface-muted'
    }`;
  const arrow =
    'absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    <OnScreen>
      <InstagramImageEditor
        key={item.id}
        src={`/api/drive/file/${encodeURIComponent(item.id)}`}
        fileName={item.name}
        contentType="POST"
        title={
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate">{item.name}</span>
            {items.length > 1 && <span className="shrink-0 text-xs font-normal tabular-nums text-ink-muted">{index + 1} de {items.length}</span>}
          </span>
        }
        headerActions={
          <>
            {onToggleSelect && (
              <button type="button" onClick={onToggleSelect} aria-pressed={selected} className={action(Boolean(selected), 'bg-brand-plum text-white')}>
                <Check size={14} aria-hidden="true" /> {selected ? 'Escolhida' : 'Escolher'}
              </button>
            )}
            <button type="button" onClick={onToggleFavorite} aria-pressed={favorite} className={action(favorite, 'bg-amber-400 text-white')}>
              <Star size={14} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" /> Capa
            </button>
            {extraActions}
          </>
        }
        stageExtras={
          <>
            {hasPrev && (
              <button type="button" onClick={() => go(index - 1)} aria-label="Foto anterior" className={`${arrow} left-3`}>
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
            )}
            {hasNext && (
              <button type="button" onClick={() => go(index + 1)} aria-label="Próxima foto" className={`${arrow} right-3`}>
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            )}
          </>
        }
        asideTop={
          <div className="space-y-2">
            {item.edited ? (
              <div className="flex items-start justify-between gap-2 rounded-control bg-canvas p-3 text-xs">
                <p className="flex items-start gap-1.5 text-ink">
                  <Crop size={14} className="mt-px shrink-0 text-brand-plum" aria-hidden="true" />
                  <span>Já cortada: {item.edited.label} ({item.edited.width} × {item.edited.height}). Salvar de novo troca o corte.</span>
                </p>
                <button type="button" onClick={() => { onEdited(null); setNotice({ tone: 'ok', text: 'Voltou para a foto original.' }); }} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-plum hover:underline">
                  <Undo2 size={13} aria-hidden="true" /> Original
                </button>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-ink-muted">Ajuste o corte se quiser e clique em &ldquo;Salvar corte&rdquo;. Sem corte, vai a foto original.</p>
            )}
            {notice && !saving && (
              <p role="status" className={`text-xs font-medium ${notice.tone === 'ok' ? 'text-status-success' : 'text-status-danger'}`}>{notice.text}</p>
            )}
          </div>
        }
        applyLabel="Salvar corte"
        cancelLabel="Fechar"
        onCancel={onClose}
        onApply={async ({ file, format }) => {
          setSaving(true);
          setNotice(null);
          setToast({ state: 'saving' });
          try {
            const url = await uploadImage(file);
            onEdited({ url, width: format.width, height: format.height, label: `${formatPlaceLabel(format)} ${format.ratioLabel}` });
            setToast({ state: 'saved', detail: `${formatPlaceLabel(format)} ${format.ratioLabel} · ${format.width} × ${format.height}` });
          } catch (error) {
            console.error('Falha ao salvar o corte:', error);
            setToast({ state: 'error' });
          } finally {
            setSaving(false);
          }
        }}
      />

      {toast && (
        <div
          className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${toast.state === 'saving' ? 'bg-ink/30' : 'pointer-events-none'}`}
          aria-live="assertive"
        >
          <div role="status" className="toast-pop flex min-w-56 flex-col items-center gap-3 rounded-panel bg-surface px-8 py-6 text-center shadow-2xl">
            {toast.state === 'saving' && (
              <>
                <Loader2 size={30} className="animate-spin text-brand-plum motion-reduce:animate-none" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink">Salvando o corte…</p>
              </>
            )}
            {toast.state === 'saved' && (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-success text-white">
                  <Check size={26} strokeWidth={3} aria-hidden="true" />
                </span>
                <p className="text-base font-semibold text-ink">Foto salva</p>
                {toast.detail && <p className="-mt-2 text-xs text-ink-muted">{toast.detail}</p>}
              </>
            )}
            {toast.state === 'error' && (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-danger text-white">
                  <AlertCircle size={26} aria-hidden="true" />
                </span>
                <p className="text-base font-semibold text-ink">Não foi possível salvar</p>
                <p className="-mt-2 text-xs text-ink-muted">Tente de novo em instantes.</p>
              </>
            )}
          </div>
        </div>
      )}
    </OnScreen>
  );
}
