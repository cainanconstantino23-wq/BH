'use client';

import { Users, Briefcase, CalendarClock, Plus, CheckCircle2, MoreVertical, Clock } from 'lucide-react';

export function AccountManagement() {
  return (
    <div className="section-enter space-y-6">
      
      {/* Banner de Status do Plano */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-panel border border-status-success-border bg-status-success-soft p-5 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-status-success text-white">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">Plano Premium Ativo</h3>
            <p className="text-sm leading-relaxed text-ink-muted">
              Gerencie publicações agendadas, contas de usuário e espaços de trabalho ilimitados.
            </p>
          </div>
        </div>
        <button className="min-h-11 rounded-control border border-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-canvas">
          Ver Faturas
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Módulo 1: Espaços de Trabalho (Workspaces) */}
        <section className="rounded-panel border border-border bg-surface p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 font-semibold text-ink">
              <Briefcase className="text-brand-plum" size={20} /> Espaços de Trabalho
            </h4>
            <button className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-plum transition-colors hover:text-brand-plum-hover">
              <Plus size={16} /> Novo Espaço
            </button>
          </div>
          
          <div className="divide-y divide-border">
            {[
              { name: 'Bahia Homes', role: 'Proprietário', users: 4 },
              { name: 'Daime Filmes', role: 'Proprietário', users: 3 },
              { name: 'Move Porto', role: 'Agência', users: 2 }
            ].map((workspace, idx) => (
              <div key={idx} className="group flex cursor-pointer items-center justify-between gap-3 py-3 transition-colors hover:bg-canvas">
                <div>
                  <h5 className="text-sm font-semibold text-ink">{workspace.name}</h5>
                  <p className="text-xs text-ink-muted">{workspace.users} usuários • Nível: {workspace.role}</p>
                </div>
                <button aria-label={`Opções de ${workspace.name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink">
                  <MoreVertical size={16} />
                </button>
              </div>
            ))}
          </div>
      </section>

        {/* Módulo 2: Contas de Usuário (Equipe) */}
        <section className="rounded-panel border border-border bg-surface p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 font-semibold text-ink">
              <Users className="text-brand-plum" size={20} /> Contas de Usuário
            </h4>
            <button className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-plum transition-colors hover:text-brand-plum-hover">
              <Plus size={16} /> Convidar
            </button>
          </div>
          
          <div className="divide-y divide-border">
            {[
              { name: 'Cainan', email: 'cainan@daimefilmes.com', role: 'Admin' },
              { name: 'Yasmin', email: 'yasmin@daimefilmes.com', role: 'Editor' },
              { name: 'Laura', email: 'laura@bahiahomes.com', role: 'Visualizador' }
            ].map((user, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-canvas">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-brand-plum">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-ink">{user.name}</h5>
                    <p className="text-xs text-ink-muted">{user.email}</p>
                  </div>
                </div>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
                  {user.role}
                </span>
              </div>
            ))}
          </div>
      </section>

      </div>

      {/* Módulo 3: Publicações Agendadas (Planner) */}
      <section className="rounded-panel border border-border bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 font-semibold text-ink">
            <CalendarClock className="text-brand-plum" size={20} /> Publicações Agendadas
          </h4>
          <button className="flex min-h-11 items-center text-sm font-semibold text-brand-plum transition-colors hover:text-brand-plum-hover">
            Abrir Planner
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-ink-muted">
              <tr>
                <th className="pb-3 font-semibold">Postagem</th>
                <th className="pb-3 font-semibold">Espaço</th>
                <th className="pb-3 font-semibold">Data e Hora</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="transition-colors hover:bg-canvas">
                <td className="py-3 font-medium text-ink">Tour Casa Alto Padrão Trancoso (Reels)</td>
                <td className="py-3 text-ink-muted">Bahia Homes</td>
                <td className="py-3 text-ink-muted">
                  <div className="flex items-center gap-1">
                    <Clock size={14} aria-hidden="true" /> Amanhã, 18:00
                  </div>
                </td>
                <td className="py-3">
                  <span className="rounded-full border border-status-success-border bg-status-success-soft px-2.5 py-1 text-xs font-semibold text-status-success">Agendado</span>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-canvas">
                <td className="py-3 font-medium text-ink">Institucional Move Porto (Vídeo)</td>
                <td className="py-3 text-ink-muted">Move Porto</td>
                <td className="py-3 text-ink-muted">
                  <div className="flex items-center gap-1">
                    <Clock size={14} aria-hidden="true" /> 25 Out, 12:30
                  </div>
                </td>
                <td className="py-3">
                  <span className="rounded-full border border-status-warning-border bg-status-warning-soft px-2.5 py-1 text-xs font-semibold text-status-warning">Em Revisão</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}