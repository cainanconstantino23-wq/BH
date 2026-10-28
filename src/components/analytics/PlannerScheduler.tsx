'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Calendar as CalendarIcon, List, Trash2, 
  Plus, ChevronLeft, ChevronRight, Image as ImageIcon, X, 
  Video, CalendarDays, Search
} from 'lucide-react';

import CreatePostModal from '@/components/CreatePostModal';

interface ScheduledPost {
  id: string;
  title: string;
  caption: string;
  dayIndex: number;
  dateStr: string;
  hour: number;
  timeString: string;
  image: string;
  isVideo?: boolean;
  platform: 'instagram' | 'tiktok' | 'youtube';
  postType: 'REEL' | 'POST' | 'STORY' | 'CARROSSEL';
}

// Declaração de props permitidas
export interface PlannerSchedulerProps {
  content?: any;
}

const hours = Array.from({ length: 14 }, (_, i) => i + 11);

export function PlannerScheduler({ content }: PlannerSchedulerProps = {}) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'list'>('calendar');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);

  const currentWeekDays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + distanceToMonday + (currentWeekOffset * 7));

    const dayNames = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
    const shortMonthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return Array.from({ length: 7 }).map((_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      return {
        name: dayNames[date.getDay()],
        dayNumber: date.getDate().toString(),
        monthName: shortMonthNames[date.getMonth()],
        fullDateStr: date.toISOString().split('T')[0],
        isToday: new Date().toISOString().split('T')[0] === date.toISOString().split('T')[0]
      };
    });
  }, [currentWeekOffset]);

  const currentMonthLabel = useMemo(() => {
    const midWeek = currentWeekDays[3];
    return `${midWeek.monthName} ${midWeek.fullDateStr.substring(0, 4)}`;
  }, [currentWeekDays]);

  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('scheduled_date', { ascending: true })
        .order('hour', { ascending: true });

      if (error) {
        console.error('Erro ao buscar posts:', error);
        return;
      }

      if (data) {
        const formattedPosts: ScheduledPost[] = data.map((item: any) => {
          const img = item.image_url || 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80';
          const isVid = img.startsWith('data:video') || img.endsWith('.mp4') || item.platform === 'REEL';

          return {
            id: String(item.id),
            title: item.title || 'Publicação',
            caption: item.content || '',
            dayIndex: typeof item.day_index === 'number' ? item.day_index : 0,
            dateStr: item.scheduled_date || currentWeekDays[0].fullDateStr,
            hour: typeof item.hour === 'number' ? item.hour : 19,
            timeString: item.time_string || '7:00 PM',
            image: img,
            isVideo: isVid,
            platform: 'instagram',
            postType: item.platform || 'REEL'
          };
        });

        setPosts(formattedPosts);
      }
    } catch (err) {
      console.error('Erro no fetch:', err);
    }
  }, [currentWeekDays]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleDeletePost = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta publicação?')) return;

    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) {
      alert(`Erro ao excluir: ${error.message}`);
      return;
    }

    setPosts(prev => prev.filter(p => p.id !== id));
    setSelectedPost(null);
  };

  const handleDropOnSlot = async (dayIndex: number, hour: number, dateStr: string) => {
    if (!draggedPostId) return;

    const timeString = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

    setPosts(prev => prev.map(p => {
      if (p.id === draggedPostId) {
        return { ...p, dayIndex, hour, dateStr, timeString };
      }
      return p;
    }));

    await supabase.from('posts').update({ 
      day_index: dayIndex, 
      hour: hour,
      scheduled_date: dateStr,
      time_string: timeString
    }).eq('id', draggedPostId);
    
    setDraggedPostId(null);
  };

  const sortedAndFilteredPosts = useMemo(() => {
    return posts
      .filter(p => 
        p.caption.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.title.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const dateTimeA = new Date(`${a.dateStr}T${String(a.hour).padStart(2, '0')}:00:00`).getTime();
        const dateTimeB = new Date(`${b.dateStr}T${String(b.hour).padStart(2, '0')}:00:00`).getTime();
        return dateTimeA - dateTimeB;
      });
  }, [posts, searchTerm]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* CONTROLES */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-6 text-xs font-semibold text-gray-600">
          <button 
            onClick={() => setActiveTab('calendar')} 
            className={`flex items-center gap-1.5 pb-1 font-bold ${activeTab === 'calendar' ? 'text-gray-900 border-b-2 border-amber-500' : 'hover:text-gray-900'}`}
          >
            <CalendarIcon size={14} className={activeTab === 'calendar' ? 'text-amber-500' : ''} /> Calendário
          </button>
          <button 
            onClick={() => setActiveTab('list')} 
            className={`flex items-center gap-1.5 pb-1 font-bold ${activeTab === 'list' ? 'text-gray-900 border-b-2 border-amber-500' : 'hover:text-gray-900'}`}
          >
            <List size={14} className={activeTab === 'list' ? 'text-amber-500' : ''} /> Lista de Agendamentos
          </button>
        </div>
        
        <button 
          onClick={() => setIsCreateOpen(true)} 
          className="bg-[#231b2d] hover:bg-black text-[#ccf600] px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition"
        >
          <Plus size={16} /> Criar publicação
        </button>
      </div>

      {/* FILTROS E NAVEGAÇÃO DE SEMANA */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none w-52"
            />
          </div>
          <button 
            onClick={() => setCurrentWeekOffset(0)} 
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 px-4 py-1.5 rounded-xl text-xs font-semibold"
          >
            Esta semana
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <button onClick={() => setCurrentWeekOffset(prev => prev - 1)} className="p-2 hover:bg-gray-100 text-gray-700 border-r border-gray-200">
              <ChevronLeft size={16} />
            </button>
            <button className="px-4 py-2 hover:bg-gray-100 text-gray-800 flex items-center gap-2 border-r border-gray-200">
              <CalendarDays size={16} className="text-pink-600" />
              <span className="text-xs font-bold uppercase">{currentMonthLabel}</span>
            </button>
            <button onClick={() => setCurrentWeekOffset(prev => prev + 1)} className="p-2 hover:bg-gray-100 text-gray-700">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* CALENDÁRIO / LISTA */}
      {activeTab === 'calendar' ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-x-auto select-none">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-700">
              <div className="p-3 text-center border-r border-gray-200 text-gray-400">Horário</div>
              {currentWeekDays.map((day, idx) => (
                <div key={idx} className={`p-3 text-center border-r border-gray-200 ${day.isToday ? 'bg-pink-50 text-pink-900 border-b-2 border-b-pink-500' : ''}`}>
                  <span>{day.name}</span>, <span className="font-normal">{day.dayNumber} {day.monthName}</span>
                </div>
              ))}
            </div>

            <div className="divide-y divide-gray-100">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-8 min-h-[70px]">
                  <div className="p-2 text-center text-xs text-gray-400 border-r border-gray-200 font-medium bg-gray-50/50 flex items-center justify-center">
                    {hour}:00
                  </div>
                  {currentWeekDays.map((dayObj, dayIndex) => {
                    const matchedPost = sortedAndFilteredPosts.find(p => p.dateStr === dayObj.fullDateStr && p.hour === hour);
                    return (
                      <div 
                        key={dayIndex} 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropOnSlot(dayIndex, hour, dayObj.fullDateStr)}
                        className={`border-r border-gray-100 p-1 relative transition hover:bg-pink-50/30 ${dayObj.isToday ? 'bg-pink-50/20' : ''}`}
                      >
                        {matchedPost && (
                          <div
                            draggable 
                            onDragStart={() => setDraggedPostId(matchedPost.id)} 
                            onClick={() => setSelectedPost(matchedPost)}
                            className="bg-white border-2 border-pink-400 shadow-md rounded-lg p-2 cursor-pointer hover:shadow-lg transition transform hover:-translate-y-0.5 group"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="bg-pink-100 text-pink-700 text-[10px] font-bold px-1.5 py-0.5 rounded">{matchedPost.postType}</span>
                              <span className="text-[9px] text-gray-400 font-medium">{matchedPost.timeString}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {matchedPost.isVideo ? (
                                <div className="w-8 h-8 rounded bg-gray-900 text-white flex items-center justify-center shrink-0">
                                  <Video size={14} />
                                </div>
                              ) : (
                                <img src={matchedPost.image} alt="Post" className="w-8 h-8 rounded object-cover shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-gray-900 truncate">{matchedPost.title}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <h3 className="font-bold text-sm text-gray-800">Fila de Agendamentos (Ordem de Publicação)</h3>
            <span className="text-xs text-gray-500 font-medium">{sortedAndFilteredPosts.length} publicação(ões)</span>
          </div>
          <div className="space-y-3">
            {sortedAndFilteredPosts.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhuma publicação agendada.</p>
            ) : (
              sortedAndFilteredPosts.map(post => (
                <div key={post.id} onClick={() => setSelectedPost(post)} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer flex justify-between items-center hover:border-gray-300 transition">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                      {post.isVideo ? <Video size={18} className="text-gray-700" /> : <img src={post.image} alt="Preview" className="w-full h-full object-cover" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded">{post.postType}</span>
                        <h4 className="font-bold text-xs text-gray-900">{post.title}</h4>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Data: <span className="font-semibold text-gray-700">{post.dateStr}</span> às <span className="font-semibold text-gray-700">{post.hour}:00</span> ({post.timeString})</p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeletePost(post.id); }} 
                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition"
                    title="Excluir agendamento"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <CreatePostModal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        onPostCreated={fetchPosts}
      />

      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-sm text-gray-800">{selectedPost.title}</h3>
                <p className="text-[11px] text-gray-500">{selectedPost.dateStr} às {selectedPost.hour}:00</p>
              </div>
              <button onClick={() => setSelectedPost(null)} className="text-gray-400 hover:text-black p-1">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center relative min-h-[280px]">
                {selectedPost.isVideo || selectedPost.postType === 'REEL' || selectedPost.image.startsWith('data:video') ? (
                  <video src={selectedPost.image} controls autoPlay className="max-w-full max-h-[55vh] object-contain" />
                ) : (
                  <img src={selectedPost.image} alt="Preview" className="max-w-full max-h-[55vh] object-contain" />
                )}
              </div>
              
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-700 font-medium whitespace-pre-wrap">{selectedPost.caption || "Sem legenda."}</p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <button 
                onClick={() => handleDeletePost(selectedPost.id)}
                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition"
              >
                <Trash2 size={15} />
                <span>Excluir publicação</span>
              </button>

              <button 
                onClick={() => setSelectedPost(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-4 py-2 rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}