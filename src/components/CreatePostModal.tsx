'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  X, Camera, Smile, Hash, AtSign, MapPin, Link, Percent, Bookmark, 
  Smartphone, Monitor, Grid, Calendar, ChevronDown, Plus, Video, Loader2
} from 'lucide-react';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

export default function CreatePostModal({ isOpen, onClose, onPostCreated }: CreatePostModalProps) {
  const [contentType, setContentType] = useState<'REEL' | 'POST' | 'STORY' | 'CARROSSEL'>('REEL');
  const [caption, setCaption] = useState('');
  const [isAutoPublish, setIsAutoPublish] = useState(true);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop' | 'grid'>('mobile');
  
  // Arquivo local e URL de preview leve
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduledHour, setScheduledHour] = useState(19);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  if (!isOpen) return null;

  // Carregamento instantâneo via URL local do browser
  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setIsVideo(file.type.startsWith('video/'));
      setMediaPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSavePost = async () => {
    setLoading(true);
    setUploadStatus('Processando...');

    try {
      let finalMediaUrl = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80';

      // 1. Upload do arquivo para o Storage do Supabase se houver arquivo selecionado
      if (selectedFile) {
        setUploadStatus('Enviando mídia...');
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`Erro no storage: ${uploadError.message}. Verifique se o bucket 'posts' foi criado e está público.`);
        }

        // Resgatar a URL pública do arquivo
        const { data: publicUrlData } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);

        finalMediaUrl = publicUrlData.publicUrl;
      }

      // 2. Gravando o post com a URL do arquivo no banco de dados
      setUploadStatus('Agendando publicação...');
      const titleVal = caption.slice(0, 25) || `${contentType} Novo`;
      const timeStrVal = `${scheduledHour > 12 ? scheduledHour - 12 : scheduledHour}:00 ${scheduledHour >= 12 ? 'PM' : 'AM'}`;

      const dateObj = new Date(scheduledDate);
      const dayIndex = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;

      const { error: dbError } = await supabase.from('posts').insert([{
        title: titleVal,
        content: caption,
        platform: contentType,
        day_index: dayIndex,
        hour: scheduledHour,
        time_string: timeStrVal,
        image_url: finalMediaUrl,
        scheduled_date: scheduledDate
      }]);

      if (dbError) throw dbError;

      if (onPostCreated) onPostCreated();
      onClose();
      
      // Limpa os estados
      setCaption('');
      setSelectedFile(null);
      setMediaPreviewUrl('');
      setIsVideo(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao agendar publicação.');
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden text-gray-900">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-gray-100 transition shadow-xs">
              <div className="w-6 h-6 rounded-full bg-[#231b2d] text-[#ccf600] flex items-center justify-center text-xs font-bold">D</div>
              <span className="text-xs font-bold text-gray-800">daimefilmes</span>
              <ChevronDown size={14} className="text-gray-400" />
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 p-1.5 rounded-lg hover:bg-gray-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Corpo Principal */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Painel Esquerdo: Editor */}
          <div className="w-1/2 p-6 flex flex-col gap-4 overflow-y-auto border-r border-gray-200">
            
            <div className="flex items-center gap-3">
              <select 
                value={contentType} 
                onChange={(e) => setContentType(e.target.value as any)}
                className="bg-gray-50 border border-gray-200 text-xs font-bold rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#231b2d] cursor-pointer"
              >
                <option value="REEL">REELS (Vídeo Vertical)</option>
                <option value="POST">POST (Feed)</option>
                <option value="STORY">STORY</option>
                <option value="CARROSSEL">CARROSSEL</option>
              </select>

              <button className="flex items-center justify-center w-8 h-8 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition">
                <Plus size={16} />
              </button>

              <button className="ml-auto text-xs bg-gray-50 border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-xl text-gray-700 font-semibold transition">
                Notas
              </button>
            </div>

            {/* Caixa de Texto e Barra de Mídia */}
            <div className="flex-1 flex flex-col bg-gray-50 border border-gray-200 rounded-xl overflow-hidden min-h-[220px]">
              <textarea 
                value={caption} 
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escreva sua legenda aqui..."
                className="w-full flex-1 bg-transparent p-4 text-xs text-gray-800 placeholder-gray-400 focus:outline-none resize-none font-medium"
              />
              
              <div className="flex items-center justify-between p-2.5 border-t border-gray-200 bg-white">
                <div className="flex items-center gap-1 text-gray-500">
                  <label className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition cursor-pointer" title="Carregar Mídia">
                    <Camera size={16} />
                    <input type="file" accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
                  </label>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><Smile size={16} /></button>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><Hash size={16} /></button>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><AtSign size={16} /></button>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><MapPin size={16} /></button>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><Link size={16} /></button>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><Percent size={16} /></button>
                  <button className="p-1.5 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"><Bookmark size={16} /></button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                  <span>0/30 #</span>
                  <span>{caption.length}/2200</span>
                </div>
              </div>
            </div>

            {/* Configurações de Data e Horário */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Data</label>
                  <input 
                    type="date" 
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Horário</label>
                  <select 
                    value={scheduledHour}
                    onChange={(e) => setScheduledHour(Number(e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-semibold text-gray-800"
                  >
                    {Array.from({ length: 14 }, (_, i) => i + 11).map(h => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <div>
                  <p className="text-xs font-bold text-gray-800">Publicação automática</p>
                  <p className="text-[11px] text-gray-500">Publicar diretamente no horário selecionado.</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={isAutoPublish} 
                  onChange={(e) => setIsAutoPublish(e.target.checked)}
                  className="w-4 h-4 accent-[#231b2d] rounded cursor-pointer"
                />
              </div>
            </div>

          </div>

          {/* Painel Direito: Preview em Tempo Real */}
          <div className="w-1/2 p-6 bg-gray-50/60 flex flex-col items-center justify-between">
            
            <div className="flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl shadow-xs">
              <button 
                onClick={() => setPreviewDevice('mobile')} 
                className={`p-1.5 rounded-lg transition ${previewDevice === 'mobile' ? 'bg-[#231b2d] text-[#ccf600]' : 'text-gray-400 hover:text-gray-800'}`}
              >
                <Smartphone size={16} />
              </button>
              <button 
                onClick={() => setPreviewDevice('desktop')} 
                className={`p-1.5 rounded-lg transition ${previewDevice === 'desktop' ? 'bg-[#231b2d] text-[#ccf600]' : 'text-gray-400 hover:text-gray-800'}`}
              >
                <Monitor size={16} />
              </button>
              <button 
                onClick={() => setPreviewDevice('grid')} 
                className={`p-1.5 rounded-lg transition ${previewDevice === 'grid' ? 'bg-[#231b2d] text-[#ccf600]' : 'text-gray-400 hover:text-gray-800'}`}
              >
                <Grid size={16} />
              </button>
            </div>

            {/* Simulação do Smartphone */}
            <div className="w-[260px] h-[430px] bg-black border-4 border-gray-800 rounded-3xl flex flex-col justify-between overflow-hidden relative shadow-xl">
              <div className="flex items-center gap-2 p-3 bg-gradient-to-b from-black/80 to-transparent z-10">
                <div className="w-6 h-6 rounded-full bg-[#231b2d] text-[#ccf600] flex items-center justify-center text-[10px] font-bold">D</div>
                <span className="text-[11px] font-bold text-white">daimefilmes</span>
              </div>

              {/* Preview de Mídia */}
              {mediaPreviewUrl ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  {isVideo || contentType === 'REEL' ? (
                    <video src={mediaPreviewUrl} controls autoPlay loop muted className="w-full h-full object-cover" />
                  ) : (
                    <img src={mediaPreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-gray-500 text-xs text-center p-4">
                  <Video size={24} className="mb-2 text-gray-600" />
                  <span>Selecione uma imagem ou vídeo</span>
                </div>
              )}

              <div className="p-3 bg-gradient-to-t from-black/90 to-transparent z-10">
                <p className="text-[11px] text-gray-200 line-clamp-2 font-medium">
                  {caption || "Sua legenda aparecerá aqui..."}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 text-center max-w-xs font-medium">
              A pré-visualização é uma simulação do layout da rede social.
            </p>
          </div>

        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-200 bg-white">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition">
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-xs text-gray-700 font-semibold">
              <Calendar size={14} className="text-gray-400" />
              <span>{scheduledDate} às {scheduledHour}:00</span>
            </div>

            <button 
              onClick={handleSavePost}
              disabled={loading}
              className="flex items-center gap-2 bg-[#231b2d] hover:bg-black text-[#ccf600] text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-[#ccf600]" />
                  <span>{uploadStatus}</span>
                </>
              ) : (
                <>
                  <span>Agendar</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}