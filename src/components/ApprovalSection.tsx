'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Plus, Copy, CheckCircle, Clock, AlertCircle, Home, Upload, Send } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Post {
  id: string;
  house_name: string;
  caption: string;
  media_url: string;
  media_type: 'image' | 'video';
  approval_status: 'pending' | 'approved' | 'changes_requested';
  approval_token: string;
  client_feedback?: string;
}

export default function ApprovalSection() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Campos para o novo conteúdo
  const [houseName, setHouseName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
      if (data && data.length > 0 && !selectedPost) {
        setSelectedPost(data[0]);
      }
    } catch (err) {
      console.error('Erro ao buscar posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setMediaPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!houseName.trim()) {
      alert('Por favor, insira o nome da casa.');
      return;
    }
    if (!file) {
      alert('Por favor, faça upload de um vídeo ou foto.');
      return;
    }

    try {
      setSubmitting(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      // Enviando para a nova pasta dedicada aos ficheiros de aprovação no bucket 'posts'
      const filePath = `approval-uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(filePath);
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

      const { error: dbError } = await supabase.from('posts').insert([
        {
          house_name: houseName,
          caption: caption,
          media_url: urlData.publicUrl,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          approval_status: 'pending',
          approval_token: token,
          platform: 'instagram',
          scheduled_date: new Date().toISOString().split('T')[0],
          scheduled_time: '19:00',
        },
      ]);

      if (dbError) throw dbError;

      setIsModalOpen(false);
      setHouseName('');
      setCaption('');
      setFile(null);
      setMediaPreview(null);
      fetchPosts();
      alert('Vídeo/Foto enviado para a pasta de aprovação com sucesso!');
    } catch (err: any) {
      console.error('Erro no upload:', err);
      alert(`Erro ao enviar: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const copyApprovalLink = (token: string, postId: string) => {
    const link = `${window.location.origin}/approval/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(postId);
    setTimeout(() => setCopiedId(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-200/80 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-gray-900">Central de Aprovação de Conteúdo</h2>
          <p className="text-xs text-gray-500 mt-0.5">Envie o link exclusivo para a empresa avaliar, aprovar ou solicitar ajustes no material.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gray-900 hover:bg-gray-800 text-white font-medium text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-2xs"
        >
          <Plus size={15} /> Novo Conteúdo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-2xs lg:col-span-1">
          <div className="p-4 border-b border-gray-100 font-bold text-xs uppercase tracking-wider text-gray-400">
            Conteúdos em Pipeline ({posts.length})
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400">A carregar...</div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">Nenhum conteúdo criado ainda.</div>
            ) : (
              posts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPost(p)}
                  className={`p-4 cursor-pointer transition flex items-center gap-3 ${
                    selectedPost?.id === p.id ? 'bg-gray-50 border-l-4 border-gray-900' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                    {p.media_type === 'video' ? (
                      <video src={p.media_url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={p.media_url} alt="Mídia" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-gray-900 truncate max-w-[100px]">{p.house_name || 'Casa'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                        p.approval_status === 'approved' ? 'bg-green-50 text-green-700' :
                        p.approval_status === 'changes_requested' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.approval_status === 'approved' ? <CheckCircle size={10} /> :
                         p.approval_status === 'changes_requested' ? <AlertCircle size={10} /> : <Clock size={10} />}
                        {p.approval_status === 'approved' ? 'Aprovado' :
                         p.approval_status === 'changes_requested' ? 'Ajustes' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-1">{p.caption || 'Sem comentários'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs lg:col-span-2 flex flex-col justify-between">
          {selectedPost ? (
            <div className="space-y-6">
              <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-800 px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit">
                    <Home size={12} /> {selectedPost.house_name}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 mt-2">Validação Externa para Cliente</h3>
                </div>

                <button
                  onClick={() => copyApprovalLink(selectedPost.approval_token, selectedPost.id)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-xs"
                >
                  <Copy size={13} />
                  {copiedId === selectedPost.id ? '✓ Link Copiado!' : 'Copiar Link de Aprovação'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black rounded-2xl overflow-hidden aspect-[9/16] max-h-[320px] flex items-center justify-center">
                  {selectedPost.media_type === 'video' ? (
                    <video src={selectedPost.media_url} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={selectedPost.media_url} alt="Preview" className="w-full h-full object-contain" />
                  )}
                </div>

                <div className="flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-gray-400 mb-1">Comentário / Descrição do Vídeo</h4>
                    <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-800 max-h-36 overflow-y-auto border border-gray-100 font-medium">
                      {selectedPost.caption || 'Nenhum comentário inserido.'}
                    </div>

                    {selectedPost.client_feedback && (
                      <div className="mt-4">
                        <h4 className="text-xs font-bold uppercase text-amber-600 mb-1">Feedback / Solicitação de Ajuste do Cliente</h4>
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
                          {selectedPost.client_feedback}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-xs text-gray-400">Selecione um conteúdo na lista ao lado para gerir.</div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">Novo Conteúdo para Aprovação</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xs font-bold">✕</button>
            </div>

            <form onSubmit={handleCreatePost} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nome da Casa</label>
                <input
                  type="text"
                  value={houseName}
                  onChange={(e) => setHouseName(e.target.value)}
                  placeholder="Ex: Villa Trancoso, Casa Mar, etc."
                  className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Subir Vídeo ou Foto</label>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-gray-400 transition bg-gray-50/50 relative">
                  <input
                    type="file"
                    accept="video/*,image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {mediaPreview ? (
                    <div className="flex items-center justify-center gap-3">
                      {file?.type.startsWith('video/') ? (
                        <video src={mediaPreview} className="h-16 rounded-lg object-cover" />
                      ) : (
                        <img src={mediaPreview} alt="Preview" className="h-16 rounded-lg object-cover" />
                      )}
                      <span className="text-xs text-gray-700 font-semibold truncate max-w-[200px]">{file?.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-2">
                      <Upload size={20} className="text-gray-400 mb-1" />
                      <p className="text-xs font-semibold text-gray-700">Clique para selecionar vídeo ou foto</p>
                      <p className="text-[10px] text-gray-400">MP4, MOV, PNG ou JPG</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Comentário do Vídeo / Observações</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="Adicione detalhes sobre o corte, legenda ou instruções para o cliente..."
                  className="w-full p-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none font-medium"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-gray-900 hover:bg-gray-800 rounded-xl shadow-2xs flex items-center gap-2"
                >
                  <Send size={13} />
                  {submitting ? 'A enviar...' : 'Enviar vídeo para aprovação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}