'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Crop, LoaderCircle, Search, Star, X } from 'lucide-react';
import { APPROVER_LABEL, APPROVER_NAME, formatLongStamp, type CoverPhoto, type EditedImage, type PublicCoverCollection } from '@/lib/covers';
import { OnScreen } from '@/components/drive/OnScreen';
import { ApproverPhotoViewer } from '@/components/capa/ApproverPhotoViewer';

// Link para a aprovadora: mostra as fotos escolhidas pelo social media. Ela toca numa foto e abre a tela grande
// (foto inteira): corta ali mesmo, salva o corte e passa para a próxima. No fim aprova a seleção (a equipe é notificada).
// Se quiser outras, "Encontrar mais fotos" mostra as demais fotos da casa: ela mesma põe na seleção.

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
  // fotos do carrossel que ela mesma pôs nas capas (gravadas ao enviar)
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  // pasta da casa no Drive (carregada ao abrir "Encontrar mais fotos")
  const [folder, setFolder] = useState<{ status: 'idle' | 'loading' | 'error' } | { status: 'ready'; photos: CoverPhoto[] }>({ status: 'idle' });
  // corte: envio em andamento e aviso
  const [cropBusy, setCropBusy] = useState<string | null>(null);
  const [cropError, setCropError] = useState('');
  // tela grande: índice da foto aberta na seleção e em "Encontrar mais fotos"
  const [viewing, setViewing] = useState<number | null>(null);
  const [viewingMore, setViewingMore] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/capa-link/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState({ status: 'missing' });
        const data = (await response.json()) as PublicCoverCollection;
        setState({ status: 'ready', data });
        // primeira vez: todas as fotos escolhidas pela equipe já vêm na seleção; depois de responder, a resposta dela
        setChosen(new Set((data.respondedAt ? data.photos.filter((photo) => photo.approved) : data.photos).map((photo) => photo.driveId)));
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

  const saveCrop = async (photo: CoverPhoto, file: File, edited: Omit<EditedImage, 'url'>): Promise<boolean> => {
    setSent(false);
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
      return true;
    } catch {
      setCropError('Não foi possível salvar o corte. Tente de novo.');
      return false;
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
      setSent(false);
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
      setError('Deixe pelo menos uma foto na seleção ou escreva um comentário.');
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
              <h1 className="mt-1 text-[2.5rem] font-light leading-[1.05] sm:text-[3.25rem]">Aprove as fotos</h1>
              <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave sm:text-[1.0625rem]">
                {capas.length > 0
                  ? 'Toque numa foto para ver em tamanho grande. Lá você corta, salva o corte e passa para a próxima. Tire da seleção o que não quiser e, no fim, aprove a seleção.'
                  : carouselPhotos.length > 0
                    ? 'Ainda não há fotos separadas. Use “Encontrar mais fotos” para escolher entre as fotos da casa.'
                    : 'Ainda não há fotos separadas. A equipe avisa quando estiverem prontas.'}
              </p>
            </header>

            {capas.length > 0 && (
              <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:gap-x-6">
                {capas.map((photo, photoIndex) => {
                  const isChosen = chosen.has(photo.driveId);
                  const isAdded = added.has(photo.driveId) || photo.favoritedByApprover;
                  return (
                    <li key={photo.driveId} className="relative">
                      <button
                        type="button"
                        onClick={() => setViewing(photoIndex)}
                        aria-label="Ver a foto em tamanho grande, cortar e passar para a próxima"
                        className={`relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-bh-azul transition-[box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bh-mata ${
                          isChosen ? 'ring-4 ring-bh-mata ring-offset-2 ring-offset-bh-cal' : 'opacity-60'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                        <img src={image(photo, 900)} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {cropBusy === photo.driveId ? (
                          <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-bh-papel/95 px-3 py-1 text-[0.8125rem] font-medium text-bh-tinta">
                            <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Salvando…
                          </span>
                        ) : photo.edited ? (
                          <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-bh-papel/95 px-3 py-1 text-[0.8125rem] font-medium text-bh-tinta">
                            <Crop size={13} aria-hidden="true" /> Cortada
                          </span>
                        ) : isAdded ? (
                          <span className="absolute inset-x-3 bottom-3 rounded-full bg-bh-papel/95 px-3 py-1 text-center text-[0.8125rem] font-medium text-bh-tinta">
                            Adicionada por {APPROVER_NAME}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(photo.driveId)}
                        aria-pressed={isChosen}
                        aria-label={isChosen ? 'Tirar esta foto da seleção' : 'Pôr esta foto na seleção'}
                        className={`absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow ${
                          isChosen ? 'bg-bh-mata text-white' : 'bg-black/30 text-transparent hover:bg-black/50'
                        }`}
                      >
                        <Check size={18} strokeWidth={3} aria-hidden="true" />
                      </button>
                      {photo.edited && photo.editedBy === APPROVER_LABEL && photo.editedAt && (
                        <p className="mt-2 text-[0.8125rem] text-bh-tinta-suave">Cortada por você em {formatLongStamp(photo.editedAt)}</p>
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
                : sent ? 'Seleção aprovada. A equipe já foi avisada. Obrigado!'
                : chosen.size === 0 ? 'Nenhuma foto na seleção' : `${chosen.size} de ${capas.length} ${capas.length === 1 ? 'foto' : 'fotos'} na seleção`}
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-bh-mata px-6 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
              {sent ? 'Aprovada' : chosen.size === 0 ? 'Enviar comentário' : 'Aprovar seleção'}
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
                <p className="mt-1 text-[0.95rem] text-bh-tinta-suave">Toque numa foto para ver grande, passar as fotos, cortar e favoritar. As favoritas entram na sua seleção.</p>
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
              {morePhotos.map((photo, photoIndex) => {
                const isAdded = added.has(photo.driveId);
                return (
                  <li key={photo.driveId} className="relative">
                    <button
                      type="button"
                      onClick={() => setViewingMore(photoIndex)}
                      aria-label="Ver a foto em tela grande"
                      className={`relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-bh-azul transition-shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bh-mata ${
                        isAdded ? 'ring-4 ring-bh-mata ring-offset-2 ring-offset-bh-cal' : ''
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Drive pelo servidor */}
                      <img src={image(photo, 900)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {photo.edited && (
                        <span className="absolute inset-x-3 bottom-3 rounded-full bg-bh-papel/95 px-3 py-1 text-center text-[0.8125rem] font-medium text-bh-tinta">Cortada</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAdded(photo.driveId)}
                      aria-pressed={isAdded}
                      aria-label={isAdded ? 'Tirar dos favoritos' : 'Favoritar esta foto'}
                      className={`absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow ${
                        isAdded ? 'bg-bh-mata text-white' : 'bg-black/30 text-white hover:bg-black/50'
                      }`}
                    >
                      <Star size={18} aria-hidden="true" fill={isAdded ? 'currentColor' : 'none'} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="border-t border-bh-linha bg-bh-papel/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-8">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              <p className="text-[0.95rem] text-bh-tinta-suave">
                {cropError ? <span className="text-bh-madeira">{cropError}</span> : added.size === 0 ? 'Nenhuma foto favoritada' : `${added.size} ${added.size === 1 ? 'foto favoritada' : 'fotos favoritadas'}`}
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

      {viewing !== null && capas[viewing] && (
        <OnScreen>
          <ApproverPhotoViewer
            photos={capas}
            index={viewing}
            onIndex={setViewing}
            onClose={() => setViewing(null)}
            src={image}
            originalSrc={(photo) => `/api/capa-link/${encodeURIComponent(token)}/thumb/${encodeURIComponent(photo.driveId)}?s=4000`}
            toggleKind="selecao"
            isFavorite={(photo) => chosen.has(photo.driveId)}
            onToggleFavorite={(photo) => toggle(photo.driveId)}
            canUndo={(photo) => photo.editedBy === APPROVER_LABEL}
            onUndoCrop={undoCrop}
            saving={cropBusy !== null}
            onSaveCrop={async (photo, file, size) => {
              const ok = await saveCrop(photo, file, size);
              // foto cortada entra na seleção
              if (ok && !chosen.has(photo.driveId)) toggle(photo.driveId);
              return ok;
            }}
          />
        </OnScreen>
      )}

      {viewingMore !== null && morePhotos[viewingMore] && (
        <OnScreen>
          <ApproverPhotoViewer
            photos={morePhotos}
            index={viewingMore}
            onIndex={setViewingMore}
            onClose={() => setViewingMore(null)}
            src={image}
            originalSrc={(photo) => `/api/capa-link/${encodeURIComponent(token)}/thumb/${encodeURIComponent(photo.driveId)}?s=4000`}
            isFavorite={(photo) => added.has(photo.driveId)}
            onToggleFavorite={(photo) => toggleAdded(photo.driveId)}
            saving={cropBusy !== null}
            onSaveCrop={async (photo, file, size) => {
              const ok = await saveCrop(photo, file, size);
              // foto cortada entra nas favoritas (o servidor já a pôs na pasta de capa)
              if (ok && !added.has(photo.driveId)) toggleAdded(photo.driveId);
              return ok;
            }}
          />
        </OnScreen>
      )}

    </main>
  );
}
