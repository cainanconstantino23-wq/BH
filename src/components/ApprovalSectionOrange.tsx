'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isVideoMedia } from '@/lib/media';
import { MediaPreview } from '@/components/MediaPreview';
import { Plus, Copy, Calendar, Send, Trash2, Image as ImageIcon, X, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface ApprovalPost {
  id: string | number;
  house_name: string;
  caption: string;
  media_url: string;
  media_type: 'image' | 'video';
  approval_status: string;
  approval_token: string;
  client_feedback?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  created_at?: string;
}

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Erro inesperado.';
};

export default function ApprovalSectionOrange() {
  const [posts, setPosts] = useState<ApprovalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ApprovalPost | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [houseName, setHouseName] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [scheduledTime, setScheduledTime] = useState('19:00');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  const fetchPosts = useCallback(async (): Promise<ApprovalPost[]> => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    return rows.map((item, index) => {
      const id = typeof item.id === 'string' || typeof item.id === 'number' ? item.id : `post-${index}`;
      const stringValue = (value: unknown) => typeof value === 'string' ? value : '';
      const captionValue = stringValue(item.caption) || stringValue(item.content);
      const houseNameValue = stringValue(item.house_name) || stringValue(item.title) || 'Casa';

      return {
        ...item,
        id,
        caption: captionValue,
        media_url: stringValue(item.image_url) || stringValue(item.media_url),
        media_type: isVideoMedia(
          stringValue(item.image_url) || stringValue(item.media_url),
          stringValue(item.media_type),
        ) ? 'video' : 'image',
        house_name: houseNameValue,
        approval_status: stringValue(item.approval_status) || 'pending',
        approval_token: stringValue(item.approval_token) || String(id),
        client_feedback: stringValue(item.client_feedback),
        scheduled_date: stringValue(item.scheduled_date),
        scheduled_time: stringValue(item.scheduled_time) || stringValue(item.time_string),
        created_at: stringValue(item.created_at),
      };
    });
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPosts()
      .then((formatted) => {
        if (!active) return;
        setPosts(formatted);
        setSelectedPost(formatted[0] ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Erro ao buscar posts:', error);
        setFeedbackMessage(`Não foi possível carregar a fila: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchPosts]);

  const refreshPosts = async () => {
    try {
      const formatted = await fetchPosts();
      setPosts(formatted);
      setSelectedPost(formatted[0] ?? null);
    } catch (error) {
      console.error('Erro ao atualizar a fila de aprovação:', error);
      setFeedbackMessage(`Não foi possível atualizar a fila: ${getErrorMessage(error)}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setMediaPreview((previousPreview) => {
        if (previousPreview) URL.revokeObjectURL(previousPreview);
        return URL.createObjectURL(selectedFile);
      });
    }
  };

  const handleSendForApproval = async () => {
    if (!houseName.trim()) {
      setFeedbackMessage('Informe o nome da casa ou do cliente.');
      return;
    }
    if (!file) {
      setFeedbackMessage('Selecione uma imagem ou vídeo para continuar.');
      return;
    }

    try {
      setSubmitting(true);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

      const { error: dbError } = await supabase.from('posts').insert([
        {
          title: houseName,
          house_name: houseName,
          content: caption,
          caption: caption,
          image_url: urlData.publicUrl,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          approval_status: 'pending',
          approval_token: token,
          platform: 'REEL',
          scheduled_date: scheduledDate,
          time_string: scheduledTime,
          hour: parseInt(scheduledTime.split(':')[0]) || 19,
        },
      ]);

      if (dbError) throw dbError;

      setIsModalOpen(false);
      setHouseName('');
      setCaption('');
      setFile(null);
      setMediaPreview(null);
      setFeedbackMessage('');
      
      await refreshPosts();
      
      setFeedbackMessage('Conteúdo enviado e adicionado à fila de aprovação.');
    } catch (error) {
      console.error('Erro ao enviar conteúdo para aprovação:', error);
      setFeedbackMessage(`Não foi possível enviar o conteúdo: ${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const copyApprovalLink = async (token: string, postId: string | number) => {
    const link = `${window.location.origin}/approval/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(String(postId));
      setFeedbackMessage('Link de aprovação copiado.');
      window.setTimeout(() => setCopiedId(null), 3000);
    } catch (error) {
      console.error('Não foi possível copiar o link de aprovação:', error);
      setFeedbackMessage('Não foi possível copiar automaticamente. Selecione e copie o link.');
    }
  };

  const deletePost = async (postId: string | number) => {
    if (!confirm('Deseja eliminar este registo de aprovação?')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      await refreshPosts();
      setSelectedPost(null);
      setFeedbackMessage('Conteúdo removido da fila de aprovação.');
    } catch (error) {
      setFeedbackMessage(`Não foi possível eliminar o conteúdo: ${getErrorMessage(error)}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      <div className="flex flex-col justify-between gap-4 rounded-panel border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-1 shrink-0 rounded-full bg-brand-plum"></div>
          <div>
            <h2 className="text-base font-semibold text-ink">Central de aprovação</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">Revise conteúdos, acompanhe as respostas e compartilhe links de aprovação.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setFeedbackMessage(''); setIsModalOpen(true); }}
          className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
        >
          <Plus size={16} /> Novo post para aprovação
        </button>
      </div>

      {feedbackMessage && !isModalOpen && <p role="status" className="rounded-control border border-border bg-surface px-4 py-3 text-xs text-ink">{feedbackMessage}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.7fr)]">
        
        <div className="overflow-hidden rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-canvas p-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <span>Fila de Aprovação</span>
            <span className="rounded-full bg-[#f3f0e9] px-2.5 py-1 text-[10px] font-semibold text-brand-plum">{posts.length}</span>
          </div>
          <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400">A carregar...</div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">Nenhum conteúdo em aprovação.</div>
            ) : (
              posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selectedPost?.id === p.id}
                  onClick={() => setSelectedPost(p)}
                  className={`flex min-h-[76px] w-full items-center gap-3 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-plum ${
                    selectedPost?.id === p.id ? 'border-l-4 border-brand-plum bg-[#f3f0e9]/70' : 'hover:bg-canvas/70'
                  }`}
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-control bg-canvas">
                    <MediaPreview
                      key={p.media_url}
                      src={p.media_url}
                      mediaType={p.media_type}
                      alt={`Prévia da publicação de ${p.house_name}`}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      autoPlay
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="max-w-[90px] truncate text-[10px] font-semibold uppercase text-ink">{p.house_name || 'Casa'}</span>
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-800' :
                        p.approval_status === 'changes_requested' ? 'bg-amber-50 text-amber-800' :
                        p.approval_status === 'rejected' ? 'bg-rose-50 text-rose-800' :
                        'bg-canvas text-brand-plum'
                      }`}>
                        {p.approval_status === 'approved' ? <CheckCircle2 size={11} /> :
                         p.approval_status === 'changes_requested' ? <AlertCircle size={11} /> :
                         p.approval_status === 'rejected' ? <X size={11} /> : <Clock size={11} />}
                        {p.approval_status === 'approved' ? 'Aprovado' :
                         p.approval_status === 'changes_requested' ? 'Ajustes' :
                         p.approval_status === 'rejected' ? 'Reprovado' : 'Pendente'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-muted">{p.caption || 'Sem legenda'}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col justify-between rounded-panel border border-border bg-surface p-4 sm:p-6">
          {selectedPost ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="inline-flex rounded-full bg-[#f3f0e9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-plum">
                    {selectedPost.house_name || 'Casa'}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-ink">Link de aprovação e resposta do cliente</h3>
                  {(selectedPost.scheduled_date || selectedPost.scheduled_time) && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                      <Calendar aria-hidden="true" size={13} />
                      {selectedPost.scheduled_date ?? 'Data não definida'}
                      {selectedPost.scheduled_time ? ` às ${selectedPost.scheduled_time}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Excluir publicação de ${selectedPost.house_name}`}
                    onClick={() => deletePost(selectedPost.id)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                    title="Excluir publicação"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-panel border border-border bg-canvas p-4">
                <label htmlFor="approval-link" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Link exclusivo de aprovação para o cliente
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="approval-link"
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/approval/${selectedPost.approval_token}`}
                    className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-xs font-mono text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  />
                  <button
                    type="button"
                    onClick={() => copyApprovalLink(selectedPost.approval_token, selectedPost.id)}
                    className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    <Copy size={13} />
                    {copiedId === String(selectedPost.id) ? 'Copiado!' : 'Copiar link'}
                  </button>
                  
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Olá! Segue o link exclusivo para aprovação do vídeo da ${selectedPost.house_name}: ${window.location.origin}/approval/${selectedPost.approval_token}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Enviar link de aprovação por WhatsApp"
                    className="flex min-h-11 shrink-0 items-center justify-center rounded-control border border-border bg-surface px-4 text-xs font-semibold text-ink transition-colors hover:bg-[#f3f0e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
                <div className="flex max-h-[360px] min-h-[240px] items-center justify-center overflow-hidden rounded-panel bg-brand-plum">
                  <MediaPreview
                    key={selectedPost.media_url}
                    src={selectedPost.media_url}
                    mediaType={selectedPost.media_type}
                    alt={`Mídia para ${selectedPost.house_name}`}
                    controls={selectedPost.media_type === 'video'}
                    className="h-full max-h-[360px] w-full object-contain"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Legenda / copy</h4>
                    <div className="max-h-36 overflow-y-auto rounded-control border border-border bg-canvas p-3 text-xs font-medium text-ink">
                      {selectedPost.caption || 'Sem legenda inserida.'}
                    </div>

                    {selectedPost.client_feedback && (
                      <div className="mt-4">
                        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Feedback do cliente</h4>
                        <div className="rounded-control border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                          {selectedPost.client_feedback}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-xs text-ink-muted">
              <Copy aria-hidden="true" size={20} className="text-brand-plum" />
              <p>Selecione um item na fila para ver a prévia e compartilhar o link.</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-plum/45 p-2 backdrop-blur-xs sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="approval-create-title" className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-panel border border-border bg-surface md:flex-row">
            
            <div className="flex-1 space-y-4 overflow-y-auto border-b border-border p-4 sm:p-6 md:border-b-0 md:border-r">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 id="approval-create-title" className="text-base font-semibold text-ink">Novo post para aprovação</h2>
                    <p className="mt-1 text-xs text-ink-muted">Prepare a mídia e o link que será enviado ao cliente.</p>
                  </div>
                </div>
                <button type="button" aria-label="Fechar janela de aprovação" onClick={() => setIsModalOpen(false)} disabled={submitting} className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>

              <div>
                <label htmlFor="approval-house-name" className="mb-1.5 block text-xs font-semibold text-ink">Nome da casa / cliente</label>
                <input
                  id="approval-house-name"
                  type="text"
                  value={houseName}
                  onChange={(e) => { setHouseName(e.target.value); setFeedbackMessage(''); }}
                  placeholder="Ex: Villa Trancoso"
                  className="min-h-11 w-full rounded-control border border-border bg-canvas px-3 text-sm font-medium text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Calendar size={14} className="text-brand-plum" /> Data prevista</span>
                  <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum" />
                </label>
                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Clock size={14} className="text-brand-plum" /> Horário previsto</span>
                  <input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum" />
                </label>
              </div>

              <div className="space-y-3 rounded-panel border border-border bg-surface p-4">
                <textarea
                  value={caption}
                  onChange={(e) => { setCaption(e.target.value); setFeedbackMessage(''); }}
                  placeholder="Escreva sua legenda aqui..."
                  rows={6}
                  maxLength={2200}
                  aria-label="Legenda para o cliente"
                  className="min-h-28 w-full resize-y text-sm font-medium text-ink placeholder:text-ink-muted focus-visible:outline-none"
                />
                
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-ink-muted">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-xs font-semibold transition-colors hover:bg-canvas hover:text-brand-plum focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-plum">
                    <ImageIcon size={16} />
                    <span>{file ? 'Substituir mídia' : 'Selecionar mídia'}</span>
                    <input type="file" accept="video/*,image/*" onChange={handleFileChange} className="sr-only" aria-label="Selecionar imagem ou vídeo" />
                  </label>
                  <span className="text-[10px]">{caption.length}/2200 caracteres</span>
                </div>
              </div>

              {feedbackMessage && <p role="alert" className="rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink">{feedbackMessage}</p>}
            </div>

            <div className="flex w-full flex-col justify-between gap-4 bg-canvas/60 p-4 sm:p-6 md:w-96">
              <div className="my-2 flex flex-1 flex-col items-center justify-center">
                <div className="relative flex aspect-[9/16] max-h-[360px] w-full max-w-[240px] items-center justify-center overflow-hidden rounded-panel border border-border bg-brand-plum">
                  {mediaPreview ? (
                  <MediaPreview
                    key={mediaPreview}
                    src={mediaPreview}
                    mediaType={file?.type}
                    alt="Pré-visualização da mídia escolhida"
                    controls={file?.type.startsWith('video/')}
                    muted
                    className="h-full w-full object-contain"
                  />
                  ) : (
                    <div className="p-4 text-center">
                      <ImageIcon size={32} className="mx-auto mb-2 text-brand-lime" />
                      <p className="text-[11px] font-medium text-white/70">A prévia da mídia aparece aqui.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="min-h-11 rounded-control px-4 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendForApproval}
                  disabled={submitting}
                  className="flex min-h-11 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
                >
                  <Send size={14} />
                  {submitting ? 'Enviando...' : 'Enviar para aprovação'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}