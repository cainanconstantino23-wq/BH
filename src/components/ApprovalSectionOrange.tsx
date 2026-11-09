'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isVideoMedia } from '@/lib/media';
import { MediaPreview } from '@/components/MediaPreview';
import { useTeam } from '@/lib/team';
import { useDismiss } from '@/lib/useDismiss';
import { Plus, Copy, Calendar, Send, Trash2, Image as ImageIcon, X, Clock, CheckCircle2, AlertCircle, Eye, MessageSquareWarning, XCircle, Sparkles, Loader2 } from 'lucide-react';

interface ApprovalPost {
  id: string | number;
  house_name: string;
  caption: string;
  media_url: string;
  media_type: 'image' | 'video';
  approval_status: string;
  approval_token: string;
  views_count?: number;
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
  const team = useTeam();
  const [decisionComment, setDecisionComment] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [posts, setPosts] = useState<ApprovalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ApprovalPost | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<number>(0);
  
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
  const closeCreateModal = useCallback(() => setIsModalOpen(false), []);
  const createDismiss = useDismiss(isModalOpen, closeCreateModal, submitting);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [generatingCopy, setGeneratingCopy] = useState(false);
  // Tela de envio no centro: progresso real, depois sucesso ou erro em linguagem simples.
  const [sendState, setSendState] = useState<SendState | null>(null);

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
        views_count: typeof item.views_count === 'number' ? item.views_count : 0,
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

  // Monitor de Presença em Tempo Real + Atualização Instantânea de Views no Painel
  useEffect(() => {
    if (!selectedPost?.approval_token) {
      setActiveViewers(0);
      return;
    }

    const cleanToken = selectedPost.approval_token.replace(/[()]/g, '').trim();
    
    // 1. Escuta quem está com a página aberta em tempo real (Presence)
    const presenceChannel = supabase.channel(`approval_${cleanToken}`);
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setActiveViewers(Object.keys(state).length);
      })
      .subscribe();

    // 2. Escuta alterações no Supabase para atualizar a contagem de acessos sem dar F5
    const dbChannel = supabase
      .channel('db_post_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
          filter: `id=eq.${selectedPost.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new.views_count === 'number') {
            setSelectedPost((prev) => prev ? { ...prev, views_count: payload.new.views_count } : null);
            setPosts((prevPosts) =>
              prevPosts.map((p) =>
                p.id === selectedPost.id ? { ...p, views_count: payload.new.views_count } : p
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(dbChannel);
    };
  }, [selectedPost?.id, selectedPost?.approval_token]);

  const refreshPosts = async () => {
    try {
      const formatted = await fetchPosts();
      setPosts(formatted);
      if (selectedPost) {
        const updated = formatted.find(p => p.id === selectedPost.id);
        setSelectedPost(updated || formatted[0] || null);
      } else {
        setSelectedPost(formatted[0] ?? null);
      }
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

    const isVideoFile = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
    const kind = isVideoFile ? 'video' : 'foto';

    try {
      setSubmitting(true);
      setFeedbackMessage('');
      setSendState({ phase: 'sending', percent: 0, kind });

      // 1. autorização de envio (URL assinada)
      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      });
      if (!res.ok) throw new Error(`upload-url respondeu ${res.status}`);
      const { uploadUrl, publicUrl } = await res.json();

      // 2. envio direto do navegador, com progresso real
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setSendState({ phase: 'sending', percent: Math.round((event.loaded / event.total) * 100), kind });
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`envio respondeu ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('falha de rede no envio'));
        xhr.send(file);
      });

      // 3. registra a publicação na fila
      setSendState({ phase: 'saving', kind });
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const { error: dbError } = await supabase.from('posts').insert([
        {
          title: houseName,
          house_name: houseName,
          content: caption,
          caption: caption,
          image_url: publicUrl,
          media_type: isVideoFile ? 'video' : 'image',
          approval_status: 'pending',
          approval_token: token,
          platform: 'REEL',
          scheduled_date: scheduledDate,
          time_string: scheduledTime,
          hour: parseInt(scheduledTime.split(':')[0]) || 19,
          views_count: 0
        },
      ]);
      if (dbError) throw dbError;

      setIsModalOpen(false);
      setHouseName('');
      setCaption('');
      setFile(null);
      setMediaPreview(null);
      setSendState({ phase: 'done', kind });
      await refreshPosts();
    } catch (error) {
      // detalhe técnico só no console; o usuário vê uma mensagem simples
      console.error('Erro ao enviar conteúdo para aprovação:', getErrorMessage(error), error);
      setSendState({ phase: 'error', kind });
    } finally {
      setSubmitting(false);
    }
  };

  // Botão "Gerar legenda": a IA escreve (ou melhora) a legenda do Reels a partir da casa e do rascunho.
  const generateCopy = async () => {
    if (!houseName.trim() && !caption.trim()) {
      setFeedbackMessage('Preencha o nome da casa ou escreva umas palavras sobre ela para gerar a legenda.');
      return;
    }
    setGeneratingCopy(true);
    setFeedbackMessage('');
    try {
      const response = await fetch('/api/copy/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ houseName, notes: caption, currentCaption: caption, format: 'REEL' }),
      });
      const result = (await response.json().catch(() => ({}))) as { caption?: string; error?: string };
      if (!response.ok || !result.caption) {
        setFeedbackMessage(result.error ?? 'Não foi possível gerar a legenda.');
        return;
      }
      setCaption(result.caption);
      setFeedbackMessage('Legenda gerada. Revise antes de enviar para aprovação.');
    } catch {
      setFeedbackMessage('Sem conexão para gerar a legenda. Tente de novo.');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const decide = async (postId: string | number, status: 'approved' | 'changes_requested' | 'rejected') => {
    if (status === 'changes_requested' && !decisionComment.trim()) {
      setFeedbackMessage('Escreva o que precisa mudar antes de pedir ajustes.');
      return;
    }
    setDeciding(true);
    const { error } = await supabase
      .from('posts')
      .update({ approval_status: status, client_feedback: decisionComment.trim() || null })
      .eq('id', postId);
    setDeciding(false);
    if (error) {
      setFeedbackMessage(`Não foi possível registrar a decisão: ${getErrorMessage(error)}`);
      return;
    }
    setDecisionComment('');
    await refreshPosts();
    setFeedbackMessage(
      status === 'approved' ? 'Publicação aprovada.' : status === 'changes_requested' ? 'Pedido de ajustes registrado.' : 'Publicação reprovada.',
    );
  };

  const copyApprovalLink = async (rawToken: string, postId: string | number) => {
    const cleanToken = rawToken.trim().replace(/[()]/g, '');
    const link = `${window.location.origin}/approval/${cleanToken}`;
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
    <div className="section-enter space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-panel border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-1 shrink-0 rounded-full bg-brand-plum"></div>
          <div>
            <h2 className="text-base font-semibold text-ink">Central de aprovação</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">Revise conteúdos, acompanhe as respostas e compartilhe links de aprovação.</p>
          </div>
        </div>
        {team.can('criar_publicacoes') && <button
          type="button"
          onClick={() => { setFeedbackMessage(''); setIsModalOpen(true); }}
          className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
        >
          <Plus size={16} /> Novo post para aprovação
        </button>}
      </div>

      {feedbackMessage && !isModalOpen && <p role="status" className="rounded-control border border-border bg-surface px-4 py-3 text-xs text-ink">{feedbackMessage}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.7fr)]">
        
        <div className="overflow-hidden rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-canvas p-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <span>Fila de Aprovação</span>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-semibold text-brand-plum">{posts.length}</span>
          </div>
          <div className="max-h-[600px] divide-y divide-border overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-ink-muted">A carregar...</div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-muted">Nenhum conteúdo em aprovação.</div>
            ) : (
              posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selectedPost?.id === p.id}
                  onClick={() => setSelectedPost(p)}
                  className={`flex min-h-[76px] w-full items-center gap-3 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-plum ${
                    selectedPost?.id === p.id ? 'border-l-4 border-brand-plum bg-surface-muted/70' : 'hover:bg-canvas/70'
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
                        p.approval_status === 'approved' ? 'border border-status-success-border bg-status-success-soft text-status-success' :
                        p.approval_status === 'changes_requested' ? 'border border-status-warning-border bg-status-warning-soft text-status-warning' :
                        p.approval_status === 'rejected' ? 'border border-status-danger-border bg-status-danger-soft text-status-danger' :
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
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-plum">
                      {selectedPost.house_name || 'Casa'}
                    </span>

                    {/* Badge Realtime: Cliente Online */}
                    {activeViewers > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 animate-pulse">
                        <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                        {activeViewers} visualizando agora
                      </span>
                    )}

                    {/* Contador de Visualizações Totais */}
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas px-2.5 py-0.5 text-[10px] font-medium text-ink-muted">
                      <Eye size={12} />
                      {selectedPost.views_count || 0} acessos
                    </span>
                  </div>

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
                  {team.can('apagar_publicacoes') && <button
                    type="button"
                    aria-label={`Excluir publicação de ${selectedPost.house_name}`}
                    onClick={() => deletePost(selectedPost.id)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-status-danger-soft hover:text-status-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                    title="Excluir publicação"
                  >
                    <Trash2 size={15} />
                  </button>}
                </div>
              </div>

              {team.can('aprovar_publicacoes') && (
                <div className="space-y-3 rounded-panel border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink">Sua decisão</h4>
                    {selectedPost.approval_status !== 'pending' && (
                      <span className="text-xs text-ink-muted">
                        Situação atual:{' '}
                        {selectedPost.approval_status === 'approved' ? 'aprovado' : selectedPost.approval_status === 'changes_requested' ? 'ajustes pedidos' : selectedPost.approval_status === 'rejected' ? 'reprovado' : 'pendente'}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={decisionComment}
                    onChange={(event) => setDecisionComment(event.target.value)}
                    rows={2}
                    maxLength={2000}
                    aria-label="Comentário da decisão"
                    placeholder="Comentário (obrigatório para pedir ajustes)"
                    className="w-full resize-y rounded-control border border-border bg-canvas p-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button type="button" disabled={deciding} onClick={() => void decide(selectedPost.id, 'approved')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control bg-brand-plum px-3 text-xs font-semibold text-white hover:bg-brand-plum-hover disabled:opacity-50">
                      <CheckCircle2 size={14} aria-hidden="true" /> Aprovar
                    </button>
                    <button type="button" disabled={deciding} onClick={() => void decide(selectedPost.id, 'changes_requested')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control border border-status-warning-border bg-status-warning-soft px-3 text-xs font-semibold text-status-warning hover:bg-status-warning-border disabled:opacity-50">
                      <MessageSquareWarning size={14} aria-hidden="true" /> Pedir ajustes
                    </button>
                    <button type="button" disabled={deciding} onClick={() => void decide(selectedPost.id, 'rejected')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control border border-status-danger-border bg-status-danger-soft px-3 text-xs font-semibold text-status-danger hover:bg-status-danger-border disabled:opacity-50">
                      <XCircle size={14} aria-hidden="true" /> Reprovar
                    </button>
                  </div>
                </div>
              )}

              {team.can('enviar_link_aprovacao') && <div className="space-y-3 rounded-panel border border-border bg-canvas p-4">
                <label htmlFor="approval-link" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Link exclusivo de aprovação para o cliente
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="approval-link"
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/approval/${selectedPost.approval_token.replace(/[()]/g, '')}`}
                    className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-xs font-mono text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  />
                  <button
                    type="button"
                    onClick={() => copyApprovalLink(selectedPost.approval_token, selectedPost.id)}
                    className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    <Copy size={13} />
                    {copiedId === String(selectedPost.id) ? 'Copiado!' : 'Copiar link'}
                  </button>
                  
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Olá! Segue o link exclusivo para aprovação do vídeo da ${selectedPost.house_name}: ${window.location.origin}/approval/${selectedPost.approval_token.replace(/[()]/g, '')}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Enviar link de aprovação por WhatsApp"
                    className="flex min-h-11 shrink-0 items-center justify-center rounded-control border border-border bg-surface px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
              </div>}

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
                        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning">Feedback do cliente</h4>
                        <div className="rounded-control border border-status-warning-border bg-status-warning-soft p-3 text-xs font-medium text-status-warning">
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
        <div {...createDismiss} className="fixed inset-0 z-50 flex items-center justify-center bg-brand-plum/45 p-2 backdrop-blur-xs sm:p-4">
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
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]">{caption.length}/2200 caracteres</span>
                    <button
                      type="button"
                      onClick={() => void generateCopy()}
                      disabled={generatingCopy || submitting}
                      title="Gerar legenda de Reels com IA a partir da casa e do que você escreveu"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-brand-plum px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-60"
                    >
                      {generatingCopy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                      {generatingCopy ? 'Gerando…' : 'Gerar legenda'}
                    </button>
                  </div>
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
                  className="flex min-h-11 items-center gap-2 rounded-control bg-brand-plum px-4 text-xs font-semibold text-brand-lime transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
                >
                  <Send size={14} />
                  {submitting ? 'Enviando...' : 'Enviar para aprovação'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {sendState && (
        <SendProgress
          state={sendState}
          onClose={() => setSendState(null)}
          onRetry={() => { setSendState(null); void handleSendForApproval(); }}
        />
      )}

    </div>
  );
}

type SendState =
  | { phase: 'sending'; percent: number; kind: 'video' | 'foto' }
  | { phase: 'saving'; kind: 'video' | 'foto' }
  | { phase: 'done'; kind: 'video' | 'foto' }
  | { phase: 'error'; kind: 'video' | 'foto' };

// Carregamento no centro da tela, com mensagens para quem usa (sem termos técnicos).
function SendProgress({ state, onClose, onRetry }: { state: SendState; onClose: () => void; onRetry: () => void }) {
  const what = state.kind === 'video' ? 'seu vídeo' : 'sua foto';
  const What = state.kind === 'video' ? 'Seu vídeo' : 'Sua foto';
  const finished = state.phase === 'done' || state.phase === 'error';

  // o sucesso se fecha sozinho depois de alguns segundos
  useEffect(() => {
    if (state.phase !== 'done') return;
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [state.phase, onClose]);

  const percent = state.phase === 'sending' ? state.percent : state.phase === 'saving' ? 100 : 0;
  const R = 34, C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-plum/45 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (finished && e.target === e.currentTarget) onClose(); }}>
      <div
        role={finished ? 'alertdialog' : 'status'}
        aria-live="polite"
        aria-label={finished ? undefined : `Enviando ${what}`}
        className="w-[min(22rem,100%)] rounded-panel border border-border bg-surface p-6 text-center shadow-[0_24px_60px_-24px_rgb(35_27_45/0.55)]"
      >
        {(state.phase === 'sending' || state.phase === 'saving') && (
          <>
            <div className="relative mx-auto h-24 w-24">
              <svg viewBox="0 0 80 80" className={`h-full w-full -rotate-90 ${state.phase === 'saving' ? 'motion-safe:animate-pulse' : ''}`} aria-hidden="true">
                <circle cx="40" cy="40" r={R} fill="none" strokeWidth="6" className="stroke-surface-muted" />
                <circle
                  cx="40" cy="40" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
                  className="stroke-brand-plum transition-[stroke-dashoffset] duration-300 ease-out"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - percent / 100)}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-ink">
                {state.phase === 'saving' ? <Loader2 size={22} className="motion-safe:animate-spin text-brand-plum" aria-hidden="true" /> : `${percent}%`}
              </span>
            </div>
            <p className="mt-4 text-base font-semibold text-ink">{state.phase === 'saving' ? 'Quase lá…' : `Enviando ${what}…`}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {state.phase === 'saving' ? 'Colocando na fila de aprovação.' : 'Não feche esta página até terminar.'}
            </p>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-success-soft text-status-success">
              <CheckCircle2 size={34} aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">{What} foi {state.kind === 'video' ? 'enviado' : 'enviada'} com sucesso!</p>
            <p className="mt-1 text-sm text-ink-muted">Já está na fila de aprovação.</p>
            <button type="button" onClick={onClose} autoFocus className="mt-5 min-h-11 w-full rounded-control bg-brand-plum px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
              Ok
            </button>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-danger-soft text-status-danger">
              <AlertCircle size={34} aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">Não foi possível enviar {what}</p>
            <p className="mt-1 text-sm text-ink-muted">Verifique sua conexão com a internet e tente de novo.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-control border border-border px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted">
                Fechar
              </button>
              <button type="button" onClick={onRetry} autoFocus className="min-h-11 rounded-control bg-brand-plum px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
