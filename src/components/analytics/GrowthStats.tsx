'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const chartData = [
  { date: 'out 1', seguidores: 0, seguindo: 0, adquiridos: 0, perdidos: 0 },
  { date: 'out 2', seguidores: 4, seguindo: 1, adquiridos: 5, perdidos: 1 },
  { date: 'out 3', seguidores: 7, seguindo: 2, adquiridos: 8, perdidos: 3 },
  { date: 'out 4', seguidores: 5, seguindo: 2, adquiridos: 4, perdidos: 2 },
];

export function GrowthStats() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* SEÇÃO 1: CRESCIMENTO */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-xl font-bold text-gray-900">Crescimento</h2>
          
          <div className="flex gap-3 text-sm">
            <div className="bg-[#879cf6] text-white px-6 py-3 rounded-lg text-center min-w-[120px] shadow-sm">
              <span className="block font-bold text-lg">1.250</span>
              <span className="text-xs">Seguidores</span>
            </div>
            <div className="bg-[#8ccfa8] text-gray-800 px-6 py-3 rounded-lg text-center min-w-[120px] shadow-sm">
              <span className="block font-bold text-lg">450</span>
              <span className="text-xs">Seguindo</span>
            </div>
            <div className="bg-[#f3dfb9] text-gray-700 px-6 py-3 rounded-lg text-center min-w-[120px] shadow-sm">
              <span className="block font-bold text-lg">84</span>
              <span className="text-xs">Conteúdo total</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Linha - Crescimento */}
        <div className="h-64 w-full mb-8 relative">
          <div className="absolute inset-0 flex items-center justify-between px-10 pointer-events-none opacity-5">
            <span className="text-4xl font-black tracking-tighter">metricool</span>
            <span className="text-4xl font-black tracking-tighter">metricool</span>
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} ticks={[0, 2.5, 5, 7.5, 10]} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="seguidores" stroke="#879cf6" strokeWidth={3} dot={{ r: 4, fill: '#879cf6' }} />
              <Line type="monotone" dataKey="seguindo" stroke="#8ccfa8" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Caixas Cinzas Inferiores */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Seguidores', value: '1.250' },
            { label: 'Seguidores diários', value: '3,5' },
            { label: 'Seguidores por publicação', value: '12' },
            { label: 'Seguindo', value: '450' },
            { label: 'Posts diários', value: '0,5' },
            { label: 'Posts por semana', value: '3' },
          ].map((item, idx) => (
            <div key={idx} className="bg-[#eef1f5] text-gray-700 p-4 rounded-lg text-center flex flex-col justify-center items-center h-24 border border-gray-200/60">
              <span className="block font-bold text-lg mb-1 text-gray-900">{item.value}</span>
              <span className="text-[11px] leading-tight font-medium px-1 text-gray-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SEÇÃO 2: SALDO DE SEGUIDORES */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-xl font-bold text-gray-900">Saldo de seguidores</h2>
          
          <div className="flex gap-3 text-sm">
            <div className="bg-[#879cf6] text-white px-6 py-3 rounded-lg text-center min-w-[120px] shadow-sm">
              <span className="block font-bold text-lg">24</span>
              <span className="text-xs">Adquiridos</span>
            </div>
            <div className="bg-[#fca5ec] text-gray-900 px-6 py-3 rounded-lg text-center min-w-[120px] shadow-sm">
              <span className="block font-bold text-lg">6</span>
              <span className="text-xs">Perdidos</span>
            </div>
            <div className="bg-[#df9f2f] text-white px-6 py-3 rounded-lg text-center min-w-[120px] shadow-sm">
              <span className="block font-bold text-lg">18</span>
              <span className="text-xs">Saldo líquido</span>
            </div>
          </div>
        </div>

        {/* Gráfico de Linha - Saldo */}
        <div className="h-64 w-full relative">
           <div className="absolute inset-0 flex items-center justify-between px-10 pointer-events-none opacity-5">
            <span className="text-4xl font-black tracking-tighter">metricool</span>
            <span className="text-4xl font-black tracking-tighter">metricool</span>
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} ticks={[0, 2.5, 5, 7.5, 10]} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="adquiridos" stroke="#879cf6" strokeWidth={3} dot={{ r: 4, fill: '#879cf6' }} />
              <Line type="monotone" dataKey="perdidos" stroke="#fca5ec" strokeWidth={3} dot={{ r: 4, fill: '#fca5ec' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}