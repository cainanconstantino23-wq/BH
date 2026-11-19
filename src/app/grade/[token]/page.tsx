'use client';

import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { FeedGridEditor } from '@/components/grade/FeedGridEditor';
import { ApproverPhotoViewer, type CropSize } from '@/components/capa/ApproverPhotoViewer';
import { formatLongStamp, type CoverPhoto } from '@/lib/covers';
import { periodLabel, postDates, setCover, toLayout, type PlanCandidate, type PlanHouse, type PublicFeedPlan } from '@/lib/feedPlan';

// Link da Thereza para a grade do feed dos próximos dias (sem login).
// Ela vê como o feed vai ficar, arrasta para trocar, toca num post para escolher a capa ou trocar a casa,
// e aprova a grade. Cada mudança é salva sozinha (PUT), para não perder se fechar.
// Na casa: tocar na foto abre a foto inteira em tela grande (cortar, próxima, usar como capa);
// "ver mais fotos da casa" mostra a pasta da casa no Drive (só leitura) para ela escolher outra capa;
// "Não quero esta casa" tira a casa da grade e avisa a equipe para colocar outra.

/** Foto do link da grade no formato que a tela grande usa. */
const asPhoto = (candidate: { driveId: string; name: string; editedUrl?: string | null }): CoverPhoto => ({
  driveId: candidate.driveId,
  name: candidate.name,
  width: null,
  height: null,
  favorite: false,
  approved: false,
  edited: candidate.editedUrl ? { url: candidate.editedUrl, width: 0, height: 0, label: '' } : null,
  addedBy: null,
  addedAt: null,
  favoritedBy: null,
  favoritedAt: null,
  favoritedByApprover: false,
  approvedBy: null,
  approvedAt: null,
  editedBy: null,
  editedAt: null,
});

type Viewer = { collectionId: number; source: 'casa' | 'pasta'; index: number };
type MorePhotos = { collectionId: number; status: 'loading' | 'error' } | { collectionId: number; status: 'ready'; photos: CoverPhoto[] };

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; data: PublicFeedPlan };

export default function FeedPlanLinkPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? decodeURIComponent(params.token).trim() : '';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [houses, setHouses] = useState<PlanHouse[]>([]);
  const [feedback, setFeedback] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const saveTimer = useRef<number | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [more, setMore] = useState<MorePhotos | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  // cortes feitos por ela nesta visita: só esses podem voltar à original
  const [myCrops, setMyCrops] = useState<Set<string>>(new Set());
  const api = `/api/grade-link/${encodeURIComponent(token)}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(api, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState({ status: 'missing' });
        const data = (await response.json()) as PublicFeedPlan;
        setState({ status: 'ready', data });
        setHouses(data.houses);
        setFeedback(data.feedback);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'missing' });
      });
    return () => controller.abort();
  }, [api]);

  const image = useCallback(
    (candidate: PlanCandidate, size: number) => candidate.editedUrl ?? `${api}/thumb/${encodeURIComponent(candidate.driveId)}?s=${size}`,
    [api],
  );

  // salva sozinho um pouco depois de cada mudança
  const change = (next: PlanHouse[]) => {
    setHouses(next);
    setSent(false);
    setSaveState('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const response = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: toLayout(next) }) }).catch(() => null);
      setSaveState(response?.ok ? 'saved' : 'error');
    }, 700);
  };

  // ---- casa aberta: tela grande, corte, mais fotos da pasta, recusar ----
  const houseOf = (collectionId: number) => houses.find((house) => house.collectionId === collectionId);
  const thumb = (collectionId: number, driveId: string, size: number) => `${api}/thumb/${encodeURIComponent(driveId)}?s=${size}&casa=${collectionId}`;

  /** Põe (ou atualiza) uma foto nas candidatas da casa e, se pedido, usa como capa. */
  const putCandidate = (collectionId: number, candidate: PlanCandidate, makeCover: boolean) => {
    const next = houses.map((house) => {
      if (house.collectionId !== collectionId) return house;
      const exists = house.candidates.some((item) => item.driveId === candidate.driveId);
      const candidates = exists ? house.candidates.map((item) => (item.driveId === candidate.driveId ? candidate : item)) : [...house.candidates, candidate];
      return { ...house, candidates, coverDriveId: makeCover ? candidate.driveId : house.coverDriveId };
    });
    change(next);
  };

  const openFolder = async (collectionId: number) => {
    setPhotoError('');
    setMore({ collectionId, status: 'loading' });
    const response = await fetch(`${api}/folder?casa=${collectionId}`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return setMore({ collectionId, status: 'error' });
    const body = (await response.json()) as { photos: { driveId: string; name: string }[] };
    setMore({ collectionId, status: 'ready', photos: body.photos.map((photo) => asPhoto(photo)) });
  };

  const chooseCover = async (collectionId: number, photo: CoverPhoto, source: Viewer['source']) => {
    const house = houseOf(collectionId);
    if (!house || house.coverDriveId === photo.driveId) return;
    if (source === 'casa' || house.candidates.some((item) => item.driveId === photo.driveId)) {
      change(setCover(houses, collectionId, photo.driveId));
      return;
    }
    // foto da pasta da casa: entra nas candidatas (registrada como escolha dela) e vira a capa
    setPhotoBusy(true);
    setPhotoError('');
    const response = await fetch(`${api}/photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId, fileId: photo.driveId }) }).catch(() => null);
    setPhotoBusy(false);
    if (!response?.ok) return setPhotoError('Não foi possível usar esta foto. Tente de novo.');
    const body = (await response.json()) as { candidate: PlanCandidate };
    putCandidate(collectionId, body.candidate, true);
  };

  const saveCrop = async (collectionId: number, photo: CoverPhoto, file: File, size: CropSize, source: Viewer['source']) => {
    setPhotoBusy(true);
    setPhotoError('');
    const form = new FormData();
    form.set('collectionId', String(collectionId));
    form.set('fileId', photo.driveId);
    form.set('file', file);
    form.set('width', String(size.width));
    form.set('height', String(size.height));
    form.set('label', size.label);
    const response = await fetch(`${api}/crop`, { method: 'POST', body: form }).catch(() => null);
    setPhotoBusy(false);
    if (!response?.ok) {
      setPhotoError('Não foi possível salvar o corte. Tente de novo.');
      return false;
    }
    const body = (await response.json()) as { candidate: PlanCandidate };
    setMyCrops((current) => new Set(current).add(photo.driveId));
    // corte de uma foto da pasta da casa = ela quer essa foto: entra nas candidatas como capa
    putCandidate(collectionId, body.candidate, source === 'pasta');
    if (source === 'pasta') setMore((current) => (current?.status === 'ready' ? { ...current, photos: current.photos.map((item) => (item.driveId === photo.driveId ? asPhoto(body.candidate) : item)) } : current));
    return true;
  };

  const undoCrop = async (collectionId: number, photo: CoverPhoto) => {
    setPhotoBusy(true);
    setPhotoError('');
    const response = await fetch(`${api}/crop`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId, fileId: photo.driveId }) }).catch(() => null);
    setPhotoBusy(false);
    if (!response?.ok) return setPhotoError('Não foi possível voltar à foto original.');
    putCandidate(collectionId, { driveId: photo.driveId, name: photo.name, editedUrl: null }, false);
    setMore((current) => (current?.status === 'ready' ? { ...current, photos: current.photos.map((item) => (item.driveId === photo.driveId ? { ...item, edited: null } : item)) } : current));
  };

  const rejectHouse = async (house: PlanHouse, motivo: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const response = await fetch(`${api}/recusar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collectionId: house.collectionId, motivo }) }).catch(() => null);
    if (!response?.ok) {
      setError('Não foi possível tirar a casa. Tente de novo.');
      return false;
    }
    change(houses.filter((item) => item.collectionId !== house.collectionId));
    return true;
  };

  const approve = async () => {
    setSending(true);
    setError('');
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: toLayout(houses), feedback }),
    }).catch(() => null);
    setSending(false);
    if (response?.ok) {
      setSent(true);
      setState((current) => (current.status === 'ready' ? { status: 'ready', data: { ...current.data, status: 'aprovado', respondedAt: new Date().toISOString() } } : current));
    } else {
      setError('Não foi possível enviar. Tente de novo em instantes.');
    }
  };

  const data = state.status === 'ready' ? state.data : null;
  // tela grande aberta: a casa e as fotos (candidatas da casa ou a pasta da casa no Drive)
  const viewerHouse = viewer ? houses.find((item) => item.collectionId === viewer.collectionId) : undefined;
  const viewerPhotos = !viewer ? [] : viewer.source === 'casa' ? (viewerHouse?.candidates ?? []).map(asPhoto) : more?.status === 'ready' ? more.photos : [];
  const freeDays = data ? postDates(data.startDate, data.days).filter((date) => !houses.some((house) => house.slotDate === date)).length : 0;

  return (
    <main className="min-h-dvh bg-bh-cal font-display text-bh-tinta antialiased">
      <div className="mx-auto max-w-3xl px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-8 lg:pt-10">
        <Image src="/bahia-homes-logo.png" alt="Bahia Homes" width={1834} height={276} priority className="h-auto w-32 mix-blend-multiply sm:w-36" />

        {state.status === 'loading' && (
          <div className="py-24 text-center">
            <LoaderCircle aria-hidden="true" size={22} className="mx-auto animate-spin text-bh-mata motion-reduce:animate-none" />
            <p role="status" className="mt-3 text-base">Carregando a grade…</p>
          </div>
        )}

        {state.status === 'missing' && (
          <div className="mx-auto max-w-sm py-24 text-center">
            <h1 className="text-[1.75rem] font-light leading-tight">Este link não está disponível</h1>
            <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave">Peça o link atualizado à equipe Bahia Homes.</p>
          </div>
        )}

        {data && (
          <>
            <header className="mt-8 max-w-2xl lg:mt-12">
              <p className="text-[0.95rem] text-bh-tinta-suave">Feed de {periodLabel(data.startDate, data.days)}</p>
              <h1 className="mt-1 text-[2.25rem] font-light leading-[1.05] sm:text-[3rem]">Aprove a grade</h1>
              <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave sm:text-[1.0625rem]">
                É assim que o feed vai ficar, com o mais novo em cima. Arraste um post para trocar de lugar (no celular, segure e arraste).
                Toque num post para ver as fotos grandes, cortar, escolher outra capa (também entre as outras fotos da casa) ou trocar a casa. Domingo é dia de Reels.
              </p>
            </header>

            <div className="mt-8">
              <FeedGridEditor
                houses={houses}
                startDate={data.startDate}
                days={data.days}
                published={data.published}
                imageSrc={image}
                onChange={change}
                photoTools={{
                  overlayOpen: viewer !== null || more !== null,
                  onView: (house, driveId) =>
                    setViewer({ collectionId: house.collectionId, source: 'casa', index: Math.max(0, house.candidates.findIndex((item) => item.driveId === driveId)) }),
                  onFindMore: (house) => void openFolder(house.collectionId),
                  onReject: rejectHouse,
                }}
              />
            </div>

            <label className="mt-8 block">
              <span className="text-[0.95rem] text-bh-tinta-suave">Comentário para a equipe (opcional)</span>
              <textarea
                value={feedback}
                onChange={(event) => {
                  setFeedback(event.target.value);
                  setSent(false);
                }}
                rows={3}
                maxLength={2000}
                className="mt-2 w-full rounded-xl border border-bh-linha bg-bh-papel p-4 text-base focus-visible:outline-2 focus-visible:outline-bh-mata"
              />
            </label>
          </>
        )}
      </div>

      {data && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-bh-linha bg-bh-papel/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <p role="status" className="text-[0.95rem] text-bh-tinta-suave">
              {error ? <span className="text-bh-madeira">{error}</span>
                : sent ? 'Grade aprovada. Obrigado! A equipe já foi avisada.'
                : saveState === 'saving' ? 'Salvando…'
                : saveState === 'error' ? <span className="text-bh-madeira">Não foi possível salvar a última mudança.</span>
                : data.status === 'aprovado' && data.respondedAt ? `Aprovada em ${formatLongStamp(data.respondedAt)}. Se mudar algo, aprove de novo.`
                : freeDays > 0 ? `${freeDays} ${freeDays === 1 ? 'dia sem casa' : 'dias sem casa'}.`
                : saveState === 'saved' ? 'Mudanças salvas.'
                : 'Quando estiver equilibrada, aprove a grade.'}
            </p>
            <button
              type="button"
              onClick={() => void approve()}
              disabled={sending || saveState === 'saving'}
              className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-bh-mata px-6 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
              {data.status === 'aprovado' ? 'Aprovar de novo' : 'Aprovar grade'}
            </button>
          </div>
        </div>
      )}
      {more && (() => {
        const house = houses.find((item) => item.collectionId === more.collectionId);
        return (
          <div role="dialog" aria-modal="true" aria-label="Mais fotos da casa" className="fixed inset-0 z-[90] flex flex-col bg-bh-cal">
            <div className="border-b border-bh-linha bg-bh-papel/95 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-8">
              <div className="mx-auto flex max-w-4xl items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.5rem] font-light leading-tight">Mais fotos {house ? `· ${house.label}` : 'da casa'}</h2>
                  <p className="mt-1 text-[0.95rem] text-bh-tinta-suave">Toque numa foto para ver grande, cortar e usar como capa.</p>
                </div>
                <button type="button" autoFocus onClick={() => setMore(null)} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-bh-linha/50">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              {more.status === 'loading' && (
                <p role="status" className="mx-auto flex max-w-4xl items-center gap-2 text-[0.95rem] text-bh-tinta-suave">
                  <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Abrindo a pasta da casa…
                </p>
              )}
              {more.status === 'error' && <p className="mx-auto max-w-4xl text-[0.95rem] text-bh-madeira">Não foi possível abrir a pasta da casa agora. Feche e tente de novo.</p>}
              {more.status === 'ready' && more.photos.length === 0 && <p className="mx-auto max-w-4xl text-[0.95rem] text-bh-tinta-suave">Não há outras fotos na pasta desta casa.</p>}
              {more.status === 'ready' && (
                <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
                  {more.photos.map((photo, index) => {
                    const isCover = house?.coverDriveId === photo.driveId;
                    return (
                      <li key={photo.driveId}>
                        <button
                          type="button"
                          onClick={() => setViewer({ collectionId: more.collectionId, source: 'pasta', index })}
                          className={`relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-bh-azul focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-mata ${isCover ? 'ring-4 ring-bh-mata ring-offset-2 ring-offset-bh-cal' : ''}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                          <img src={photo.edited?.url ?? thumb(more.collectionId, photo.driveId, 600)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          {isCover && <span className="absolute inset-x-2 bottom-2 rounded-full bg-bh-papel/95 px-2 py-1 text-center text-[0.8125rem] font-medium text-bh-tinta">Capa escolhida</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      {viewer && viewerHouse && viewerPhotos[viewer.index] && (
          <ApproverPhotoViewer
            photos={viewerPhotos}
            index={viewer.index}
            onIndex={(index) => setViewer({ ...viewer, index })}
            onClose={() => {
              setViewer(null);
              setPhotoError('');
            }}
            title={viewerHouse.label}
            layerClass="z-[95]"
            toggleKind="capa"
            startCropping={viewer.source === 'casa'}
            src={(photo, size) => photo.edited?.url ?? thumb(viewerHouse.collectionId, photo.driveId, size)}
            originalSrc={(photo) => thumb(viewerHouse.collectionId, photo.driveId, 4000)}
            isFavorite={(photo) => viewerHouse.coverDriveId === photo.driveId || (!viewerHouse.coverDriveId && viewerHouse.candidates[0]?.driveId === photo.driveId)}
            onToggleFavorite={(photo) => void chooseCover(viewerHouse.collectionId, photo, viewer.source)}
            canUndo={(photo) => myCrops.has(photo.driveId)}
            onUndoCrop={(photo) => undoCrop(viewerHouse.collectionId, photo)}
            saving={photoBusy}
            onSaveCrop={(photo, file, size) => saveCrop(viewerHouse.collectionId, photo, file, size, viewer.source)}
          />
      )}

      {photoError && (viewer || more) && (
        <p role="alert" className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-w-md rounded-full bg-bh-madeira px-4 py-2 text-center text-[0.95rem] text-white shadow-lg">
          {photoError}
        </p>
      )}
    </main>
  );
}
