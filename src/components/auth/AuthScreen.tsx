'use client';

import { ArrowRight, BarChart2, TriangleAlert } from 'lucide-react';

interface DemoUser {
  name: string;
  email: string;
}

interface AuthScreenProps {
  onEnterDemo: (user: DemoUser) => void;
}

export function AuthScreen({ onEnterDemo }: AuthScreenProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4">
      <div className="mb-8 flex items-center gap-2 text-brand-plum">
        <BarChart2 size={32} className="rounded-lg bg-brand-plum p-1.5 text-brand-lime" />
        <h1 className="text-2xl font-bold">Bahia Homes Analytics</h1>
      </div>

      <section className="w-full max-w-md rounded-panel border border-border bg-surface p-8 shadow-xl">
        <h2 className="mb-2 text-2xl font-bold text-ink">Acesso de demonstração</h2>
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
          className="flex w-full items-center justify-center gap-2 rounded-control bg-brand-plum py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
        >
          Entrar na demonstração
          <ArrowRight size={16} />
        </button>
      </section>
    </main>
  );
}
