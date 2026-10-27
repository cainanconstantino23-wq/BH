'use client';

import { Users, Briefcase, CalendarClock, Plus, CheckCircle2, MoreVertical, Clock } from 'lucide-react';

export function AccountManagement() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Banner de Status do Plano */}
      <div className="bg-[#f4f7f4] border border-[#ccf600] rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#ccf600] p-2 rounded-full text-black">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Plano Premium Ativo</h3>
            <p className="text-sm text-gray-600">
              Gerencie publicações agendadas, contas de usuário e espaços de trabalho ilimitados.
            </p>
          </div>
        </div>
        <button className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded font-semibold text-sm transition shadow-sm">
          Ver Faturas
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Módulo 1: Espaços de Trabalho (Workspaces) */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-gray-800 flex items-center gap-2">
              <Briefcase className="text-blue-500" size={20} /> Espaços de Trabalho
            </h4>
            <button className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center gap-1">
              <Plus size={16} /> Novo Espaço
            </button>
          </div>
          
          <div className="space-y-3">
            {[
              { name: 'Bahia Homes', role: 'Proprietário', users: 4 },
              { name: 'Daime Filmes', role: 'Proprietário', users: 3 },
              { name: 'Move Porto', role: 'Agência', users: 2 }
            ].map((workspace, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 border border-gray-100 rounded-lg transition group cursor-pointer">
                <div>
                  <h5 className="font-semibold text-gray-900 text-sm">{workspace.name}</h5>
                  <p className="text-xs text-gray-500">{workspace.users} usuários • Nível: {workspace.role}</p>
                </div>
                <button className="text-gray-400 hover:text-gray-900">
                  <MoreVertical size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Módulo 2: Contas de Usuário (Equipe) */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-gray-800 flex items-center gap-2">
              <Users className="text-amber-500" size={20} /> Contas de Usuário
            </h4>
            <button className="text-amber-600 hover:text-amber-800 text-sm font-semibold flex items-center gap-1">
              <Plus size={16} /> Convidar
            </button>
          </div>
          
          <div className="space-y-3">
            {[
              { name: 'Cainan', email: 'cainan@daimefilmes.com', role: 'Admin' },
              { name: 'Yasmin', email: 'yasmin@daimefilmes.com', role: 'Editor' },
              { name: 'Laura', email: 'laura@bahiahomes.com', role: 'Visualizador' }
            ].map((user, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 border border-gray-100 rounded-lg transition">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <h5 className="font-semibold text-gray-900 text-sm">{user.name}</h5>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium">
                  {user.role}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Módulo 3: Publicações Agendadas (Planner) */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h4 className="font-bold text-gray-800 flex items-center gap-2">
            <CalendarClock className="text-emerald-500" size={20} /> Publicações Agendadas
          </h4>
          <button className="text-emerald-600 hover:text-emerald-800 text-sm font-semibold flex items-center gap-1">
            Abrir Planner
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-500 border-b border-gray-200 uppercase text-xs">
              <tr>
                <th className="pb-3 font-semibold">Postagem</th>
                <th className="pb-3 font-semibold">Espaço</th>
                <th className="pb-3 font-semibold">Data e Hora</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50">
                <td className="py-3 font-medium text-gray-900">Tour Casa Alto Padrão Trancoso (Reels)</td>
                <td className="py-3 text-gray-600">Bahia Homes</td>
                <td className="py-3 text-gray-600 flex items-center gap-1">
                  <Clock size={14} className="text-gray-400" /> Amanhã, 18:00
                </td>
                <td className="py-3">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">Agendado</span>
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-3 font-medium text-gray-900">Institucional Move Porto (Vídeo)</td>
                <td className="py-3 text-gray-600">Move Porto</td>
                <td className="py-3 text-gray-600 flex items-center gap-1">
                  <Clock size={14} className="text-gray-400" /> 25 Out, 12:30
                </td>
                <td className="py-3">
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-bold">Em Revisão</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}