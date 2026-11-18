'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Crop, Expand, LoaderCircle, Plus, Search, Undo2, X } from 'lucide-react';
import { APPROVER_LABEL, APPROVER_NAME, formatLongStamp, type CoverPhoto, type EditedImage, type PublicCoverCollection } from '@/lib/covers';
import { InstagramImageEditor } from '@/components/media/InstagramImageEditor';
import { OnScreen } from '@/components/drive/OnScreen';
import { formatPlaceLabel } from '@/lib/instagramFormats';

// Link para a aprovadora: mostra só as fotos favoritadas para capa; ela escolhe a(s) capa(s) e pode comentar.
// Se não gostar, "Encontrar mais fotos" mostra as outras fotos da pasta (as do carrossel): ela mesma põe nas capas e aprova.

const folderPhoto = (image: { driveId: string; name: string; width: number | null; height: number | null }): CoverPhoto => ({
  ...image,
  favorite: false,
  approved: false,
  edited: null,
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

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; data: PublicCoverCollection };

export default function CoverApprovalLinkPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? decodeURIComponent(params.token).trim() : '';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<CoverPhoto | null>(null);
  // fotos do carrossel que ela mesma pôs nas capas (gravadas ao enviar)
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  // pasta da casa no Drive (carregada ao abrir "Encontrar mais fotos")
  const [folder, setFolder] = useState<{ status: 'idle' | 'loading' | 'error' } | { status: 'ready'; photos: CoverPhoto[] }>({ status: 'idle' });
  // corte: foto aberta no editor, envio em andamento e aviso
  const [cropping, setCropping] = useState<CoverPhoto | null>(null);
  const [cropBusy, setCropBusy] = useState<string | null>(null);
  const [cropError, setCropError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/capa-link/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState({ status: 'missing' });
        const data = (await response.json()) as PublicCoverCollection;
        setState({ status: 'ready', data });
        setChosen(new Set(data.photos.filter((photo) => photo.approved).map((photo) => photo.driveId)));
        setFeedback(data.feedback);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'missing' });
      });
    return () => controller.abort();
  }, [token]);

  const image = (photo: CoverPhoto, size: number) =>
    photo.edited?.url ??
    `/api/capa-link/${encodeURIComponent(token)}/thumb/${encodeURIComponent(photo.driveId)}?s=${size}`;

  // atualiza o corte de uma foto na tela (capas e "mais fotos")
  const setEdited = (id: string, edited: EditedImage | null, editedAt: string | null) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const update = (photo: CoverPhoto) =>
        photo.driveId === id ? { ...photo, edited, editedBy: edited ? APPROVER_LABEL : null, editedAt: edited ? editedAt : null } : photo;
      return { status: 'ready', data: { ...current.data, photos: current.data.photos.map(update), morePhotos: (current.data.morePhotos ?? []).map(update) } };
    });
    setFolder((current) =>
      current.status === 'ready'
        ? { status: 'ready', photos: current.photos.map((photo) => (photo.driveId === id ? { ...photo, edited, editedBy: edited ? APPROVER_LABEL : null, editedAt: edited ? editedAt : null } : photo)) }
        : current,
    );
  };

  const openMore = async () => {
    setMoreOpen(true);
    if (folder.status === 'ready' || folder.status === 'loading') return;
    setFolder({ status: 'loading' });
    try {
      const response = await fetch(`/api/capa-link/${encodeURIComponent(token)}/folder`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { photos: { driveId: string; name: string; width: number | null; height: number | null }[] };
      setFolder({ status: 'ready', photos: body.photos.map(folderPhoto) });
    } catch {
      setFolder({ status: 'error' });
    }
  };

  const saveCrop = async (photo: CoverPhoto, file: File, edited: Omit<EditedImage, 'url'>) => {
    setCropping(null);
    setCropBusy(photo.driveId);
    setCropError('');
    try {
      const form = new FormData();
      form.set('fileId', photo.driveId);
      form.set('file', file);
      form.set('width', String(edited.width));
      form.set('height', String(edited.height));
      form.set('label', edited.label);
      const response = await fetch(`/api/capa-link/${encodeURIComponent(token)}/crop`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { edited: EditedImage; editedAt: string };
      setEdited(photo.driveId, body.edited, body.editedAt);
    } catch {
      setCropError('Não foi possível salvar o corte. Tente de novo.');
    } finally {
      setCropBusy(null);
    }
  };

  const undoCrop = async (photo: CoverPhoto) => {
    setCropBusy(photo.driveId);
    setCropError('');
    try {
      const response = await fetch(`/api/capa-link/${encodeURIComponent(token)}/crop`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: photo.driveId }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setEdited(photo.driveId, null, null);
    } catch {
      setCropError('Não foi possível voltar à foto original. Tente de novo.');
    } finally {
      setCropBusy(null);
    }
  };

  const toggle = (id: string) => {
    setSent(false);
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAdded = (id: string) => {
    setSent(false);
    const adding = !added.has(id);
    setAdded((current) => {
      const next = new Set(current);
      if (adding) next.add(id);
      else next.delete(id);
      return next;
    });
    // foto acrescentada já entra escolhida; tirada das capas sai da escolha
    setChosen((current) => {
      const next = new Set(current);
      if (adding) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const send = async () => {
    if (chosen.size === 0 && !feedback.trim()) {
      setError('Escolha pelo menos uma foto ou escreva um comentário.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/capa-link/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: [...chosen], added: [...added], feedback }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSent(true);
    } catch {
      setError('Não foi possível enviar agora. Tente de novo em instantes.');
    } finally {
      setSending(false);
    }
  };

  const carouselPhotos = state.status === 'ready' ? state.data.morePhotos ?? [] : [];
  // "mais fotos" = as outras da pasta de capa + as da pasta da casa no Drive
  const folderPhotos = folder.status === 'ready' ? folder.photos.filter((photo) => !carouselPhotos.some((other) => other.driveId === photo.driveId)) : [];
  const morePhotos = [...carouselPhotos, ...folderPhotos];
  const capas = state.status === 'ready' ? [...state.data.photos, ...morePhotos.filter((photo) => added.has(photo.driveId))] : [];
  const hasAny = state.status === 'ready' && (state.data.photos.length > 0 || carouselPhotos.length > 0);

  const moreButton = hasAny && (
    <button
      type="button"
      onClick={() => void openMore()}
      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-bh-linha bg-bh-papel px-6 text-base font-medium text-bh-tinta transition-colors hover:border-bh-mata hover:text-bh-mata focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bh-mata"
    >
      <Search size={18} aria-hidden="true" /> Encontrar mais fotos
    </button>
  );

  return (
    <main className="min-h-dvh bg-bh-cal font-display text-bh-tinta antialiased">
      <div className="mx-auto max-w-5xl px-5 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-8 lg:pt-10">
        <Image src="/bahia-homes-logo.png" alt="Bahia Homes" width={1834} height={276} priority className="h-auto w-32 mix-blend-multiply sm:w-36" />

        {state.status === 'loading' && (
          <div className="py-24 text-center">
            <LoaderCircle aria-hidden="true" size={22} className="mx-auto animate-spin text-bh-mata motion-reduce:animate-none" />
            <p role="status" className="mt-3 text-base">Carregando fotos…</p>
          </div>
        )}

        {state.status === 'missing' && (
          <div className="mx-auto max-w-sm py-24 text-center">
            <h1 className="text-[1.75rem] font-light leading-tight">Este link não está disponível</h1>
            <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave">Peça o link atualizado à equipe Bahia Homes.</p>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <header className="mt-10 max-w-2xl lg:mt-14">
              <p className="text-[0.95rem] text-bh-tinta-suave">{state.data.label}</p>
              <h1 className="mt-1 text-[2.5rem] font-light leading-[1.05] sm:text-[3.25rem]">Escolha a capa</h1>
              <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave sm:text-[1.0625rem]">
                {capas.length > 0
                  ? 'Toque nas fotos que podem ser capa do feed. As fotos aparecem no formato da grade do perfil.'
                  : carouselPhotos.length > 0
                    ? 'Ainda não há fotos marcadas para capa. Use “Encontrar mais fotos” para escolher entre as fotos da casa.'
                    : 'Ainda não há fotos separadas para capa. A equipe avisa quando estiverem prontas.'}
              </p>
            </header>

            {capas.length > 0 && (
              <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:gap-x-6">
                {capas.map((photo) => {
                  const isChosen = chosen.has(photo.driveId);
                  const isAdded = added.has(photo.driveId) || photo.favoritedByApprover;
                  return (
                    <li key={photo.driveId} className="relative">
                      <button
                        type="button"
                        onClick={() => toggle(photo.driveId)}
                        aria-pressed={isChosen}
                        aria-label={isChosen ? 'Desmarcar esta foto' : 'Escolher esta foto como capa'}
                        className={`relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-bh-azul transition-shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bh-mata ${
                          isChosen ? 'ring-4 ring-bh-mata ring-offset-2 ring-offset-bh-cal' : ''
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                        <img src={image(photo, 900)} alt="" loading="lazy" className="h-full w-full object-cover" />
                        <span
                          className={`absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white shadow ${
                            isChosen ? 'bg-bh-mata text-white' : 'bg-black/25 text-transparent'
                          }`}
                        >
                          <Check size={18} strokeWidth={3} aria-hidden="true" />
                        </span>
                        {isAdded && (
                          <span className="absolute inset-x-3 bottom-3 rounded-full bg-bh-papel/95 px-3 py-1 text-center text-[0.8125rem] font-medium text-bh-tinta">
                            Adicionada por {APPROVER_NAME}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoom(photo)}
                        aria-label="Ver a foto inteira"
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50"
                      >
                        <Expand size={16} aria-hidden="true" />
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem]">
                        {cropBusy === photo.driveId ? (
                          <span className="inline-flex min-h-9 items-center gap-1.5 text-bh-tinta-suave">
                            <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Salvando…
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setCropping(photo)}
                              className="inline-flex min-h-9 items-center gap-1.5 font-medium text-bh-mata hover:underline"
                            >
                              <Crop size={15} aria-hidden="true" /> {photo.edited ? 'Cortar de novo' : 'Cortar'}
                            </button>
                            {photo.edited && photo.editedBy === APPROVER_LABEL && (
                              <button
                                type="button"
                                onClick={() => void undoCrop(photo)}
                                className="inline-flex min-h-9 items-center gap-1.5 text-bh-tinta-suave hover:text-bh-tinta"
                              >
                                <Undo2 size={15} aria-hidden="true" /> Original
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {photo.edited && photo.editedBy === APPROVER_LABEL && photo.editedAt && (
                        <p className="text-[0.8125rem] text-bh-tinta-suave">Cortada por você em {formatLongStamp(photo.editedAt)}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {cropError && <p role="alert" className="mt-4 text-[0.95rem] text-bh-madeira">{cropError}</p>}

            {moreButton && (
              <section className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {moreButton}
                <p className="text-[0.95rem] text-bh-tinta-suave">
                  Não gostou destas? Veja as outras fotos da casa e escolha você mesma.
                </p>
              </section>
            )}

            {hasAny && (
              <section className="mt-12 max-w-2xl">
                <label htmlFor="cover-feedback" className="text-[1.0625rem] font-medium">Comentário (opcional)</label>
                <textarea
                  id="cover-feedback"
                  value={feedback}
                  onChange={(event) => { setFeedback(event.target.value); setSent(false); }}
                  rows={4}
                  maxLength={2000}
                  placeholder="Ex.: prefiro a da piscina, mas com mais céu."
                  className="mt-2 w-full rounded-xl border border-bh-linha bg-bh-papel p-4 text-base focus-visible:outline-2 focus-visible:outline-bh-mata"
                />
              </section>
            )}
          </>
        )}
      </div>

      {state.status === 'ready' && hasAny && (
        <div className="fixed inset-x-0 bottom-0 border-t border-bh-linha bg-bh-papel/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <p role="status" className="text-[0.95rem] text-bh-tinta-suave">
              {error ? <span className="text-bh-madeira">{error}</span>
                : sent ? 'Resposta enviada. Obrigado!'
                : chosen.size === 0 ? 'Nenhuma foto escolhida' : `${chosen.size} ${chosen.size === 1 ? 'foto escolhida' : 'fotos escolhidas'}`}
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-bh-mata px-6 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
              {sent ? 'Enviado' : 'Enviar escolha'}
            </button>
          </div>
        </div>
      )}

      {moreOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="more-photos-title" className="fixed inset-0 z-40 flex flex-col bg-bh-cal">
          <div className="border-b border-bh-linha bg-bh-papel/95 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur sm:px-8">
            <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
              <div>
                <h2 id="more-photos-title" className="text-[1.75rem] font-light leading-tight">Mais fotos da casa</h2>
                <p className="mt-1 text-[0.95rem] text-bh-tinta-suave">Toque nas fotos que você quer como capa. Elas entram na sua escolha.</p>
              </div>
              <button type="button" autoFocus onClick={() => setMoreOpen(false)} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-bh-linha/50">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
            {folder.status === 'loading' && (
              <p role="status" className="mx-auto mb-6 flex max-w-5xl items-center gap-2 text-[0.95rem] text-bh-tinta-suave">
                <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Abrindo a pasta da casa no Drive…
              </p>
            )}
            {folder.status === 'error' && (
              <p className="mx-auto mb-6 max-w-5xl text-[0.95rem] text-bh-madeira">Não foi possível abrir a pasta da casa agora. Feche e tente de novo.</p>
            )}
            {folder.status === 'ready' && morePhotos.length === 0 && (
              <p className="mx-auto mb-6 max-w-5xl text-[0.95rem] text-bh-tinta-suave">Não há outras fotos na pasta desta casa.</p>
            )}
            <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:gap-x-6">
              {morePhotos.map((photo) => {
                const isAdded = added.has(photo.driveId);
                return (
                  <li key={photo.driveId} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleAdded(photo.driveId)}
                      aria-pressed={isAdded}
                      aria-label={isAdded ? 'Tirar esta foto das capas' : 'Adicionar esta foto às capas'}
                      className={`relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-bh-azul transition-shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bh-mata ${
                        isAdded ? 'ring-4 ring-bh-mata ring-offset-2 ring-offset-bh-cal' : ''
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                      <img src={image(photo, 900)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      <span
                        className={`absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white shadow ${
                          isAdded ? 'bg-bh-mata text-white' : 'bg-black/25 text-white'
                        }`}
                      >
                        {isAdded ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <Plus size={18} strokeWidth={2.5} aria-hidden="true" />}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(photo)}
                      aria-label="Ver a foto inteira"
                      className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/50"
                    >
                      <Expand size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="border-t border-bh-linha bg-bh-papel/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-8">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              <p className="text-[0.95rem] text-bh-tinta-suave">
                {added.size === 0 ? 'Nenhuma foto adicionada' : `${added.size} ${added.size === 1 ? 'foto adicionada' : 'fotos adicionadas'} às capas`}
              </p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-bh-mata px-6 text-base font-medium text-white transition-opacity hover:opacity-90"
              >
                <Check size={18} aria-hidden="true" /> Pronto
              </button>
            </div>
          </div>
        </div>
      )}

      {cropping && (
        <OnScreen>
          <InstagramImageEditor
            src={`/api/capa-link/${encodeURIComponent(token)}/thumb/${encodeURIComponent(cropping.driveId)}?s=2000`}
            fileName={cropping.name || 'capa'}
            contentType="CARROSSEL"
            initialFormatId="ig-carrossel-4x5"
            title="Cortar para a capa do carrossel"
            applyLabel="Salvar corte"
            cancelLabel="Cancelar"
            onCancel={() => setCropping(null)}
            onApply={({ file, format }) =>
              void saveCrop(cropping, file, { width: format.width, height: format.height, label: `${formatPlaceLabel(format)} ${format.ratioLabel}` })
            }
          />
        </OnScreen>
      )}

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto inteira"
          onPointerDown={(event) => event.target === event.currentTarget && setZoom(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
        >
          <button type="button" autoFocus onClick={() => setZoom(null)} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center self-end rounded-full bg-white/15 text-white hover:bg-white/25">
            <X size={20} aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
          <img src={image(zoom, 1800)} alt="" className="min-h-0 max-w-full flex-1 rounded-lg object-contain" />
        </div>
      )}
    </main>
  );
}
