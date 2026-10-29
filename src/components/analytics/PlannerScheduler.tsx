'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isVideoMedia } from '@/lib/media';
import { MediaPreview } from '@/components/MediaPreview';
import { 
  Calendar as CalendarIcon, List, Trash2, 
  Plus, ChevronLeft, ChevronRight, X,
  CalendarDays, Search
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
  mediaType: string;
  isVideo?: boolean;
  platform: 'instagram' | 'tiktok' | 'youtube';
  postType: 'REEL' | 'POST' | 'STORY' | 'CARROSSEL';
}

const hours = Array.from({ length: 14 }, (_, i) => i + 11);

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function PlannerScheduler() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'list'>('calendar');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const monthPickerRef = useRef<HTMLInputElement>(null);

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
        fullDateStr: toLocalDateString(date),
        isToday: toLocalDateString(new Date()) === toLocalDateString(date)
      };
    });
  }, [currentWeekOffset]);

  const currentMonthLabel = useMemo(() => {
    const midWeek = currentWeekDays[3];
    return `${midWeek.monthName} ${midWeek.fullDateStr.substring(0, 4)}`;
  }, [currentWeekDays]);

  const handleMonthChange = (monthValue: string) => {
    if (!monthValue) return;

    const [year, month] = monthValue.split('-').map(Number);
    const targetDate = new Date(year, month - 1, 1);
    const currentMonday = new Date();
    const day = currentMonday.getDay();
    currentMonday.setDate(currentMonday.getDate() + (day === 0 ? -6 : 1 - day));
    currentMonday.setHours(0, 0, 0, 0);
    const targetMonday = new Date(targetDate);
    const targetDay = targetMonday.getDay();
    targetMonday.setDate(targetMonday.getDate() + (targetDay === 0 ? -6 : 1 - targetDay));
    targetMonday.setHours(0, 0, 0, 0);
    const weekDifference = Math.round((targetMonday.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));

    setCurrentWeekOffset(weekDifference);
  };

  const fetchPosts = useCallback(async (): Promise<ScheduledPost[]> => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('scheduled_date', { ascending: true })
      .order('hour', { ascending: true });

    if (error) throw error;

    const rows: Record<string, unknown>[] = data ?? [];
    const readString = (value: unknown) => typeof value === 'string' ? value : '';
    return rows.map((item) => {
      const img = readString(item.image_url) || readString(item.media_url) || 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80';
      const mediaType = readString(item.media_type);
      const platform = readString(item.platform);
      const postType = ['REEL', 'POST', 'STORY', 'CARROSSEL'].includes(platform)
        ? platform as ScheduledPost['postType']
        : 'REEL';
      const isVid = isVideoMedia(img, mediaType);

      return {
        id: String(item.id),
        title: readString(item.title) || 'Publicação',
        caption: readString(item.content),
        dayIndex: typeof item.day_index === 'number' ? item.day_index : 0,
        dateStr: readString(item.scheduled_date) || currentWeekDays[0].fullDateStr,
        hour: typeof item.hour === 'number' ? item.hour : 19,
        timeString: readString(item.time_string) || '7:00 PM',
        image: img,
        mediaType,
        isVideo: isVid,
        platform: 'instagram',
        postType
      };
    });
  }, [currentWeekDays]);

  useEffect(() => {
    let active = true;
    void fetchPosts()
      .then((scheduledPosts) => {
        if (active) setPosts(scheduledPosts);
      })
      .catch((error: unknown) => {
        if (active) console.error('Erro ao buscar posts:', error);
      });

    return () => {
      active = false;
    };
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
    try {
      const { error } = await supabase.from('posts').update({
        day_index: dayIndex,
        hour,
        scheduled_date: dateStr,
        time_string: timeString
      }).eq('id', draggedPostId);

      if (error) throw error;

      setPosts(prev => prev.map(post =>
        post.id === draggedPostId
          ? { ...post, dayIndex, hour, dateStr, timeString }
          : post
      ));
    } catch (error) {
      console.error('Erro ao reagendar publicação:', error);
      alert('Não foi possível alterar o horário. Tente novamente.');
    } finally {
      setDraggedPostId(null);
    }
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
    <div className="space-y-4">
      
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-4 text-xs font-semibold text-ink-muted">
          <button 
            type="button"
            aria-pressed={activeTab === 'calendar'}
            onClick={() => setActiveTab('calendar')} 
            className={`flex min-h-11 items-center gap-1.5 border-b-2 px-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${activeTab === 'calendar' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}
          >
            <CalendarIcon size={14} /> Calendário
          </button>
          <button 
            type="button"
            aria-pressed={activeTab === 'list'}
            onClick={() => setActiveTab('list')} 
            className={`flex min-h-11 items-center gap-1.5 border-b-2 px-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${activeTab === 'list' ? 'border-brand-plum text-brand-plum' : 'border-transparent hover:text-ink'}`}
          >
            <List size={14} /> Lista de Agendamentos
          </button>
        </div>
        
        <button 
          type="button"
          onClick={() => setIsCreateOpen(true)} 
          className="flex min-h-11 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
        >
          <Plus size={16} /> Criar publicação
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search aria-hidden="true" size={16} className="absolute left-3 top-3 text-ink-muted" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Pesquisar publicações"
              className="min-h-11 w-52 rounded-control border border-border bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
            />
          </div>
          <button 
            type="button"
            onClick={() => setCurrentWeekOffset(0)} 
            className="min-h-11 rounded-control border border-border bg-surface px-4 text-xs font-semibold text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
          >
            Esta semana
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex items-center overflow-hidden rounded-control border border-border bg-surface">
            <button type="button" aria-label="Semana anterior" onClick={() => setCurrentWeekOffset(prev => prev - 1)} className="flex min-h-11 min-w-11 items-center justify-center border-r border-border text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-plum">
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={`Escolher mês, atualmente ${currentMonthLabel}`}
              onClick={() => {
                if (monthPickerRef.current?.showPicker) monthPickerRef.current.showPicker();
                else monthPickerRef.current?.click();
              }}
              className="flex min-h-11 items-center gap-2 border-r border-border px-4 text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-plum"
            >
              <CalendarDays size={16} className="text-brand-plum" />
              <span className="text-xs font-bold uppercase">{currentMonthLabel}</span>
            </button>
            <input
              ref={monthPickerRef}
              type="month"
              aria-label="Selecionar mês do calendário"
              value={currentWeekDays[3].fullDateStr.slice(0, 7)}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="pointer-events-none absolute h-px w-px opacity-0"
              tabIndex={-1}
            />
            <button type="button" aria-label="Próxima semana" onClick={() => setCurrentWeekOffset(prev => prev + 1)} className="flex min-h-11 min-w-11 items-center justify-center text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-plum">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'calendar' ? (
        <div className="overflow-x-auto rounded-panel border border-border bg-surface">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-8 border-b border-border bg-canvas text-xs font-semibold text-ink">
              <div className="border-r border-border p-3 text-center text-ink-muted">Horário</div>
              {currentWeekDays.map((day, idx) => (
                <div key={idx} className={`border-r border-border p-3 text-center ${day.isToday ? 'border-b-2 border-b-brand-plum bg-[#f3f0e9] text-brand-plum' : ''}`}>
                  <span>{day.name}</span>, <span className="font-normal">{day.dayNumber} {day.monthName}</span>
                </div>
              ))}
            </div>

            <div className="divide-y divide-border">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-8 min-h-[70px]">
                  <div className="flex items-center justify-center border-r border-border bg-canvas/60 p-2 text-center text-xs font-medium text-ink-muted">
                    {hour}:00
                  </div>
                  {currentWeekDays.map((dayObj, dayIndex) => {
                    const matchedPost = sortedAndFilteredPosts.find(p => p.dateStr === dayObj.fullDateStr && p.hour === hour);
                    return (
                      <div 
                        key={dayIndex} 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropOnSlot(dayIndex, hour, dayObj.fullDateStr)}
                        className={`relative border-r border-border p-1 transition-colors hover:bg-canvas ${dayObj.isToday ? 'bg-[#f3f0e9]/45' : ''}`}
                      >
                        {matchedPost && (
                          <button
                            type="button"
                            aria-label={`Abrir ${matchedPost.title}, ${dayObj.name} às ${matchedPost.timeString}`}
                            draggable 
                            onDragStart={() => setDraggedPostId(matchedPost.id)} 
                            onClick={() => setSelectedPost(matchedPost)}
                            className="group w-full rounded-control border border-brand-plum/25 bg-surface p-2 text-left transition-colors hover:border-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-brand-plum">{matchedPost.postType}</span>
                              <span className="text-[9px] font-medium text-ink-muted">{matchedPost.timeString}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {matchedPost.isVideo ? (
                                <MediaPreview
                                  key={matchedPost.image}
                                  src={matchedPost.image}
                                  mediaType={matchedPost.mediaType}
                                  alt={`Prévia de ${matchedPost.title}`}
                                  muted
                                  loop
                                  autoPlay
                                  className="h-8 w-8 shrink-0 rounded object-cover"
                                />
                              ) : (
                                <MediaPreview
                                  key={matchedPost.image}
                                  src={matchedPost.image}
                                  mediaType={matchedPost.mediaType}
                                  alt=""
                                  className="h-8 w-8 shrink-0 rounded object-cover"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[10px] font-semibold text-ink">{matchedPost.title}</p>
                              </div>
                            </div>
                          </button>
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
        <div className="space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-ink">Fila de agendamentos</h3>
            <span className="text-xs font-medium text-ink-muted">{sortedAndFilteredPosts.length} publicação(ões)</span>
          </div>
          <div className="space-y-3">
            {sortedAndFilteredPosts.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-muted">Nenhuma publicação agendada.</p>
            ) : (
              sortedAndFilteredPosts.map(post => (
                <div key={post.id} className="flex items-center justify-between gap-3 rounded-control border border-border bg-canvas/50 p-3 transition-colors hover:border-brand-plum/30 sm:p-4">
                  <button type="button" onClick={() => setSelectedPost(post)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-canvas">
                      <MediaPreview
                        key={post.image}
                        src={post.image}
                        mediaType={post.mediaType}
                        alt={`Prévia de ${post.title}`}
                        muted={post.isVideo}
                        loop={post.isVideo}
                        autoPlay={post.isVideo}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#f3f0e9] px-1.5 py-0.5 text-[10px] font-semibold text-brand-plum">{post.postType}</span>
                        <span className="truncate text-xs font-semibold text-ink">{post.title}</span>
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-muted">Data: <span className="font-semibold text-ink">{post.dateStr}</span> às <span className="font-semibold text-ink">{post.hour}:00</span> ({post.timeString})</span>
                    </span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDeletePost(post.id)}
                    aria-label={`Excluir agendamento de ${post.title}`}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-plum/45 p-4 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-labelledby="scheduled-post-title" className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-panel border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-canvas p-4">
              <div>
                <h3 id="scheduled-post-title" className="text-sm font-semibold text-ink">{selectedPost.title}</h3>
                <p className="text-[11px] text-ink-muted">{selectedPost.dateStr} às {selectedPost.hour}:00</p>
              </div>
              <button type="button" aria-label="Fechar detalhes da publicação" onClick={() => setSelectedPost(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center relative min-h-[280px]">
                <MediaPreview
                  key={selectedPost.image}
                  src={selectedPost.image}
                  mediaType={selectedPost.mediaType}
                  alt={`Prévia de ${selectedPost.title}`}
                  controls={selectedPost.isVideo}
                  autoPlay={selectedPost.isVideo}
                  muted={selectedPost.isVideo}
                  className="max-w-full max-h-[55vh] object-contain"
                />
              </div>
              
              <div className="rounded-control border border-border bg-canvas p-3">
                <p className="whitespace-pre-wrap text-xs font-medium text-ink">{selectedPost.caption || "Sem legenda."}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-canvas p-4">
              <button 
                type="button"
                onClick={() => handleDeletePost(selectedPost.id)}
                className="flex min-h-11 items-center gap-1.5 rounded-control px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              >
                <Trash2 size={15} />
                <span>Excluir publicação</span>
              </button>

              <button 
                type="button"
                onClick={() => setSelectedPost(null)}
                className="min-h-11 rounded-control bg-brand-plum px-4 text-xs font-semibold text-white transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
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