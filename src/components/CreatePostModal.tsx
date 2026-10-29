'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { MediaPreview } from '@/components/MediaPreview';
import { 
  X, Camera, Smile, Hash, AtSign, MapPin, Link as LinkIcon, Percent, Bookmark,
  Smartphone, Monitor, Grid, Calendar, Plus, Video, Loader2, FolderOpen,
  MoreVertical, RotateCw, FlipHorizontal, FlipVertical, Crop, Undo2, Redo2, Check, ChevronDown,
  Heart, MessageCircle, Send, Music, AlertTriangle, ChevronUp, UserPlus, Disc
} from 'lucide-react';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

type ContentType = 'REEL' | 'POST' | 'STORY' | 'CARROSSEL';
type PreviewDevice = 'mobile' | 'desktop' | 'grid';
type CaptionTool = 'location' | 'link' | 'offer' | null;
type AspectRatioPreset = 'custom' | '1:1' | '3:4' | '4:5' | '9:16' | '2:3' | '16:9';

interface CropArea {
  x: number;
  y: number; 
  width: number;
  height: number;
}

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

  // Editor Metricool
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const [isThumbMenuOpen, setIsThumbMenuOpen] = useState(false);
  const [isAspectMenuOpen, setIsAspectMenuOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [aspectPreset, setAspectPreset] = useState<AspectRatioPreset>('custom');
  
  const [crop, setCrop] = useState<CropArea>({ x: 10, y: 10, width: 80, height: 80 });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; crop: CropArea } | null>(null);

  const captionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // Recorte de imagem
  const applyPresetRatio = useCallback((preset: AspectRatioPreset) => {
    setAspectPreset(preset);
    setIsAspectMenuOpen(false);

    if (preset === 'custom') return;

    let targetRatio = 1;
    if (preset === '1:1') targetRatio = 1;
    else if (preset === '3:4') targetRatio = 3 / 4;
    else if (preset === '4:5') targetRatio = 4 / 5;
    else if (preset === '9:16') targetRatio = 9 / 16;
    else if (preset === '2:3') targetRatio = 2 / 3;
    else if (preset === '16:9') targetRatio = 16 / 9;

    let imgAspect = 1.77;
    if (containerRef.current) {
      const imgEl = containerRef.current.querySelector('img');
      if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
        imgAspect = imgEl.naturalWidth / imgEl.naturalHeight;
      }
    }

    let newHeight = 90;
    let newWidth = (newHeight * targetRatio) / imgAspect;

    if (newWidth > 90) {
      newWidth = 90;
      newHeight = (newWidth * imgAspect) / targetRatio;
    }

    setCrop({
      x: Math.max(0, (100 - newWidth) / 2),
      y: Math.max(0, (100 - newHeight) / 2),
      width: newWidth,
      height: newHeight
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY, crop: { ...crop } });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!activeHandle || !dragStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

    let { x, y, width, height } = dragStart.crop;

    if (activeHandle === 'move') {
      x = Math.min(Math.max(0, dragStart.crop.x + deltaX), 100 - width);
      y = Math.min(Math.max(0, dragStart.crop.y + deltaY), 100 - height);
    } else if (activeHandle === 'top-left') {
      x = Math.min(Math.max(0, x + deltaX), dragStart.crop.x + dragStart.crop.width - 10);
      y = Math.min(Math.max(0, y + deltaY), dragStart.crop.y + dragStart.crop.height - 10);
      width = dragStart.crop.x + dragStart.crop.width - x;
      height = dragStart.crop.y + dragStart.crop.height - y;
    } else if (activeHandle === 'top-right') {
      y = Math.min(Math.max(0, y + deltaY), dragStart.crop.y + dragStart.crop.height - 10);
      width = Math.min(Math.max(10, dragStart.crop.width + deltaX), 100 - x);
      height = dragStart.crop.y + dragStart.crop.height - y;
    } else if (activeHandle === 'bottom-left') {
      x = Math.min(Math.max(0, x + deltaX), dragStart.crop.x + dragStart.crop.width - 10);
      width = dragStart.crop.x + dragStart.crop.width - x;
      height = Math.min(Math.max(10, dragStart.crop.height + deltaY), 100 - y);
    } else if (activeHandle === 'bottom-right') {
      width = Math.min(Math.max(10, dragStart.crop.width + deltaX), 100 - x);
      height = Math.min(Math.max(10, dragStart.crop.height + deltaY), 100 - y);
    }

    setCrop({ x, y, width, height });
  }, [activeHandle, dragStart]);

  const handleMouseUp = useCallback(() => {
    setActiveHandle(null);
    setDragStart(null);
  }, []);

  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle, handleMouseMove, handleMouseUp]);

  const handleSaveEditedImage = () => {
    if (!canvasRef.current || !selectedFile || !mediaPreviewUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mediaPreviewUrl;
    img.onload = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cropX = (crop.x / 100) * img.width;
      const cropY = (crop.y / 100) * img.height;
      const cropW = (crop.width / 100) * img.width;
      const cropH = (crop.height / 100) * img.height;

      const isRotated90 = rotation % 180 !== 0;
      canvas.width = isRotated90 ? cropH : cropW;
      canvas.height = isRotated90 ? cropW : cropH;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

      ctx.drawImage(img, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
      ctx.restore();

      canvas.toBlob((blob) => {
        if (!blob) return;

        const editedFile = new File([blob], selectedFile.name, {
          type: selectedFile.type || 'image/jpeg',
          lastModified: Date.now(),
        });

        if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
        setSelectedFile(editedFile);
        setMediaPreviewUrl(URL.createObjectURL(editedFile));
        setIsImageEditorOpen(false);
      }, selectedFile.type || 'image/jpeg', 0.95);
    };
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isVideoFile = file.type.startsWith('video/') || Boolean(file.name.match(/\.(mp4|mov|webm)$/i));

      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
      setSelectedFile(file);
      setIsVideo(isVideoFile);
      setMediaPreviewUrl(URL.createObjectURL(file));
      setRotation(0);
      setFlipX(false);
      setFlipY(false);
      setCrop({ x: 10, y: 10, width: 80, height: 80 });
      setAspectPreset('custom');
      setEditorFeedback(`Mídia selecionada: ${file.name}`);
    }
    e.target.value = '';
  };

  // Envio ao Supabase e banco de dados
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

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: selectedFile.type || (isVideo ? 'video/mp4' : 'image/jpeg')
          });

        if (uploadError) {
          throw new Error(`Erro no storage: ${uploadError.message}`);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex h-[96vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#f8f9fa] text-gray-900 shadow-2xl">
        
        {/* Topbar Superior Estilo Metricool */}
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
          
          {/* LADO ESQUERDO: FORMULÁRIO COMPLETO */}
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
                    <option value="POST">POST</option>
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
                placeholder="Escreva sua legenda aqui..."
                rows={5}
                className="w-full resize-none bg-transparent p-4 text-sm focus:outline-none"
              />

              {/* Thumbnail da Mídia */}
              {mediaPreviewUrl && (
                <div className="relative ml-4 mb-4 h-20 w-20 overflow-hidden rounded-lg border border-gray-200 group">
                  {!isVideo ? (
                    <img src={mediaPreviewUrl} alt="Thumbnail" className="h-full w-full object-cover" />
                  ) : (
                    <video src={mediaPreviewUrl} className="h-full w-full object-cover" />
                  )}

                  {!isVideo && (
                    <button
                      type="button"
                      onClick={() => setIsThumbMenuOpen(!isThumbMenuOpen)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <MoreVertical size={12} />
                    </button>
                  )}

                  {isThumbMenuOpen && (
                    <div className="absolute left-1 top-8 z-20 w-32 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      <button
                        onClick={() => { setIsThumbMenuOpen(false); setIsImageEditorOpen(true); }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        <Crop size={12} /> Editar Imagem
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

            {/* SEÇÃO DE AGENDAMENTO: DATA E HORÁRIO */}
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
                    {Array.from({ length: 14 }, (_, i) => i + 11).map(h => (
                      <option key={h} value={h}>{h}:00</option>
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showInFeed} onChange={(e) => setShowInFeed(e.target.checked)} className="accent-purple-900" />
                  Mostrar Reel no feed
                </label>
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
                  <span><strong>1 erro:</strong> Publicação automática (reel) $\rightarrow$ As imagens não são suportadas.</span>
                </div>
                <ChevronUp size={14} />
              </div>
            )}

            {editorFeedback && <p className="text-xs text-gray-500">{editorFeedback}</p>}

          </div>

          {/* LADO DIREITO: PREVIEW */}
          <div className="flex min-h-0 w-full flex-col items-center justify-between bg-gray-100/70 p-6 md:w-[42%] overflow-y-auto">
            
            <div className="flex items-center gap-4 self-end text-gray-500 mb-2">
              <InstagramIcon className="h-5 w-5 text-gray-800" />
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button onClick={() => setPreviewDevice('mobile')} className={`p-1.5 rounded-md ${previewDevice === 'mobile' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><Smartphone size={14} /></button>
                <button onClick={() => setPreviewDevice('desktop')} className={`p-1.5 rounded-md ${previewDevice === 'desktop' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><Monitor size={14} /></button>
                <button onClick={() => setPreviewDevice('grid')} className={`p-1.5 rounded-md ${previewDevice === 'grid' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><Grid size={14} /></button>
              </div>
            </div>

            {/* MOLDURA CELULAR */}
            <div className="relative flex h-[580px] w-[320px] flex-col justify-between overflow-hidden rounded-[32px] border-4 border-gray-900 bg-black shadow-2xl">
              
              <div className="z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent text-white">
                <ChevronDown size={20} className="-rotate-90" />
                <span className="text-xs font-bold tracking-wide">Reels</span>
                <Camera size={18} />
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-gray-900">
                {mediaPreviewUrl ? (
                  <MediaPreview src={mediaPreviewUrl} mediaType={selectedFile?.type} className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center text-xs text-gray-400">
                    <Video size={32} className="mx-auto mb-2 text-lime-400" />
                    <span>Vídeo indisponível</span>
                  </div>
                )}

                <div className="absolute right-3 bottom-12 z-20 flex flex-col items-center gap-4 text-white text-xs">
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
                  
                  <div className="mt-2 flex h-7 w-7 items-center justify-center rounded-md border border-white/40 bg-black/60 overflow-hidden">
                    <Disc size={16} className="animate-spin" />
                  </div>
                </div>

                <div className="absolute left-3 bottom-3 right-12 z-20 text-white space-y-1">
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

            </div>

            <div className="mt-4 max-w-sm rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-900">
              As visualizações prévias são uma aproximação da aparência de sua postagem quando publicada. A postagem final pode parecer um pouco diferente.
            </div>

          </div>

        </div>

        {/* Rodapé Fixo com Botão Agendar Conectado */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
          <button onClick={onClose} disabled={loading} className="rounded-lg px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100">
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
              <Calendar size={14} />
              <span>{scheduledDate} às {scheduledHour}:00</span>
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

      {/* MODAL EDITOR DE IMAGEM */}
      {isImageEditorOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="flex h-full max-h-[95dvh] w-full max-w-4xl flex-col rounded-2xl border border-gray-200 bg-white text-gray-900 overflow-hidden shadow-2xl">
            
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
              <span className="text-sm font-medium">Editor de imagens</span>
              <button onClick={() => setIsImageEditorOpen(false)} className="text-gray-500 hover:text-gray-900"><X size={18} /></button>
            </div>

            <div className="relative flex items-center justify-center gap-6 border-b border-gray-200 bg-white py-2.5 px-4 text-xs font-medium">
              <button onClick={() => setRotation((r) => (r + 90) % 360)} className="flex items-center gap-1.5 hover:text-purple-900"><RotateCw size={14} /> Girar</button>
              <button onClick={() => setFlipX((f) => !f)} className="flex items-center gap-1.5 hover:text-purple-900"><FlipHorizontal size={14} /> Virar X</button>
              <button onClick={() => setFlipY((f) => !f)} className="flex items-center gap-1.5 hover:text-purple-900"><FlipVertical size={14} /> Virar Y</button>

              <div className="relative">
                <button onClick={() => setIsAspectMenuOpen(!isAspectMenuOpen)} className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 hover:bg-white shadow-2xs">
                  <Crop size={14} /> Proporção de recorte/aspecto <ChevronDown size={12} />
                </button>

                {isAspectMenuOpen && (
                  <div className="absolute left-0 top-10 z-40 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl space-y-1">
                    <button onClick={() => applyPresetRatio('custom')} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-gray-100">Personalizado {aspectPreset === 'custom' && <Check size={14} className="text-purple-900" />}</button>
                    <button onClick={() => applyPresetRatio('1:1')} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-gray-100">1:1 Recorte quadrado {aspectPreset === '1:1' && <Check size={14} className="text-purple-900" />}</button>
                    <button onClick={() => applyPresetRatio('3:4')} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-gray-100">3:4 Instagram Retrato {aspectPreset === '3:4' && <Check size={14} className="text-purple-900" />}</button>
                    <button onClick={() => applyPresetRatio('4:5')} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-gray-100">4:5 Retrato {aspectPreset === '4:5' && <Check size={14} className="text-purple-900" />}</button>
                    <button onClick={() => applyPresetRatio('9:16')} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs hover:bg-gray-100">9:16 Instagram Story {aspectPreset === '9:16' && <Check size={14} className="text-purple-900" />}</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-100 p-8 overflow-hidden">
              <div ref={containerRef} className="relative flex items-center justify-center max-h-full max-w-full select-none" style={{ transform: `rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})` }}>
                <img src={mediaPreviewUrl} alt="Editor" className="max-h-[60vh] max-w-full object-contain pointer-events-none" />

                <div className="absolute inset-0 bg-black/40 pointer-events-none" style={{ clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${crop.x}% ${crop.y}%, ${crop.x}% ${crop.y + crop.height}%, ${crop.x + crop.width}% ${crop.y + crop.height}%, ${crop.x + crop.width}% ${crop.y}%, ${crop.x}% ${crop.y}%)` }} />

                <div onMouseDown={(e) => handleMouseDown(e, 'move')} className="absolute border border-white/80 shadow-2xs cursor-grab active:cursor-grabbing" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}>
                  <div onMouseDown={(e) => handleMouseDown(e, 'top-left')} className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-black border-2 border-white cursor-nwse-resize" />
                  <div onMouseDown={(e) => handleMouseDown(e, 'top-right')} className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-black border-2 border-white cursor-nesw-resize" />
                  <div onMouseDown={(e) => handleMouseDown(e, 'bottom-left')} className="absolute -left-3 -bottom-3 h-6 w-6 rounded-full bg-black border-2 border-white cursor-nesw-resize" />
                  <div onMouseDown={(e) => handleMouseDown(e, 'bottom-right')} className="absolute -right-3 -bottom-3 h-6 w-6 rounded-full bg-black border-2 border-white cursor-nwse-resize" />
                </div>
              </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-3">
              <button onClick={() => setIsImageEditorOpen(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={handleSaveEditedImage} className="rounded-lg bg-black px-5 py-2 text-xs font-semibold text-white hover:bg-gray-800">Salvar</button>
            </div>

          </div>
        </div>
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