'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ChevronRight, Film, LoaderCircle, PencilLine } from 'lucide-react';
import { formatSchedule } from '@/components/approval/ClientApprovalView';
import type { ApprovalListItem } from '@/app/api/approval-list/[token]/route';

// Lista para o aprovador: todos os posts ainda não aprovados num link só.
// Cada cartão abre a página do post (/approval/[token]), que tem o botão de voltar para cá.

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; items: ApprovalListItem[] };

const coverSrc = (item: ApprovalListItem) =>
  item.mediaType === 'video' && item.coverUrl && !item.coverUrl.includes('#') ? `${item.coverUrl}#t=0.1` : item.coverUrl;

export default function ApprovalListPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? decodeURIComponent(params.token).trim() : '';
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/approval-list/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState({ status: 'missing' });
        const { items } = (await response.json()) as { items: ApprovalListItem[] };
        setState({ status: 'ready', items });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'missing' });
      });
    return () => controller.abort();
  }, [token]);

  const pending = state.status === 'ready' ? state.items.filter((item) => item.status === 'pending') : [];
  const waiting = state.status === 'ready' ? state.items.filter((item) => item.status === 'changes_requested') : [];

  return (
    <main className="min-h-dvh bg-bh-cal font-display text-bh-tinta antialiased">
      <div className="mx-auto max-w-6xl px-5 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-8 lg:pt-10">
        <Image
          src="/bahia-homes-logo.png"
          alt="Bahia Homes"
          width={1834}
          height={276}
          priority
          className="h-auto w-32 mix-blend-multiply sm:w-36"
        />

        {state.status === 'loading' && (
          <div className="py-24 text-center">
            <LoaderCircle aria-hidden="true" size={22} className="mx-auto animate-spin text-bh-mata motion-reduce:animate-none" />
            <p role="status" className="mt-3 text-base">Carregando conteúdos…</p>
          </div>
        )}

        {state.status === 'missing' && (
          <div className="mx-auto max-w-sm py-24 text-center">
            <h1 className="text-[1.75rem] font-light leading-tight">Este link não está disponível</h1>
            <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave">
              Ele pode ter sido trocado por um novo. Peça o link atualizado à equipe Bahia Homes.
            </p>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <header className="mt-10 max-w-2xl lg:mt-14">
              <h1 className="text-[2.5rem] font-light leading-[1.05] sm:text-[3.25rem]">Para aprovar</h1>
              <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave sm:text-[1.0625rem]">
                {pending.length === 0
                  ? 'Nada esperando sua resposta agora. Quando a equipe enviar algo novo, aparece aqui neste mesmo link.'
                  : `${pending.length} ${pending.length === 1 ? 'conteúdo espera' : 'conteúdos esperam'} sua resposta. Toque em um para ver, aprovar ou pedir ajustes.`}
              </p>
            </header>

            {pending.length > 0 && (
              <section aria-label="Esperando sua resposta" className="mt-8">
                <ItemGrid items={pending} listToken={token} />
              </section>
            )}

            {waiting.length > 0 && (
              <section className="mt-14 border-t border-bh-linha pt-8">
                <h2 className="text-[1.375rem] font-normal">Em ajuste pela equipe</h2>
                <p className="mt-1.5 text-[0.95rem] text-bh-tinta-suave">
                  Você pediu ajustes nestes. A nova versão aparece em &ldquo;Para aprovar&rdquo; quando a equipe enviar.
                </p>
                <div className="mt-6">
                  <ItemGrid items={waiting} listToken={token} muted />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ItemGrid({ items, listToken, muted = false }: { items: ApprovalListItem[]; listToken: string; muted?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {items.map((item) => {
        const schedule = formatSchedule(item.format, item.scheduledDate, item.scheduledTime);
        return (
          <li key={item.token}>
            <Link
              href={`/approval/${encodeURIComponent(item.token)}?lista=${encodeURIComponent(listToken)}`}
              className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bh-mata"
            >
              <div className={`relative aspect-[4/5] overflow-hidden rounded-xl bg-bh-azul ${muted ? 'opacity-70' : ''}`}>
                {item.coverUrl &&
                  (item.mediaType === 'video' ? (
                    <video src={coverSrc(item)} muted playsInline preload="metadata" aria-hidden="true" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
                  ))}
                <span className="absolute left-2 top-2 flex items-center gap-1">
                  {item.mediaType === 'video' && (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bh-tinta/70 text-white">
                      <Film size={13} aria-hidden="true" />
                      <span className="sr-only">Vídeo</span>
                    </span>
                  )}
                  {item.version > 1 && (
                    <span className="rounded-full bg-bh-papel/95 px-2 py-1 text-xs font-medium text-bh-tinta">Versão {item.version}</span>
                  )}
                </span>
              </div>
              <p className="mt-3 flex items-start justify-between gap-2 text-[1.0625rem] font-medium leading-snug">
                <span className="min-w-0 break-words">{item.houseName}</span>
                <ChevronRight aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-bh-tinta-suave transition-transform duration-150 group-hover:translate-x-0.5" />
              </p>
              {schedule && <p className="mt-1 text-[0.9rem] leading-snug text-bh-tinta-suave">{schedule}</p>}
              {item.feedback && (
                <p className="mt-2 flex items-start gap-1.5 text-[0.9rem] leading-snug text-bh-madeira">
                  <PencilLine aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{item.feedback}</span>
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
