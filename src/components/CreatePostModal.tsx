'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MediaPreview } from '@/components/MediaPreview';
import { InstagramImageEditor } from '@/components/media/InstagramImageEditor';
import { findClosestFormat, findExactFormat, type InstagramFormat } from '@/lib/instagramFormats';
import * as tus from 'tus-js-client';
import { 
  X, Camera, Smile, Hash, AtSign, MapPin, Bookmark,
  Smartphone, Monitor, Grid, Calendar, Plus, Video, Loader2, FolderOpen,
  MoreVertical, Crop, Check, ChevronDown,
  Heart, MessageCircle, Send, Music, AlertTriangle, ChevronUp, UserPlus, Disc, Image, History,
  Film
} from 'lucide-react';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

type ContentType = 'REEL' | 'POST' | 'STORY' | 'CARROSSEL';
type PreviewDevice = 'mobile' | 'desktop' | 'grid';
type CaptionTool = 'location' | 'link' | 'offer' | null;
interface SavedPostDraft {
  contentType: ContentType;
  caption: string;
  notes: string;
  scheduledDate: string;
  scheduledHour: number;
}

const draftStorageKey = 'bahia-homes-post-draft';
const getLocalDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const isSavedPostDraft = (value: unknown): value is SavedPostDraft => {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return ['REEL', 'POST', 'STORY', 'CARROSSEL'].includes(String(draft.contentType))
    && typeof draft.caption === 'string'
    && typeof draft.notes === 'string'
    && typeof draft.scheduledDate === 'string'
    && typeof draft.scheduledHour === 'number';
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Erro inesperado.';
};

export default function CreatePostModal({ isOpen, onClose, onPostCreated }: CreatePostModalProps) {
  const [contentType, setContentType] = useState<ContentType>('REEL');
  const [caption, setCaption] = useState('');
  const [notes, setNotes] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [captionTool, setCaptionTool] = useState<CaptionTool>(null);
  const [captionToolValue, setCaptionToolValue] = useState('');
  const [editorFeedback, setEditorFeedback] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  
  // Opções adicionais do Instagram
  const [autoPublish, setAutoPublish] = useState(true);
  const [showInFeed, setShowInFeed] = useState(true);
  const [isAIContent, setIsAIContent] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  
  // Data e Horário
  const [scheduledDate, setScheduledDate] = useState(getLocalDate);
  const [scheduledHour, setScheduledHour] = useState(19);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  // Editor de imagem (recorte nas medidas do Instagram)
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null);

  const captionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadDraft = () => {
    try {
      const savedDraft = localStorage.getItem(draftStorageKey);
      if (!savedDraft) {
        setEditorFeedback('Não há rascunho salvo neste dispositivo.');
        return;
      }
      const parsedDraft: unknown = JSON.parse(savedDraft);
      if (!isSavedPostDraft(parsedDraft)) {
        setEditorFeedback('O rascunho salvo está inválido e não pôde ser carregado.');
        return;
      }
      const draft = parsedDraft;
      setContentType(draft.contentType);
      setCaption(draft.caption);
      setNotes(draft.notes);
      setScheduledDate(draft.scheduledDate);
      setScheduledHour(draft.scheduledHour);
      setIsNotesOpen(Boolean(draft.notes));
      setDraftSaved(true);
      setEditorFeedback('Rascunho local carregado.');
    } catch (error) {
      console.error('Não foi possível carregar o rascunho local:', error);
      setEditorFeedback('Não foi possível recuperar o rascunho salvo neste dispositivo.');
    }
  };

  const handleSaveDraft = () => {
    const draft: SavedPostDraft = {
      contentType,
      caption,
      notes,
      scheduledDate,
      scheduledHour,
    };

    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      setDraftSaved(true);
      setEditorFeedback('Rascunho salvo neste dispositivo.');
    } catch (error) {
      console.error('Não foi possível salvar o rascunho local:', error);
      setEditorFeedback('Não foi possível salvar o rascunho.');
    }
  };

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  const readImageDimensions = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setMediaDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const handleEditorApply = ({ file, format }: { file: File; format: InstagramFormat }) => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setSelectedFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setMediaDimensions({ width: format.width, height: format.height });
    setIsImageEditorOpen(false);
    setEditorFeedback(`Imagem ajustada para ${format.width} × ${format.height} px (${format.ratioLabel}).`);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isVideoFile = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm)$/i));

      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
      setSelectedFile(file);
      setIsVideo(isVideoFile);
      setMediaPreviewUrl(URL.createObjectURL(file));
      setMediaDimensions(null);
      if (!isVideoFile) readImageDimensions(file);
      setEditorFeedback(`Mídia selecionada: ${file.name}`);
    }
    e.target.value = '';
  };

  // Envio ao Supabase com Suporte a Arquivos Grandes (>6MB via TUS)
  const handleSavePost = async () => {
    setLoading(true);
    setUploadStatus('Processando...');

    try {
      let finalMediaUrl = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80';

      if (selectedFile) {
        setUploadStatus('Enviando mídia...');
        const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        if (selectedFile.size > 6 * 1024 * 1024) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

          await new Promise((resolve, reject) => {
            const upload = new tus.Upload(selectedFile, {
              endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
              retryDelays: [0, 3000, 5000, 10000, 20000],
              headers: {
                authorization: `Bearer ${token}`,
                'x-upsert': 'true',
              },
              uploadDataDuringCreation: true,
              removeFingerprintOnSuccess: true,
              metadata: {
                bucketName: 'posts',
                objectName: filePath,
                contentType: selectedFile.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
                cacheControl: '3600',
              },
              chunkSize: 6 * 1024 * 1024,
              onError: (error) => {
                console.error('Erro no upload TUS:', error);
                reject(error);
              },
              onProgress: (bytesUploaded, bytesTotal) => {
                const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(0);
                setUploadStatus(`Enviando mídia (${percentage}%)...`);
              },
              onSuccess: () => {
                resolve(true);
              },
            });

            upload.start();
          });
        } else {
          const { error: uploadError } = await supabase.storage
            .from('posts')
            .upload(filePath, selectedFile, {
              cacheControl: '3600',
              upsert: false,
              contentType: selectedFile.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
            });

          if (uploadError) {
            throw new Error(`Erro no storage: ${uploadError.message}`);
          }
        }

        const { data: publicUrlData } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);

        finalMediaUrl = publicUrlData.publicUrl;
      }

      setUploadStatus('Agendando...');
      const titleVal = caption.slice(0, 25) || `${contentType} Novo`;
      const formattedHour = scheduledHour % 12 || 12;
      const ampm = scheduledHour >= 12 ? 'PM' : 'AM';
      const timeStrVal = `${formattedHour}:00 ${ampm}`;

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
        media_type: isVideo ? 'video' : 'image',
        scheduled_date: scheduledDate
      }]);

      if (dbError) throw dbError;

      if (onPostCreated) onPostCreated();
      onClose();

      setCaption('');
      setNotes('');
      setSelectedFile(null);
      setMediaPreviewUrl('');
      setIsVideo(false);
      try {
        localStorage.removeItem(draftStorageKey);
      } catch (error) {
        console.error('Erro ao limpar rascunho:', error);
      }
      setDraftSaved(false);
    } catch (error) {
      console.error('Não foi possível agendar:', error);
      alert(`Erro: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  if (!isOpen) return null;

  const isReelError = contentType === 'REEL' && mediaPreviewUrl && !isVideo;
  const contentTypeLabel = { REEL: 'Reel', POST: 'post no feed', STORY: 'Story', CARROSSEL: 'carrossel' }[contentType];
  const exactFormat = mediaDimensions && !isVideo
    ? findExactFormat(contentType, mediaDimensions.width, mediaDimensions.height)
    : null;
  const suggestedFormat = mediaDimensions && !isVideo
    ? findClosestFormat(contentType, mediaDimensions.width, mediaDimensions.height)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex h-[96vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#f8f9fa] text-gray-900 shadow-2xl">
        
        {/* Topbar Superior */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-gray-800">Criar novo post</h1>
            <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">D</span>
              <span>daimefilmes</span>
            </div>
          </div>

          <button onClick={onClose} disabled={loading} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900">
            <X size={16} /> Fechar
          </button>
        </div>

        {/* Corpo Principal */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          
          {/* LADO ESQUERDO: FORMULÁRIO */}
          <div className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto p-6 md:w-[58%] border-r border-gray-200">
            
            {/* Seletor de Tipo e Rascunho */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold shadow-2xs">
                  <InstagramIcon className="h-4 w-4 text-pink-600" />
                  <select 
                    value={contentType} 
                    onChange={(e) => { setContentType(e.target.value as ContentType); setDraftSaved(false); }}
                    className="bg-transparent font-semibold focus:outline-none"
                  >
                    <option value="REEL">REEL</option>
                    <option value="POST">POST / FEED</option>
                    <option value="STORY">STORY</option>
                    <option value="CARROSSEL">CARROSSEL</option>
                  </select>
                </div>

                <button onClick={() => fileInputRef.current?.click()} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50" title="Selecionar mídia">
                  <Plus size={16} />
                </button>

                <button onClick={handleLoadDraft} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50" title="Carregar rascunho">
                  <FolderOpen size={16} />
                </button>
              </div>

              <button onClick={() => setIsNotesOpen(!isNotesOpen)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Bookmark size={14} /> {isNotesOpen ? 'Ocultar notas' : 'Notas'}
              </button>
            </div>

            {/* Caixa de Texto e Mídia */}
            <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xs overflow-hidden">
              <textarea 
                ref={captionRef}
                value={caption} 
                onChange={(e) => { setCaption(e.target.value); setDraftSaved(false); }}
                placeholder={contentType === 'STORY' ? "Adicione textos para referência rápida..." : "Escreva sua legenda aqui..."}
                rows={5}
                className="w-full resize-none bg-transparent p-4 text-sm focus:outline-none"
              />

              {/* Thumbnail e Botão de Editar Mídia */}
              {mediaPreviewUrl && (
                <div className="flex items-center gap-3 ml-4 mb-4">
                  <div 
                    onClick={() => !isVideo && setIsImageEditorOpen(true)}
                    className="relative h-20 w-20 cursor-pointer overflow-hidden rounded-lg border border-gray-200 group"
                  >
                    {!isVideo ? (
                      <img src={mediaPreviewUrl} alt="Thumbnail" className="h-full w-full object-cover" />
                    ) : (
                      <video src={mediaPreviewUrl} className="h-full w-full object-cover" />
                    )}

                    {!isVideo && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                        <Crop size={18} />
                      </div>
                    )}
                  </div>

                  {!isVideo && (
                    <div className="min-w-0 space-y-2 pr-4">
                      {mediaDimensions && exactFormat ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-status-success">
                          <Check size={14} aria-hidden="true" />
                          {exactFormat.width} × {exactFormat.height} px, pronto para {contentTypeLabel}
                        </p>
                      ) : mediaDimensions && suggestedFormat ? (
                        <p className="text-xs leading-relaxed text-status-warning">
                          Esta imagem tem {mediaDimensions.width} × {mediaDimensions.height} px. Para {contentTypeLabel}, o Instagram usa {suggestedFormat.width} × {suggestedFormat.height} px ({suggestedFormat.ratioLabel}).
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setIsImageEditorOpen(true)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          mediaDimensions && !exactFormat
                            ? 'bg-brand-plum text-white hover:bg-brand-plum-hover'
                            : 'border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black'
                        }`}
                      >
                        <Crop size={14} />
                        {mediaDimensions && !exactFormat && suggestedFormat
                          ? `Ajustar para ${suggestedFormat.width} × ${suggestedFormat.height}`
                          : 'Ajustar recorte'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Toolbar Inferior */}
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-4 py-2 text-gray-500">
                <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} className="sr-only" />
                
                <div className="flex items-center gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="hover:text-gray-900" title="Selecionar mídia"><Camera size={16} /></button>
                  {!isVideo && mediaPreviewUrl && (
                    <button onClick={() => setIsImageEditorOpen(true)} className="text-purple-900 hover:text-purple-700" title="Editar / Cortar Mídia"><Crop size={16} /></button>
                  )}
                  <button onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)} className="hover:text-gray-900" title="Emoji"><Smile size={16} /></button>
                  <button onClick={() => setCaption(caption + ' #')} className="hover:text-gray-900" title="Hashtag"><Hash size={16} /></button>
                  <button onClick={() => setCaption(caption + ' @')} className="hover:text-gray-900" title="Menção"><AtSign size={16} /></button>
                  <button onClick={handleSaveDraft} className={`hover:text-gray-900 ${draftSaved ? 'text-purple-900' : ''}`} title="Salvar rascunho"><Bookmark size={16} fill={draftSaved ? 'currentColor' : 'none'} /></button>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                  <span>{(caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length}/30#</span>
                  <span>{caption.length}/2200</span>
                </div>
              </div>
            </div>

            {/* Notas Internas */}
            {isNotesOpen && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-gray-700">Notas internas <span className="font-normal text-gray-400">— não serão publicadas</span></span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Lembretes para sua equipe..." className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs focus:outline-none" />
              </div>
            )}

            {/* AGENDAMENTO */}
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-bold text-gray-700 block">Agendamento</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500">Data de publicação</label>
                  <input 
                    type="date" 
                    value={scheduledDate}
                    onChange={(e) => { setScheduledDate(e.target.value); setDraftSaved(false); }}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs font-semibold text-gray-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500">Horário</label>
                  <select 
                    value={scheduledHour}
                    onChange={(e) => { setScheduledHour(Number(e.target.value)); setDraftSaved(false); }}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs font-semibold text-gray-800 focus:outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map(h => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Predefinições Globais */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Predefinições globais</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Publicação automática</span>
                  <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} className="h-4 w-4 rounded-md accent-purple-900" />
                </div>
              </div>

              <div className="text-xs text-gray-400">
                <label className="flex items-center gap-2 cursor-pointer hover:text-gray-600">
                  <input type="checkbox" className="rounded-md" />
                  Usar encurtador de URL
                </label>
              </div>
            </div>

            {/* Predefinições do Instagram */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <InstagramIcon className="h-4 w-4 text-pink-600" />
                  <span className="text-xs font-bold text-gray-700">Predefinições do Instagram</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Novo</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  <UserPlus size={14} /> Adicionar colaborador
                </button>
                <button className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                  <Music size={14} /> Adicionar áudio
                </button>
              </div>

              <div className="space-y-2 pt-2 text-xs text-gray-600">
                {contentType === 'REEL' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showInFeed} onChange={(e) => setShowInFeed(e.target.checked)} className="accent-purple-900" />
                    Mostrar Reel no feed
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isAIContent} onChange={(e) => setIsAIContent(e.target.checked)} className="accent-purple-900" />
                  Conteúdo gerado por IA
                </label>
              </div>
            </div>

            {/* Alerta de Erro */}
            {isReelError && (
              <div className="flex items-center justify-between rounded-xl border border-pink-200 bg-pink-50/70 p-3 text-xs text-pink-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-pink-600" />
                  <span><strong>1 erro:</strong> Publicação automática (reel) &rarr; As imagens não são suportadas.</span>
                </div>
                <ChevronUp size={14} />
              </div>
            )}

            {editorFeedback && <p className="text-xs text-gray-500">{editorFeedback}</p>}

          </div>

          {/* LADO DIREITO: PREVIEW DINÂMICO */}
          <div className="flex min-h-0 w-full flex-col items-center justify-between bg-gray-100/70 p-6 md:w-[42%] overflow-y-auto">
            
            <div className="flex items-center gap-4 self-end text-gray-500 mb-2">
              <InstagramIcon className="h-5 w-5 text-gray-800" />
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button onClick={() => setPreviewDevice('mobile')} className={`p-1.5 rounded-md ${previewDevice === 'mobile' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><Smartphone size={14} /></button>
                <button onClick={() => setPreviewDevice('desktop')} className={`p-1.5 rounded-md ${previewDevice === 'desktop' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><Monitor size={14} /></button>
                <button onClick={() => setPreviewDevice('grid')} className={`p-1.5 rounded-md ${previewDevice === 'grid' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><Grid size={14} /></button>
              </div>
            </div>

            {/* CONTAINER MOCKUP DE CELULAR */}
            <div className="relative flex h-[580px] w-[320px] flex-col justify-between overflow-hidden rounded-[38px] border-[5px] border-slate-900 bg-black shadow-2xl">
              
              {/* Top Notch Simulador */}
              <div className="absolute top-0 left-0 right-0 h-6 bg-black z-30 flex justify-center items-center">
                <div className="w-20 h-3.5 bg-slate-900 rounded-full"></div>
              </div>

              {/* 1. PREVIEW DE REELS */}
              {contentType === 'REEL' && (
                <div className="relative h-full w-full bg-slate-950 flex flex-col justify-between pt-6">
                  <div className="z-20 flex items-center justify-between p-3 text-white bg-gradient-to-b from-black/60 to-transparent">
                    <ChevronDown size={18} className="-rotate-90" />
                    <span className="text-xs font-bold tracking-wide">Reels</span>
                    <Camera size={18} />
                  </div>

                  <div className="absolute inset-0 z-0 flex items-center justify-center bg-slate-900">
                    {mediaPreviewUrl ? (
                      <MediaPreview src={mediaPreviewUrl} mediaType={selectedFile?.type} alt="Prévia da mídia selecionada" className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-center text-xs text-gray-500 flex flex-col items-center">
                        <Film size={36} className="mb-2 text-purple-400" />
                        <span>Visualização do Reels</span>
                      </div>
                    )}
                  </div>

                  {/* Ações Laterais do Reels */}
                  <div className="absolute right-3 bottom-14 z-20 flex flex-col items-center gap-4 text-white text-xs">
                    <div className="flex flex-col items-center gap-0.5">
                      <Heart size={20} />
                      <span className="text-[10px]">0</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <MessageCircle size={20} />
                      <span className="text-[10px]">0</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <Send size={18} />
                      <span className="text-[10px]">0</span>
                    </div>
                    <MoreVertical size={18} />
                    <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-md border border-white/40 bg-black/60 overflow-hidden">
                      <Disc size={14} className="animate-spin text-white" />
                    </div>
                  </div>

                  {/* Informações Inferiores */}
                  <div className="z-20 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white pr-12 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold">D</div>
                      <span className="text-xs font-semibold">daimefilmes</span>
                    </div>
                    <p className="line-clamp-2 text-[11px] opacity-90">{caption || 'Sua legenda aqui...'}</p>
                    <div className="flex items-center gap-1 text-[10px] opacity-75">
                      <Music size={10} />
                      <span>áudio original</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. PREVIEW DE FEED / POST / CARROSSEL */}
              {(contentType === 'POST' || contentType === 'CARROSSEL') && (
                <div className="h-full w-full bg-black text-white flex flex-col pt-6 overflow-y-auto">
                  {/* Topbar do Post */}
                  <div className="flex items-center justify-between p-3 border-b border-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">D</div>
                      <span className="text-xs font-semibold">daimefilmes</span>
                    </div>
                    <MoreVertical size={16} className="text-slate-400" />
                  </div>

                  {/* Área Mídia */}
                  <div className="w-full h-72 bg-slate-950 flex items-center justify-center overflow-hidden">
                    {mediaPreviewUrl ? (
                      <MediaPreview src={mediaPreviewUrl} mediaType={selectedFile?.type} alt="Prévia da mídia selecionada" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-slate-600">
                        <Image className="w-10 h-10 mb-1" />
                        <span className="text-xs">Preview do Feed</span>
                      </div>
                    )}
                  </div>

                  {/* Ícones de Engajamento */}
                  <div className="p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Heart className="w-5 h-5 text-slate-200" />
                        <MessageCircle className="w-5 h-5 text-slate-200" />
                        <Send className="w-5 h-5 text-slate-200" />
                      </div>
                      <Bookmark className="w-5 h-5 text-slate-200" />
                    </div>

                    <p className="text-[11px] font-semibold text-slate-200">Curtido por daimefilmes e outras pessoas</p>

                    <div className="text-[11px] text-slate-300">
                      <span className="font-semibold text-white mr-1.5">daimefilmes</span>
                      {caption || <span className="text-slate-500 italic">Sua legenda aparecerá aqui...</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. PREVIEW DE STORY */}
              {contentType === 'STORY' && (
                <div className="relative h-full w-full bg-slate-950 flex flex-col justify-between p-3 pt-8">
                  {/* Barra de Progresso */}
                  <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden z-20">
                    <div className="w-1/3 h-full bg-white"></div>
                  </div>

                  {/* Header Story */}
                  <div className="flex items-center gap-2 z-20 mt-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-700 flex items-center justify-center text-xs font-bold text-white">D</div>
                    <span className="text-xs font-semibold text-white">daimefilmes</span>
                    <span className="text-[10px] text-white/60">1m</span>
                  </div>

                  {/* Conteúdo de Mídia */}
                  <div className="absolute inset-0 z-0">
                    {mediaPreviewUrl ? (
                      <MediaPreview src={mediaPreviewUrl} mediaType={selectedFile?.type} alt="Prévia da mídia selecionada" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-600">
                        <History className="w-10 h-10 mb-2 text-purple-400" />
                        <span className="text-xs">Preview do Story</span>
                      </div>
                    )}
                  </div>

                  {/* Footer Story */}
                  <div className="z-20 flex items-center gap-2 mb-2">
                    <div className="flex-1 border border-white/40 rounded-full px-3 py-1.5 text-xs text-white/80 bg-black/20 backdrop-blur-xs">
                      Enviar mensagem...
                    </div>
                    <Heart className="w-5 h-5 text-white" />
                    <Send className="w-5 h-5 text-white" />
                  </div>
                </div>
              )}

            </div>

            <div className="mt-4 max-w-sm rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-900">
              As visualizações prévias são uma aproximação da aparência de sua postagem quando publicada. A postagem final pode parecer um pouco diferente.
            </div>

          </div>

        </div>

        {/* Rodapé Fixo com Botão Agendar */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
          <button onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100">
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
              <Calendar size={14} />
              <span>{scheduledDate} às {String(scheduledHour).padStart(2, '0')}:00</span>
            </div>

            <button 
              onClick={handleSavePost}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{uploadStatus}</span>
                </>
              ) : (
                <span>Agendar / Publicar</span>
              )}
            </button>
          </div>
        </div>

      </div>

      {isImageEditorOpen && selectedFile && mediaPreviewUrl && !isVideo && (
        <InstagramImageEditor
          src={mediaPreviewUrl}
          fileName={selectedFile.name}
          contentType={contentType}
          initialFormatId={exactFormat?.id ?? suggestedFormat?.id}
          onCancel={() => setIsImageEditorOpen(false)}
          onApply={handleEditorApply}
        />
      )}

    </div>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}