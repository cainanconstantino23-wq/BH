'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Copy, Calendar, Send, Trash2, Image as ImageIcon } from 'lucide-react';

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
  const [scheduledDate, setScheduledDate] = useState('2026-10-28');
  const [scheduledTime, setScheduledTime] = useState('19:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async (selectLatest = false) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      
      const formatted = (data || []).map((item: any) => ({
        ...item,
        caption: item.caption || item.content || '',
        media_url: item.image_url || item.media_url || '',
        house_name: item.house_name || item.title || 'Casa',
        approval_token: item.approval_token || String(item.id)
      }));

      setPosts(formatted);
      
      if (formatted.length > 0) {
        if (selectLatest || !selectedPost) {
          setSelectedPost(formatted[0]);
        }
      } else {
        setSelectedPost(null);
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

  const handleSendForApproval = async () => {
    if (!houseName.trim()) {
      alert('Por favor, insira o nome da casa / cliente.');
      return;
    }
    if (!file) {
      alert('Por favor, selecione uma imagem ou vídeo.');
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
      
      await fetchPosts(true);
      
      alert('Conteúdo enviado com sucesso e adicionado à fila!');
    } catch (err: any) {
      console.error('Erro detalhado:', err);
      alert(`Erro ao enviar: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const copyApprovalLink = (token: string, postId: string | number) => {
    const link = `${window.location.origin}/approval/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(String(postId));
    setTimeout(() => setCopiedId(null), 3000);
  };

  const deletePost = async (postId: string | number) => {
    if (!confirm('Deseja eliminar este registo de aprovação?')) return;
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      fetchPosts();
      setSelectedPost(null);
    } catch (err: any) {
      alert(`Erro ao eliminar: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border-2 border-orange-400 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-4 h-8 bg-orange-500 rounded-full"></div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Central de Aprovação de Clientes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Gerencie os conteúdos enviados, verifique aprovações/reprovações e crie novos links.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-2 transition shadow-md cursor-pointer"
        >
          <Plus size={16} /> Novo Post para Aprovação
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm lg:col-span-1">
          <div className="p-4 border-b border-gray-100 font-bold text-xs uppercase tracking-wider text-orange-600 bg-orange-50 flex justify-between items-center">
            <span>Fila de Aprovação</span>
            <span className="bg-orange-200 text-orange-900 px-2 py-0.5 rounded-full text-[10px] font-bold">{posts.length}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400">A carregar...</div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">Nenhum conteúdo em aprovação.</div>
            ) : (
              posts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPost(p)}
                  className={`p-4 cursor-pointer transition flex items-center gap-3 ${
                    selectedPost?.id === p.id ? 'bg-orange-50/60 border-l-4 border-orange-500' : 'hover:bg-gray-50'
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
                      <span className="text-[10px] font-bold uppercase text-gray-900 truncate max-w-[90px]">{p.house_name || 'Casa'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                        p.approval_status === 'approved' ? 'bg-green-50 text-green-700' :
                        p.approval_status === 'changes_requested' ? 'bg-amber-50 text-amber-700' :
                        p.approval_status === 'rejected' ? 'bg-red-50 text-red-700' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {p.approval_status === 'approved' ? 'Aprovado' :
                         p.approval_status === 'changes_requested' ? 'Ajustes' :
                         p.approval_status === 'rejected' ? 'Reprovado' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-1">{p.caption || 'Sem legenda'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
          {selectedPost ? (
            <div className="space-y-6">
              <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 px-2.5 py-1 rounded-lg">
                    {selectedPost.house_name || 'Casa'}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 mt-2">Gestão de Link e Resposta do Cliente</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => deletePost(selectedPost.id)}
                    className="p-2.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-xl transition cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="bg-orange-50/50 border border-orange-200 p-4 rounded-2xl space-y-2">
                <label className="block text-[10px] font-bold uppercase text-orange-800 tracking-wider">
                  Link Exclusivo de Aprovação para o Cliente (Sem Login)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/approval/${selectedPost.approval_token}`}
                    className="w-full p-2.5 text-xs bg-white border border-orange-200 rounded-xl text-gray-700 font-mono select-all"
                  />
                  <button
                    onClick={() => copyApprovalLink(selectedPost.approval_token, selectedPost.id)}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-sm shrink-0 cursor-pointer"
                  >
                    <Copy size={13} />
                    {copiedId === String(selectedPost.id) ? '✓ Copiado!' : 'Copiar Link'}
                  </button>
                  
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Olá! Segue o link exclusivo para aprovação do vídeo da ${selectedPost.house_name}: ${window.location.origin}/approval/${selectedPost.approval_token}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-sm shrink-0 cursor-pointer"
                    title="Enviar por WhatsApp"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black rounded-2xl overflow-hidden aspect-[9/16] max-h-[320px] flex items-center justify-center">
                  {selectedPost.media_type === 'video' ? (
                    <video src={selectedPost.media_url} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={selectedPost.media_url} alt="Mídia" className="w-full h-full object-contain" />
                  )}
                </div>

                <div className="flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-gray-400 mb-1">Legenda / Copy</h4>
                    <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-800 max-h-36 overflow-y-auto border border-gray-100 font-medium">
                      {selectedPost.caption || 'Sem legenda inserida.'}
                    </div>

                    {selectedPost.client_feedback && (
                      <div className="mt-4">
                        <h4 className="text-xs font-bold uppercase text-amber-600 mb-1">Feedback / Comentário do Cliente</h4>
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 font-medium">
                          {selectedPost.client_feedback}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-xs text-gray-400">Selecione um item na lista ao lado para ver os detalhes e o link.</div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col md:flex-row max-h-[90vh]">
            
            <div className="flex-1 p-6 overflow-y-auto space-y-4 border-r border-gray-100">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase bg-orange-100 text-orange-800 px-3 py-1 rounded-xl">REELS (Vídeo Vertical)</span>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm font-bold cursor-pointer">✕</button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nome da Casa / Cliente</label>
                <input
                  type="text"
                  value={houseName}
                  onChange={(e) => setHouseName(e.target.value)}
                  placeholder="Ex: Villa Trancoso"
                  className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none font-semibold"
                />
              </div>

              <div className="border border-gray-200 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escreva sua legenda aqui..."
                  rows={6}
                  className="w-full text-xs text-gray-800 focus:outline-none resize-none font-medium"
                />
                
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-gray-500">
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer hover:text-orange-600 transition"><ImageIcon size={16} /><input type="file" accept="video/*,image/*" onChange={handleFileChange} className="hidden" /></label>
                  </div>
                  <span className="text-[10px] text-gray-400">{caption.length}/2200</span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-96 bg-gray-50 p-6 flex flex-col justify-between">
              <div className="flex flex-col items-center justify-center flex-1 my-4">
                <div className="w-full aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-lg flex items-center justify-center relative border-4 border-gray-800 max-h-[360px]">
                  {mediaPreview ? (
                    file?.type.startsWith('video/') ? (
                      <video src={mediaPreview} controls className="w-full h-full object-contain" />
                    ) : (
                      <img src={mediaPreview} alt="Preview" className="w-full h-full object-contain" />
                    )
                  ) : (
                    <div className="text-center p-4">
                      <ImageIcon size={32} className="text-gray-600 mx-auto mb-2" />
                      <p className="text-[11px] text-gray-400 font-medium">Selecione uma imagem ou vídeo no ícone de câmara ao lado</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendForApproval}
                  disabled={submitting}
                  className="px-6 py-3 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 transition"
                >
                  <Send size={14} />
                  {submitting ? 'A enviar...' : 'Enviar para Aprovação'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}