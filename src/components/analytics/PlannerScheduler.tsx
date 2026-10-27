'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Calendar as CalendarIcon, List, BookOpen, Trash2, 
  Plus, ChevronLeft, ChevronRight, Image as ImageIcon, X, Clock, 
  Video, Sparkles, Filter, MoreVertical, Search, CalendarDays
} from 'lucide-react';

interface ScheduledPost {
  id: string;
  title: string;
  caption: string;
  dayIndex: number;
  hour: number;
  timeString: string;
  image: string;
  platform: 'instagram' | 'tiktok' | 'youtube';
  postType: 'REEL' | 'POST' | 'STORY';
}

const daysOfWeek = [
  { name: 'Segunda-Feira', date: '26' },
  { name: 'Terça-Feira', date: '27' },
  { name: 'Quarta-Feira', date: '28' },
  { name: 'Quinta-Feira', date: '29' },
  { name: 'Sexta-Feira', date: '30' },
  { name: 'Sábado', date: '31' },
  { name: 'Domingo', date: '1' },
];

const hours = Array.from({ length: 14 }, (_, i) => i + 11);

export function PlannerScheduler() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMonthViewOpen, setIsMonthViewOpen] = useState(false);
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);

  // Estados de navegação e filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);

  // Form states do modal "Criar novo post"
  const [postType, setPostType] = useState<'REEL' | 'POST' | 'STORY'>('REEL');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [targetDay, setTargetDay] = useState(3);
  const [targetHour, setTargetHour] = useState(19);

  // Carregar posts do Supabase com select leve e limite para evitar timeout
  useEffect(() => {
    async function fetchPosts() {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('id, title, content, platform, day_index, hour, time_string, image_url')
          .limit(50);

        if (error) {
          console.error('Erro detalhado do Supabase:', error);
          return;
        }

        if (data && Array.isArray(data)) {
          const formattedPosts: ScheduledPost[] = data.map((item: any) => ({
            id: String(item.id || Date.now()),
            title: item.title || 'Publicação',
            caption: item.content || '',
            dayIndex: typeof item.day_index === 'number' ? item.day_index : Number(item.day_index ?? 3),
            hour: typeof item.hour === 'number' ? item.hour : Number(item.hour ?? 19),
            timeString: item.time_string || '7:00 PM',
            image: (item.image_url && !item.image_url.startsWith('data:')) 
              ? item.image_url 
              : 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
            platform: 'instagram',
            postType: item.platform || 'REEL'
          }));

          setPosts(formattedPosts);
        }
      } catch (err) {
        console.error('Erro ao processar posts:', err);
      }
    }

    fetchPosts();
  }, []);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaUrl(reader.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();

    const titleVal = caption.slice(0, 25) || `${postType} Bahia Homes`;
    const contentVal = caption || 'Nova publicação agendada.';
    const timeStrVal = `${targetHour > 12 ? targetHour - 12 : targetHour}:00 ${targetHour >= 12 ? 'PM' : 'AM'}`;
    
    // Evita guardar strings Base64 pesadas no banco de dados para não estourar o limite
    const defaultFallbackImg = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80';
    const dbImgVal = (mediaUrl && !mediaUrl.startsWith('data:')) ? mediaUrl : defaultFallbackImg;
    const scheduledDateVal = `${daysOfWeek[targetDay].name}, ${daysOfWeek[targetDay].date} Outubro`;

    // Inserção no Supabase
    const { data, error } = await supabase.from('posts').insert([
      {
        title: titleVal,
        content: contentVal,
        platform: postType,
        day_index: targetDay,
        hour: targetHour,
        time_string: timeStrVal,
        image_url: dbImgVal,
        scheduled_date: scheduledDateVal
      }
    ]).select();

    if (error) {
      console.error('Erro ao inserir post no Supabase:', error);
      alert(`Erro ao guardar na base de dados: ${error.message}`);
      return;
    }

    const insertedId = data && data[0] ? String(data[0].id) : Date.now().toString();

    const newPost: ScheduledPost = {
      id: insertedId,
      title: titleVal,
      caption: contentVal,
      dayIndex: targetDay,
      hour: targetHour,
      timeString: timeStrVal,
      image: mediaUrl || defaultFallbackImg,
      platform: 'instagram',
      postType
    };

    setPosts(prev => [...prev, newPost]);
    setCaption('');
    setMediaUrl('');
    setIsCreateOpen(false);
  };

  const handleDeletePost = async (id: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir post:', error);
      alert(`Erro ao excluir post: ${error.message}`);
      return;
    }

    setPosts(posts.filter(p => p.id !== id));
    setSelectedPost(null);
  };

  const handleDragStart = (id: string) => {
    setDraggedPostId(id);
  };

  const handleDropOnSlot = async (dayIndex: number, hour: number) => {
    if (!draggedPostId) return;

    const updatedPosts = posts.map(p => {
      if (p.id === draggedPostId) {
        return {
          ...p,
          dayIndex,
          hour,
          timeString: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`
        };
      }
      return p;
    });

    setPosts(updatedPosts);
    const targetId = draggedPostId;
    setDraggedPostId(null);

    await supabase.from('posts').update({ 
      day_index: dayIndex, 
      hour: hour 
    }).eq('id', targetId);
  };

  const filteredPosts = posts.filter(p => 
    p.caption.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* 1. Sub-menu superior do Planner */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-6 text-xs font-semibold text-gray-600">
          <button className="flex items-center gap-1.5 text-gray-900 border-b-2 border-amber-500 pb-1 font-bold">
            <CalendarIcon size={14} className="text-amber-500" /> Calendário
          </button>
          <button onClick={() => alert('Visualização em Lista')} className="flex items-center gap-1.5 hover:text-gray-900">
            <List size={14} /> Lista
          </button>
          <button onClick={() => alert('Biblioteca')} className="flex items-center gap-1.5 hover:text-gray-900">
            <BookOpen size={14} /> Biblioteca de publicações
          </button>
        </div>

        <button 
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#231b2d] hover:bg-black text-[#ccf600] px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-xs"
        >
          <Plus size={16} /> Criar publicação
        </button>
      </div>

      {/* 2. Barra de Ferramentas */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Pesquisa" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-gray-400 w-52"
            />
          </div>

          <button className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 px-4 py-1.5 rounded-xl text-xs font-semibold shadow-xs">
            Esta semana
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <button 
              onClick={() => setCurrentWeekOffset(prev => prev - 1)}
              className="p-2 hover:bg-gray-100 text-gray-700 transition border-r border-gray-200"
              title="Semana Anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <button 
              onClick={() => setIsMonthViewOpen(true)}
              className="px-3 py-2 hover:bg-gray-100 text-gray-800 transition flex items-center gap-2 border-r border-gray-200"
              title="Abrir Calendário Mensal"
            >
              <CalendarDays size={16} className="text-pink-600" />
              <span className="text-xs font-bold">Outubro 2026</span>
            </button>

            <button 
              onClick={() => setCurrentWeekOffset(prev => prev + 1)}
              className="p-2 hover:bg-gray-100 text-gray-700 transition"
              title="Próxima Semana"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <button onClick={() => alert('Filtros avançados')} className="p-2 hover:bg-gray-100 text-gray-700 transition border-r border-gray-200" title="Filtrar">
              <Filter size={16} />
            </button>
            <button onClick={() => alert('Mais opções')} className="p-2 hover:bg-gray-100 text-gray-700 transition" title="Mais opções">
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. CALENDAR GRID SEMANAL */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-x-auto select-none">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50 text-xs font-bold text-gray-700">
            <div className="p-3 text-center border-r border-gray-200 text-gray-400">Horário</div>
            {daysOfWeek.map((day, idx) => (
              <div key={idx} className={`p-3 text-center border-r border-gray-200 ${idx === 3 ? 'bg-pink-50 text-pink-900 border-b-2 border-b-pink-500' : ''}`}>
                <span>{day.name}</span>, <span className="font-normal">{day.date}</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
            {hours.map((hour) => (
              <div key={hour} className="grid grid-cols-8 min-h-[70px]">
                <div className="p-2 text-center text-xs text-gray-400 border-r border-gray-200 font-medium bg-gray-50/50 flex items-center justify-center">
                  {hour}:00
                </div>
                {daysOfWeek.map((_, dayIndex) => {
                  const matchedPost = filteredPosts.find(p => p.dayIndex === dayIndex && p.hour === hour);
                  return (
                    <div 
                      key={dayIndex} 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropOnSlot(dayIndex, hour)}
                      className={`border-r border-gray-100 p-1 relative transition hover:bg-pink-50/30 ${dayIndex === 3 ? 'bg-pink-50/20' : ''}`}
                    >
                      {matchedPost && (
                        <div
                          draggable
                          onDragStart={() => handleDragStart(matchedPost.id)}
                          onClick={() => setSelectedPost(matchedPost)}
                          className="bg-white border-2 border-pink-400 shadow-md rounded-lg p-2 cursor-pointer hover:shadow-lg transition transform hover:-translate-y-0.5 group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="bg-pink-100 text-pink-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                              {matchedPost.postType}
                            </span>
                            <span className="text-[9px] text-gray-400 font-medium">{matchedPost.timeString}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <img src={matchedPost.image} alt="Post" className="w-8 h-8 rounded object-cover shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold text-gray-900 truncate">{matchedPost.title}</p>
                              <p className="text-[9px] text-gray-500 truncate">{matchedPost.caption}</p>
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

      {/* 4. MODAL DE CALENDÁRIO MENSAL */}
      {isMonthViewOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="text-pink-600" size={20} />
                <h3 className="font-bold text-base text-gray-900">Calendário Mensal — Outubro 2026</h3>
              </div>
              <button onClick={() => setIsMonthViewOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-gray-500 uppercase">
                <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
                  const hasPostOnThisDay = posts.some(p => p.dayIndex === (dayNum % 7));
                  return (
                    <div 
                      key={dayNum}
                      className={`h-24 border rounded-xl p-2 flex flex-col justify-between transition ${
                        dayNum === 29 ? 'border-pink-500 bg-pink-50/30' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className={`text-xs font-bold ${dayNum === 29 ? 'text-pink-600' : 'text-gray-700'}`}>{dayNum}</span>
                      {hasPostOnThisDay && (
                        <div className="bg-pink-600 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded truncate shadow-xs">
                          📌 Post Agendado
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button 
                onClick={() => setIsMonthViewOpen(false)}
                className="bg-[#231b2d] hover:bg-black text-[#ccf600] px-5 py-2 text-xs font-bold rounded-xl transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL CRIAR NOVO POST */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreatePost} className="bg-[#f8f9fa] w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">Criar novo post</h2>
                <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-3 py-1 rounded-full text-xs font-semibold text-gray-700">
                  <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">df</div>
                  daimefilmes
                </div>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="text-xs font-semibold text-gray-500 hover:text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg">
                <X size={16} /> Fechar
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-white p-3 rounded-xl border border-gray-200 flex items-center gap-3">
                <Video size={16} className="text-pink-600" />
                <select 
                  value={postType}
                  onChange={(e) => setPostType(e.target.value as any)}
                  className="bg-gray-50 border border-gray-200 font-bold text-xs text-gray-800 rounded-lg px-3 py-1.5 focus:outline-none"
                >
                  <option value="REEL">REEL</option>
                  <option value="POST">POST</option>
                  <option value="STORY">STORY</option>
                </select>
              </div>

              <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl h-72 flex flex-col items-center justify-center p-6 relative overflow-hidden group hover:border-pink-500 transition">
                {mediaUrl ? (
                  <img src={mediaUrl} alt="Preview Mídia" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center shadow-xs">
                      <ImageIcon size={32} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Carregar Foto ou Vídeo</p>
                      <p className="text-xs text-gray-400 mt-1">Arraste o arquivo ou clique abaixo</p>
                    </div>
                    <label className="cursor-pointer bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-xs">
                      Selecionar Arquivo
                      <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <textarea 
                  rows={3}
                  placeholder="Escreva a legenda da sua publicação..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full bg-transparent border-none text-xs text-gray-800 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Dia</label>
                  <select 
                    value={targetDay}
                    onChange={(e) => setTargetDay(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                  >
                    {daysOfWeek.map((d, i) => (
                      <option key={i} value={i}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Horário</label>
                  <select 
                    value={targetHour}
                    onChange={(e) => setTargetHour(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-between items-center">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button type="submit" className="bg-[#231b2d] hover:bg-black text-[#ccf600] px-6 py-2 text-xs font-bold rounded-lg shadow-xs">
                Agendar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. MODAL DETALHES DO POST */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                <Sparkles size={16} className="text-pink-600" /> Detalhes da Publicação Agendada
              </h3>
              <button onClick={() => setSelectedPost(null)} className="p-1 text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl overflow-hidden border border-gray-200 h-64 bg-gray-100">
                <img src={selectedPost.image} alt="Preview" className="w-full h-full object-cover" />
              </div>

              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase">Legenda / Comentário</span>
                <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-200 mt-1">
                  {selectedPost.caption}
                </p>
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1 font-medium">
                  <Clock size={14} className="text-amber-500" /> Agendado para {daysOfWeek[selectedPost.dayIndex]?.name || 'Dia'} às {selectedPost.timeString}
                </span>
                <button 
                  onClick={() => handleDeletePost(selectedPost.id)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition"
                >
                  <Trash2 size={14} /> Excluir Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}