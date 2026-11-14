'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Expand, LoaderCircle, X } from 'lucide-react';
import type { CoverPhoto, PublicCoverCollection } from '@/lib/covers';

// Link para a aprovadora: mostra só as fotos favoritadas para capa; ela escolhe a(s) capa(s) e pode comentar.

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

  const toggle = (id: string) => {
    setSent(false);
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        body: JSON.stringify({ approved: [...chosen], feedback }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSent(true);
    } catch {
      setError('Não foi possível enviar agora. Tente de novo em instantes.');
    } finally {
      setSending(false);
    }
  };

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
                {state.data.photos.length === 0
                  ? 'Ainda não há fotos separadas para capa. A equipe avisa quando estiverem prontas.'
                  : 'Toque nas fotos que podem ser capa do feed. As fotos aparecem no formato da grade do perfil.'}
              </p>
            </header>

            {state.data.photos.length > 0 && (
              <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:gap-x-6">
                {state.data.photos.map((photo) => {
                  const isChosen = chosen.has(photo.driveId);
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
            )}

            {state.data.photos.length > 0 && (
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

      {state.status === 'ready' && state.data.photos.length > 0 && (
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
