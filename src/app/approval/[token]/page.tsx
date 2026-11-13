'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useParams } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import {
  ClientApprovalView,
  type ApprovalDecision,
  type ClientApprovalPost,
} from '@/components/approval/ClientApprovalView';

// Usado só para a presença em tempo real (canal Realtime); os dados do post
// vêm de /api/approval/[token], que roda no servidor.
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; post: ClientApprovalPost };

const responseErrors: Record<string, string> = {
  already_answered: 'Este conteúdo já foi respondido.',
  new_version: 'A equipe acabou de enviar uma versão nova. Veja a versão atual e responda de novo.',
  feedback_required: 'Descreva o que precisa mudar.',
  feedback_too_long: 'O comentário passou de 2.000 caracteres.',
  not_found: 'Este link não está mais disponível.',
};

export default function ClientApprovalPage() {
  const params = useParams();
  const rawToken = typeof params?.token === 'string' ? params.token : '';
  // Limpeza automática do token: remove parênteses, %29 ou espaços acidentais da URL
  const token = rawToken ? decodeURIComponent(rawToken).replace(/[()]/g, '').trim() : '';

  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/approval/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setState({ status: 'missing' });
        const { post } = (await response.json()) as { post: ClientApprovalPost };
        setState({ status: 'ready', post });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Falha ao carregar conteúdo para aprovação:', error);
        setState({ status: 'missing' });
      });

    return () => controller.abort();
  }, [token]);

  const isReady = state.status === 'ready';

  // Registra presença em tempo real quando o cliente está com a página aberta
  useEffect(() => {
    if (!token || !isReady) return;

    const channel = supabasePublic.channel(`approval_${token}`);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    return () => {
      void supabasePublic.removeChannel(channel);
    };
  }, [token, isReady]);

  const handleRespond = async (decision: ApprovalDecision, feedback: string, version: number) => {
    const response = await fetch(`/api/approval/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, feedback, version }),
    });
    const result = (await response.json().catch(() => ({}))) as { post?: ClientApprovalPost; error?: string };

    if (result.post && (response.ok || result.error === 'already_answered' || result.error === 'new_version')) {
      setState({ status: 'ready', post: result.post });
      if (response.ok) return;
    }
    throw new Error(responseErrors[result.error ?? ''] ?? `erro ${response.status}`);
  };

  if (state.status === 'loading') {
    return (
      <StatusScreen>
        <LoaderCircle aria-hidden="true" size={22} className="mx-auto animate-spin text-bh-mata motion-reduce:animate-none" />
        <p role="status" className="mt-3 text-base text-bh-tinta">
          Carregando conteúdo…
        </p>
      </StatusScreen>
    );
  }

  if (state.status === 'missing') {
    return (
      <StatusScreen>
        <h1 className="text-[1.75rem] font-light leading-tight text-bh-tinta">Este link não está disponível</h1>
        <p className="mt-3 text-base leading-relaxed text-bh-tinta-suave">
          Ele pode ter sido copiado pela metade ou o conteúdo foi removido. Peça um novo link à equipe Bahia Homes.
        </p>
      </StatusScreen>
    );
  }

  return <ClientApprovalView key={state.post.currentVersion ?? 1} post={state.post} onRespond={handleRespond} />;
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bh-cal px-5 py-10 font-display text-bh-tinta antialiased">
      <div className="w-full max-w-sm text-center">
        <Image
          src="/bahia-homes-logo.png"
          alt="Bahia Homes"
          width={1834}
          height={276}
          priority
          className="mx-auto mb-10 h-auto w-36 mix-blend-multiply"
        />
        {children}
      </div>
    </main>
  );
}
