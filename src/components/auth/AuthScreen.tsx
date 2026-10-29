'use client';

import Image from 'next/image';
import { ArrowRight, TriangleAlert } from 'lucide-react';

interface DemoUser {
  name: string;
  email: string;
}

interface AuthScreenProps {
  onEnterDemo: (user: DemoUser) => void;
}

export function AuthScreen({ onEnterDemo }: AuthScreenProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#241f1b] p-4">
      <Image
        src="/login-background.jpg"
        alt=""
        fill
        preload
        sizes="100vw"
        className="object-cover object-center"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#181612]/35" />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-8 rounded-control bg-white/95 px-5 py-3">
          <Image
            src="/bahia-homes-logo.png"
            alt="Bahia Homes"
            width={1834}
            height={276}
            className="h-auto w-56 sm:w-64"
          />
        </div>

        <section className="w-full max-w-md rounded-panel border border-white/60 bg-surface/95 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <h1 className="mb-2 text-2xl font-bold text-ink">Acesso de demonstração</h1>
          <p className="mb-6 text-sm text-ink-muted">
            Entre para explorar a interface e os dados de exemplo.
          </p>

          <div
            role="note"
            className="mb-6 flex items-start gap-3 rounded-control border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          >
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            <p>
              Este modo não autentica usuários nem protege o painel. Não use dados reais ou confidenciais.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onEnterDemo({ name: 'Demonstração', email: 'demo@bahiahomes.local' })}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-brand-plum py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
          >
            Entrar na demonstração
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </main>
  );
}
