'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { Home, CheckCircle2, AlertTriangle } from 'lucide-react';

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
  const token = params?.token as string;

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [actionDone, setActionDone] = useState(false);

  useEffect(() => {
    if (token) fetchPostByToken();
  }, [token]);

  const fetchPostByToken = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('approval_token', token)
        .single();

      if (error) throw error;

      if (data) {
        const formattedPost: Post = {
          ...data,
          media_url: data.image_url || data.media_url || '',
          caption: data.caption || data.content || '',
          house_name: data.house_name || data.title || 'Casa'
        };

        setPost(formattedPost);
        if (formattedPost.client_feedback) setFeedback(formattedPost.client_feedback);
        if (formattedPost.approval_status && formattedPost.approval_status !== 'pending') {
          setActionDone(true);
        }
      }
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-xs text-gray-500 font-sans">
        A carregar conteúdo para aprovação...
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-xs text-gray-500 font-sans">
        Conteúdo não encontrado ou link inválido.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf8] py-10 px-4 flex flex-col items-center justify-center font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Cabeçalho */}
        <div className="p-5 bg-gray-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white text-gray-900 flex items-center justify-center font-bold text-[10px]">BH</div>
            <span className="text-xs font-bold uppercase tracking-wider">Aprovação de Conteúdo</span>
          </div>
          <span className="text-[10px] bg-orange-500 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
            <Home size={10} /> {post.house_name}
          </span>
        </div>

        {/* Pré-visualização com proporção nativa da mídia */}
        <div className="relative bg-black w-full flex items-center justify-center overflow-hidden">
          {post.media_type === 'video' ? (
            <video 
              src={post.media_url} 
              controls 
              playsInline
              className="w-full h-auto max-h-[550px] object-contain block mx-auto" 
            />
          ) : (
            <img 
              src={post.media_url} 
              alt="Mídia" 
              className="w-full h-auto max-h-[550px] object-contain block mx-auto" 
            />
          )}
        </div>

        {/* Informações e Feedback */}
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Comentário / Observações da Produtora</h3>
            <div className="p-3 bg-gray-50 rounded-2xl text-xs text-gray-800 border border-gray-100 font-medium">
              {post.caption || 'Nenhum comentário adicionado.'}
            </div>
          </div>

          {actionDone ? (
            <div className={`p-4 rounded-2xl text-center border ${
              post.approval_status === 'approved' ? 'bg-green-50 border-green-200 text-green-800' :
              post.approval_status === 'changes_requested' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-red-50 border-red-200 text-red-800'
            }`}>
              <p className="font-bold text-xs flex items-center justify-center gap-1.5">
                {post.approval_status === 'approved' && <CheckCircle2 size={16} />}
                {post.approval_status === 'changes_requested' && <AlertTriangle size={16} />}
                {post.approval_status === 'approved' ? 'Conteúdo Aprovado com Sucesso!' :
                 post.approval_status === 'changes_requested' ? 'Ajustes Solicitados Enviados!' : 'Conteúdo Reprovado.'}
              </p>
              <p className="text-[11px] mt-1 opacity-80">A equipa da produtora foi notificada instantaneamente.</p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Deixar Comentário ou Pedido de Ajuste (Opcional)
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Ex: Ajustar a cor do vídeo ou trocar o take inicial..."
                  rows={3}
                  className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleResponse('rejected')}
                  className="py-3 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-2xl transition border border-red-100 cursor-pointer"
                >
                  Reprovar
                </button>
                <button
                  type="button"
                  onClick={() => handleResponse('changes_requested')}
                  className="py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-2xl transition border border-amber-100 cursor-pointer"
                >
                  Pedir Ajustes
                </button>
                <button
                  type="button"
                  onClick={() => handleResponse('approved')}
                  className="py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-2xl transition shadow-md cursor-pointer"
                >
                  Aprovar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}