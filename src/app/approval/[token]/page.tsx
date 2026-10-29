'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Home, LoaderCircle } from 'lucide-react';

interface Post {
  id: string;
  house_name: string;
  caption: string;
  media_url: string;
  media_type: 'image' | 'video';
  approval_status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  client_feedback?: string;
}

export default function ClientApprovalPage() {
  const params = useParams();
  const rawToken = params?.token as string;
  const token = rawToken ? decodeURIComponent(rawToken) : '';

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [actionDone, setActionDone] = useState(false);

  const supabase = createClient();

  const fetchPostByToken = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Busca flexível: aceita tanto o approval_token quanto o ID do post
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .or(`approval_token.eq.${token},id.eq.${token}`)
        .maybeSingle();

      if (error) {
        console.error('Erro na consulta do Supabase:', error);
        throw error;
      }

      if (data) {
        // 1. Procura a URL do arquivo em todas as colunas possíveis
        const rawMediaUrl = 
          data.media_url || 
          data.video_url || 
          data.image_url || 
          data.url || 
          data.file_url || 
          '';

        // 2. Identifica se é vídeo pela extensão (.mp4, .mov, etc.) ou tipo registrado
        const rawType = (data.media_type || data.type || '').toString().toLowerCase();
        const isVideoUrl = rawMediaUrl.match(/\.(mp4|mov|webm|m3u8)($|\?)/i);
        
        const isVideo = 
          rawType === 'video' || 
          rawType === 'reel' || 
          rawType === 'video_url' || 
          Boolean(isVideoUrl);

        const formattedPost: Post = {
          ...data,
          media_url: rawMediaUrl,
          media_type: isVideo ? 'video' : 'image',
          caption: data.caption || data.content || data.notes || '',
          house_name: data.house_name || data.title || 'Casa'
        };

        setPost(formattedPost);
        if (formattedPost.client_feedback) setFeedback(formattedPost.client_feedback);
        if (formattedPost.approval_status && formattedPost.approval_status !== 'pending') {
          setActionDone(true);
        }
      } else {
        setPost(null);
      }
    } catch (err) {
      console.error('Falha ao carregar conteúdo para aprovação:', err);
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [token, supabase]);

  useEffect(() => {
    void fetchPostByToken();
  }, [fetchPostByToken]);

  const handleResponse = async (status: 'approved' | 'changes_requested' | 'rejected') => {
    if (!post) return;
    try {
      const { error } = await supabase
        .from('posts')
        .update({
          approval_status: status,
          client_feedback: feedback,
        })
        .eq('id', post.id);

      if (error) throw error;
      setPost({ ...post, approval_status: status, client_feedback: feedback });
      setActionDone(true);
    } catch (err: any) {
      alert(`Erro ao enviar resposta: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 font-sans text-ink">
        <div role="status" aria-live="polite" className="w-full max-w-sm rounded-panel border border-border bg-surface p-8 text-center shadow-sm">
          <Image
            src="/bahia-homes-logo.png"
            alt="Bahia Homes"
            width={1834}
            height={276}
            className="mx-auto mb-8 h-auto w-36"
          />
          <LoaderCircle aria-hidden="true" size={24} className="mx-auto mb-3 animate-spin text-brand-plum motion-reduce:animate-none" />
          <p className="text-sm font-medium text-ink">A carregar conteúdo para aprovação…</p>
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 font-sans text-ink">
        <div role="alert" className="w-full max-w-sm rounded-panel border border-border bg-surface p-6 text-center shadow-sm sm:p-8">
          <Image
            src="/bahia-homes-logo.png"
            alt="Bahia Homes"
            width={1834}
            height={276}
            className="mx-auto mb-8 h-auto w-36"
          />
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-soft text-status-warning">
            <AlertTriangle aria-hidden="true" size={22} />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">Link indisponível</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Conteúdo não encontrado ou link inválido.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="press-feedback flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] font-sans text-ink sm:py-10">
      <div className="w-full max-w-xl overflow-hidden rounded-panel border border-border bg-surface shadow-sm">
        <header className="flex flex-col gap-3 bg-brand-plum px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <span className="rounded-control bg-white px-2.5 py-2">
              <Image
                src="/bahia-homes-logo.png"
                alt="Bahia Homes"
                width={1834}
                height={276}
                className="h-auto w-28"
              />
            </span>
            <span className="text-xs font-semibold tracking-wide">Aprovação de conteúdo</span>
          </div>
          <span className="flex min-h-9 items-center gap-1.5 self-start rounded-full bg-white/10 px-3 text-xs font-medium text-white sm:self-auto">
            <Home aria-hidden="true" size={13} />
            {post.house_name}
          </span>
        </header>

        {/* Mídia: Vídeo com Player HTML5 ou Imagem */}
        <div className="flex min-h-[280px] w-full items-center justify-center overflow-hidden bg-ink">
          {post.media_url ? (
            post.media_type === 'video' ? (
              <video
                src={post.media_url}
                controls
                playsInline
                preload="metadata"
                className="block h-auto max-h-[55dvh] w-full object-contain sm:max-h-[550px]"
              />
            ) : (
              <img
                src={post.media_url}
                alt="Mídia da publicação"
                className="block h-auto max-h-[55dvh] w-full object-contain sm:max-h-[550px]"
              />
            )
          ) : (
            <p className="p-6 text-sm text-white/60">Nenhum ficheiro de mídia disponível.</p>
          )}
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <section>
            <h2 className="text-xs font-semibold text-ink">Observações da produtora</h2>
            <div className="mt-2 rounded-control border border-border bg-canvas p-4 text-sm leading-relaxed text-ink">
              {post.caption || 'Nenhum comentário adicionado.'}
            </div>
          </section>

          {actionDone ? (
            <div className={`rounded-control border p-4 text-center ${
              post.approval_status === 'approved' ? 'border-status-success-border bg-status-success-soft text-status-success' :
              post.approval_status === 'changes_requested' ? 'border-status-warning-border bg-status-warning-soft text-status-warning' :
              'border-status-danger-border bg-status-danger-soft text-status-danger'
            }`}>
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                {post.approval_status === 'approved' && <CheckCircle2 size={17} />}
                {post.approval_status === 'changes_requested' && <AlertTriangle size={17} />}
                {post.approval_status === 'approved' ? 'Conteúdo aprovado com sucesso' :
                 post.approval_status === 'changes_requested' ? 'Pedido de ajustes enviado' : 'Conteúdo reprovado'}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-80">A equipa da produtora foi notificada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="client-feedback" className="block text-xs font-semibold text-ink">
                  Comentário ou pedido de ajuste <span className="font-normal text-ink-muted">(opcional)</span>
                </label>
                <textarea
                  id="client-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Ex.: ajustar a cor do vídeo ou trocar o take inicial…"
                  rows={3}
                  className="mt-2 w-full resize-y rounded-control border border-border bg-surface p-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleResponse('rejected')}
                  className="min-h-12 rounded-control border border-status-danger-border bg-status-danger-soft px-2 text-xs font-semibold text-status-danger transition-colors hover:bg-status-danger-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-danger"
                >
                  Reprovar
                </button>
                <button
                  type="button"
                  onClick={() => handleResponse('changes_requested')}
                  className="min-h-12 rounded-control border border-status-warning-border bg-status-warning-soft px-2 text-xs font-semibold text-status-warning transition-colors hover:bg-status-warning-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-warning"
                >
                  Pedir ajustes
                </button>
                <button
                  type="button"
                  onClick={() => handleResponse('approved')}
                  className="min-h-12 rounded-control bg-brand-plum px-2 text-xs font-semibold text-brand-lime transition-colors hover:bg-brand-plum-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                >
                  Aprovar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}