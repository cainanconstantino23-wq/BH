'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowLeftRight, Check, Expand, Film, Images, Plus, ThumbsDown, Undo2, X } from 'lucide-react';
import {
  coverOf,
  planSlots,
  replaceHouse,
  setCover,
  shortDay,
  swapSlots,
  type PlanCandidate,
  type PlanHouse,
  type PublishedTile,
} from '@/lib/feedPlan';

// Grade do feed dos próximos dias, do jeito que vai ficar no Instagram (mais novo em cima, à esquerda).
// Arrastar um post para outro troca os dias. Tocar num post abre a casa: escolher a capa entre as candidatas,
// trocar por uma casa da reserva ou mandar para a reserva. Domingo = Reels (só um espaço reservado, vídeos ficam de fora).
// Usado na aba da equipe e no link da Thereza.

const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 320;

type Sheet = { kind: 'day'; date: string } | { kind: 'reserve'; collectionId: number };

/** Ações extras do link da Thereza: ver a foto grande (e cortar), buscar outras fotos da casa e recusar a casa. */
export interface PhotoTools {
  onView: (house: PlanHouse, driveId: string) => void;
  onFindMore: (house: PlanHouse) => void;
  /** Recusa a casa e pede outra; devolve false se não deu certo. */
  onReject: (house: PlanHouse, motivo: string) => Promise<boolean>;
  /** Outra tela aberta por cima (tela grande / mais fotos): o Esc não fecha a casa. */
  overlayOpen: boolean;
}

export function FeedGridEditor({
  houses,
  startDate,
  days,
  published,
  imageSrc,
  onChange,
  readOnly = false,
  photoTools,
}: {
  houses: PlanHouse[];
  startDate: string;
  days: number;
  published: PublishedTile[];
  imageSrc: (candidate: PlanCandidate, size: number) => string;
  onChange: (houses: PlanHouse[]) => void;
  readOnly?: boolean;
  photoTools?: PhotoTools;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const slots = useMemo(() => [...planSlots(startDate, days)].reverse(), [startDate, days]);
  const byDate = useMemo(() => new Map(houses.filter((house) => house.slotDate).map((house) => [house.slotDate!, house])), [houses]);
  const reserve = houses.filter((house) => !house.slotDate);

  // ---- arrastar (mouse: depois de mexer alguns px; toque: segurar) ----
  const [drag, setDrag] = useState<{ date: string; x: number; y: number; over: string | null; touch: boolean } | null>(null);
  const press = useRef<{ date: string; x: number; y: number; touch: boolean; armed: boolean; timer: number | null } | null>(null);
  const suppressClick = useRef(false);
  // espelho do arrastar atual: o fim do arrastar lê daqui (chamar onChange dentro do setDrag atualizava o pai durante a renderização)
  const dragRef = useRef(drag);
  const updateDrag = useCallback((value: typeof drag) => {
    dragRef.current = value;
    setDrag(value);
  }, []);

  const targetAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot-date]');
    return element?.dataset.slotDate ?? null;
  };

  const onTilePointerDown = (event: ReactPointerEvent, date: string) => {
    if (readOnly || event.button !== 0) return;
    const touch = event.pointerType !== 'mouse';
    const state = { date, x: event.clientX, y: event.clientY, touch, armed: false, timer: null as number | null };
    if (touch) {
      state.timer = window.setTimeout(() => {
        state.armed = true;
        updateDrag({ date, x: state.x, y: state.y, over: null, touch: true });
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS);
    }
    press.current = state;
  };

  const finish = useCallback(
    (apply: boolean) => {
      const current = press.current;
      if (current?.timer) window.clearTimeout(current.timer);
      press.current = null;
      const value = dragRef.current;
      updateDrag(null);
      if (!value) return;
      suppressClick.current = true;
      if (apply && value.over && value.over !== value.date) onChange(swapSlots(houses, value.date, value.over));
    },
    [houses, onChange, updateDrag],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = press.current;
      if (!current) return;
      const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (current.touch && !current.armed) {
        // mexeu antes de segurar: é rolagem, não arrastar
        if (moved > DRAG_THRESHOLD_PX * 2) {
          if (current.timer) window.clearTimeout(current.timer);
          press.current = null;
        }
        return;
      }
      if (!current.touch && moved < DRAG_THRESHOLD_PX && !drag) return;
      const over = targetAt(event.clientX, event.clientY);
      updateDrag({ date: current.date, x: event.clientX, y: event.clientY, over: over === current.date ? null : over, touch: current.touch });
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && drag && finish(false);
    // enquanto arrasta no toque, a página não rola
    const onTouchMove = (event: TouchEvent) => {
      if (press.current?.armed) event.preventDefault();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [drag, finish, updateDrag]);

  useEffect(() => {
    document.body.style.userSelect = drag ? 'none' : '';
    document.body.style.cursor = drag && !drag.touch ? 'grabbing' : '';
  }, [drag]);

  const openDay = (date: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setSheet({ kind: 'day', date });
  };

  const dragged = drag ? byDate.get(drag.date) : undefined;
  const draggedCover = dragged ? coverOf(dragged) : null;

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-panel bg-border sm:gap-1" aria-label="Grade do feed">
        {slots.map((slot) => {
          if (slot.kind === 'reels') {
            return (
              <li key={slot.date} className="relative flex aspect-[3/4] flex-col items-center justify-center gap-1 bg-surface-muted text-center text-ink-muted">
                <Film size={20} aria-hidden="true" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">Reels</span>
                <span className="text-[11px] tabular-nums">{shortDay(slot.date)}</span>
              </li>
            );
          }
          const house = byDate.get(slot.date);
          const cover = house ? coverOf(house) : null;
          const isDragged = drag?.date === slot.date;
          const isTarget = drag?.over === slot.date;
          return (
            <li key={slot.date} data-slot-date={slot.date} className="relative aspect-[3/4] bg-surface">
              <button
                type="button"
                onPointerDown={(event) => onTilePointerDown(event, slot.date)}
                onClick={() => openDay(slot.date)}
                onContextMenu={(event) => event.preventDefault()}
                aria-label={house ? `${shortDay(slot.date)}: ${house.label}. Tocar para trocar a capa ou a casa` : `${shortDay(slot.date)}: dia livre. Tocar para escolher uma casa`}
                className={`group absolute inset-0 block h-full w-full touch-manipulation overflow-hidden text-left [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-plum ${
                  readOnly ? '' : 'cursor-grab'
                } ${isDragged ? 'opacity-35' : ''} ${isTarget ? 'ring-4 ring-inset ring-amber-400' : ''}`}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor
                  <img src={imageSrc(cover, 600)} alt="" draggable={false} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-border-strong text-ink-muted">
                    <Plus size={18} aria-hidden="true" />
                    <span className="text-[11px] font-semibold">Dia livre</span>
                  </span>
                )}
                <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white sm:text-[11px]">
                  {shortDay(slot.date)}
                </span>
                {house && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-medium text-white sm:text-xs">
                    {house.label}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {published.map((tile) => (
          <li key={tile.id} className="relative aspect-[3/4] bg-surface-muted">
            {tile.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura do Instagram
              <img src={tile.imageUrl} alt="" className="h-full w-full object-cover opacity-60 grayscale-[35%]" />
            )}
            <span className="absolute left-1 top-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {tile.isVideo ? 'Reels · no ar' : 'No ar'}
            </span>
          </li>
        ))}
      </ul>

      {published.length > 0 && <p className="-mt-4 text-xs text-ink-muted">Embaixo, mais apagados: os últimos posts que já estão no Instagram, para ver o equilíbrio.</p>}

      <section aria-labelledby="reserve-title" className="space-y-2">
        <h3 id="reserve-title" className="text-sm font-semibold text-ink">Casas na reserva ({reserve.length})</h3>
        {reserve.length === 0 ? (
          <p className="text-xs text-ink-muted">Nenhuma casa sobrando. As casas que saírem da grade aparecem aqui.</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {reserve.map((house) => {
              const cover = coverOf(house);
              return (
                <li key={house.collectionId}>
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'reserve', collectionId: house.collectionId })}
                    className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    <span className="block aspect-[3/4] overflow-hidden rounded-control bg-surface-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                      {cover && <img src={imageSrc(cover, 300)} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-ink">{house.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {drag && draggedCover && createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[90] w-24 overflow-hidden rounded-control shadow-2xl ring-2 ring-white sm:w-32"
          style={{ left: drag.x, top: drag.y, transform: drag.touch ? 'translate(-50%, -115%) rotate(-2deg)' : 'translate(-50%, -60%) rotate(-2deg)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
          <img src={imageSrc(draggedCover, 300)} alt="" className="aspect-[3/4] w-full object-cover" />
        </div>,
        document.body,
      )}

      {sheet && (
        <HouseSheet
          key={sheet.kind === 'day' ? `day-${sheet.date}-${byDate.get(sheet.date)?.collectionId ?? 'livre'}` : `reserve-${sheet.collectionId}`}
          sheet={sheet}
          houses={houses}
          postDates={slots.filter((slot) => slot.kind === 'post').map((slot) => slot.date).reverse()}
          imageSrc={imageSrc}
          readOnly={readOnly}
          photoTools={photoTools}
          onClose={() => setSheet(null)}
          onChange={(next, follow) => {
            onChange(next);
            if (follow) setSheet(follow);
          }}
        />
      )}
    </div>
  );
}

/** Janela da casa: capa (entre as candidatas), trocar a casa do dia, mandar para a reserva ou pôr no dia. */
function HouseSheet({
  sheet,
  houses,
  postDates,
  imageSrc,
  readOnly,
  photoTools,
  onClose,
  onChange,
}: {
  sheet: Sheet;
  houses: PlanHouse[];
  postDates: string[];
  imageSrc: (candidate: PlanCandidate, size: number) => string;
  readOnly: boolean;
  photoTools?: PhotoTools;
  onClose: () => void;
  onChange: (houses: PlanHouse[], follow?: Sheet) => void;
}) {
  const house = sheet.kind === 'day' ? houses.find((item) => item.slotDate === sheet.date) : houses.find((item) => item.collectionId === sheet.collectionId);
  const reserve = houses.filter((item) => !item.slotDate && item.collectionId !== house?.collectionId);
  const [choosingHouse, setChoosingHouse] = useState(!house);
  const cover = house ? coverOf(house) : null;
  const [preview, setPreview] = useState<string | null>(cover?.driveId ?? null);
  const shown = house?.candidates.find((candidate) => candidate.driveId === preview) ?? cover;
  // recusar a casa: pede confirmação e um motivo (opcional)
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  const overlayOpen = photoTools?.overlayOpen ?? false;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !overlayOpen && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, overlayOpen]);

  const title = sheet.kind === 'day' ? shortDay(sheet.date) : 'Casa na reserva';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-panel bg-surface shadow-2xl sm:rounded-panel">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
            <h2 className="truncate text-base font-semibold text-ink">{choosingHouse ? (house ? `Trocar ${house.label}` : 'Escolher uma casa para este dia') : house?.label}</h2>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Fechar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {choosingHouse ? (
            reserve.length === 0 ? (
              <p className="text-sm text-ink-muted">Não há casas na reserva para trocar.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {reserve.map((option) => {
                  const optionCover = coverOf(option);
                  return (
                    <li key={option.collectionId}>
                      <button
                        type="button"
                        disabled={readOnly || sheet.kind !== 'day'}
                        onClick={() => sheet.kind === 'day' && onChange(replaceHouse(houses, sheet.date, option.collectionId), { kind: 'day', date: sheet.date })}
                        className="block w-full text-left disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                      >
                        <span className="block aspect-[3/4] overflow-hidden rounded-control bg-surface-muted ring-1 ring-border hover:ring-2 hover:ring-amber-400">
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                          {optionCover && <img src={imageSrc(optionCover, 300)} alt="" className="h-full w-full object-cover" />}
                        </span>
                        <span className="mt-1 block truncate text-xs text-ink">{option.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : house && shown ? (
            <div className="space-y-4">
              {photoTools ? (
                <button
                  type="button"
                  onClick={() => photoTools.onView(house, shown.driveId)}
                  aria-label="Ver a foto inteira em tela grande e cortar"
                  className="group relative mx-auto block w-full max-w-xs overflow-hidden rounded-control bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                  <img key={shown.driveId} src={imageSrc(shown, 1200)} alt={shown.name} className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-black/75">
                    <Expand size={13} aria-hidden="true" /> Ver grande e cortar
                  </span>
                </button>
              ) : (
                <div className="mx-auto max-w-xs overflow-hidden rounded-control bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                  <img key={shown.driveId} src={imageSrc(shown, 1200)} alt={shown.name} className="aspect-[3/4] w-full object-cover" />
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold text-ink-muted">Capas candidatas ({house.candidates.length}) — toque para ver</p>
                <ul className="flex gap-2 overflow-x-auto pb-1">
                  {house.candidates.map((candidate) => {
                    const isCover = candidate.driveId === cover?.driveId;
                    const isShown = candidate.driveId === shown.driveId;
                    return (
                      <li key={candidate.driveId} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreview(candidate.driveId)}
                          aria-label={`${candidate.name}${isCover ? ' (capa atual)' : ''}`}
                          aria-pressed={isShown}
                          className={`relative block h-24 w-[4.5rem] overflow-hidden rounded-control ${isShown ? 'ring-2 ring-brand-plum ring-offset-2' : 'ring-1 ring-border'}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                          <img src={imageSrc(candidate, 200)} alt="" className="h-full w-full object-cover" />
                          {isCover && (
                            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-status-success text-white">
                              <Check size={12} strokeWidth={3} aria-hidden="true" />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {photoTools && !readOnly && (
                  <button
                    type="button"
                    onClick={() => photoTools.onFindMore(house)}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-semibold text-ink hover:bg-surface-muted"
                  >
                    <Images size={14} aria-hidden="true" /> Não gostei de nenhuma: ver mais fotos da casa
                  </button>
                )}
              </div>
              {photoTools && !readOnly && rejecting && (
                <div className="space-y-2 rounded-control border border-status-warning-border bg-status-warning-soft p-3">
                  <p className="text-sm font-semibold text-ink">Tirar {house.label} da grade e pedir outra casa?</p>
                  <p className="text-xs text-ink-muted">O dia fica livre e a equipe recebe um aviso para colocar outra casa.</p>
                  <textarea
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Motivo (opcional). Ex.: já postamos essa casa há pouco."
                    className="w-full rounded-control border border-border bg-surface p-2 text-sm text-ink"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={rejectBusy}
                      onClick={async () => {
                        setRejectBusy(true);
                        const ok = await photoTools.onReject(house, motivo);
                        setRejectBusy(false);
                        if (ok) onClose();
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-status-danger px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <ThumbsDown size={14} aria-hidden="true" /> {rejectBusy ? 'Enviando…' : 'Pedir outra casa'}
                    </button>
                    <button type="button" onClick={() => setRejecting(false)} className="inline-flex min-h-10 items-center rounded-control px-3 text-xs font-semibold text-ink-muted hover:bg-surface-muted">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {sheet.kind === 'reserve' && !readOnly && (
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-ink">Colocar na grade no dia</span>
                  <select
                    defaultValue=""
                    onChange={(event) => event.target.value && onChange(replaceHouse(houses, event.target.value, house.collectionId), { kind: 'day', date: event.target.value })}
                    className="min-h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink"
                  >
                    <option value="" disabled>Escolher o dia…</option>
                    {postDates.map((date) => {
                      const current = houses.find((item) => item.slotDate === date);
                      return <option key={date} value={date}>{shortDay(date)}{current ? ` (no lugar de ${current.label})` : ' (livre)'}</option>;
                    })}
                  </select>
                </label>
              )}
            </div>
          ) : null}
        </div>

        {!readOnly && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            {choosingHouse ? (
              house && (
                <button type="button" onClick={() => setChoosingHouse(false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-semibold text-ink hover:bg-surface-muted">
                  <Undo2 size={14} aria-hidden="true" /> Voltar
                </button>
              )
            ) : (
              house && (
                <>
                  {shown && shown.driveId !== cover?.driveId && (
                    <button
                      type="button"
                      onClick={() => onChange(setCover(houses, house.collectionId, shown.driveId))}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white hover:bg-brand-plum-hover"
                    >
                      <Check size={15} aria-hidden="true" /> Usar esta como capa
                    </button>
                  )}
                  {sheet.kind === 'day' && (
                    <>
                      <button type="button" onClick={() => setChoosingHouse(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-semibold text-ink hover:bg-surface-muted">
                        <ArrowLeftRight size={14} aria-hidden="true" /> Trocar a casa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(houses.map((item) => (item.collectionId === house.collectionId ? { ...item, slotDate: null } : item)));
                          onClose();
                        }}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
                      >
                        <Archive size={14} aria-hidden="true" /> Tirar da grade (vai para a reserva)
                      </button>
                    </>
                  )}
                  {photoTools && !rejecting && (
                    <button
                      type="button"
                      onClick={() => setRejecting(true)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 text-xs font-semibold text-status-danger hover:bg-status-danger-soft"
                    >
                      <ThumbsDown size={14} aria-hidden="true" /> Não quero esta casa
                    </button>
                  )}
                </>
              )
            )}
            <button type="button" onClick={onClose} className="ml-auto inline-flex min-h-10 items-center rounded-control px-3 text-xs font-semibold text-ink-muted hover:bg-surface-muted">
              Pronto
            </button>
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
