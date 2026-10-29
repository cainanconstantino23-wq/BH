'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MediaPreview } from '@/components/MediaPreview';
import { 
  X, Camera, Smile, Hash, AtSign, MapPin, Link, Percent, Bookmark,
  Smartphone, Monitor, Grid, Calendar, Plus, Video, Loader2, FolderOpen
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
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  
  const [scheduledDate, setScheduledDate] = useState(getLocalDate);
  const [scheduledHour, setScheduledHour] = useState(19);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
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
      setEditorFeedback('Rascunho local carregado. A mídia precisa ser selecionada novamente.');
    } catch (error) {
      console.error('Não foi possível carregar o rascunho local:', error);
      setEditorFeedback('Não foi possível recuperar o rascunho salvo neste dispositivo.');
    }
  };

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  if (!isOpen) return null;

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
      setSelectedFile(file);
      setIsVideo(file.type.startsWith('video/'));
      setMediaPreviewUrl(URL.createObjectURL(file));
      setEditorFeedback(`Mídia selecionada: ${file.name}`);
    }
    e.target.value = '';
  };

  const insertCaptionText = (text: string) => {
    const textarea = captionRef.current;
    const selectionStart = textarea?.selectionStart ?? caption.length;
    const selectionEnd = textarea?.selectionEnd ?? caption.length;
    const nextCaption = `${caption.slice(0, selectionStart)}${text}${caption.slice(selectionEnd)}`;

    if (nextCaption.length > 2200) {
      setEditorFeedback('A legenda pode ter no máximo 2.200 caracteres.');
      return;
    }

    setCaption(nextCaption);
    setDraftSaved(false);
    setEditorFeedback('');
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(selectionStart + text.length, selectionStart + text.length);
    });
  };

  const handleCaptionToolSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = captionToolValue.trim();
    if (!value || !captionTool) return;

    if (captionTool === 'link') {
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Protocolo não permitido');
      } catch {
        setEditorFeedback('Informe um link válido usando http:// ou https://.');
        return;
      }
      insertCaptionText(`🔗 ${value}`);
    } else if (captionTool === 'location') {
      insertCaptionText(`📍 ${value}`);
    } else {
      insertCaptionText(`🏷️ ${value}`);
    }

    setCaptionTool(null);
    setCaptionToolValue('');
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
      setEditorFeedback('Rascunho salvo neste dispositivo. Ele não será publicado.');
    } catch (error) {
      console.error('Não foi possível salvar o rascunho local:', error);
      setEditorFeedback('Não foi possível salvar o rascunho neste dispositivo.');
    }
  };

  const handleSavePost = async () => {
    setLoading(true);
    setUploadStatus('Processando...');

    try {
      let finalMediaUrl = 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80';

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
          throw new Error(`Erro no storage: ${uploadError.message}. Verifique se o bucket 'posts' foi criado.`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);

        finalMediaUrl = publicUrlData.publicUrl;
      }

      setUploadStatus('Agendando...');
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
        media_type: selectedFile?.type.startsWith('video/') ? 'video' : 'image',
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
        console.error('Não foi possível limpar o rascunho local após o agendamento:', error);
      }
      setDraftSaved(false);
    } catch (error) {
      console.error('Não foi possível agendar a publicação:', error);
      alert(`Não foi possível agendar a publicação: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  const previewFrameClass = previewDevice === 'mobile'
    ? 'aspect-[9/16] max-h-[430px] max-w-[260px] rounded-3xl border-4 border-gray-800'
    : previewDevice === 'desktop'
      ? 'aspect-video max-h-[320px] max-w-[520px] rounded-panel border border-border'
      : 'aspect-square max-h-[300px] max-w-[300px] rounded-control border border-border';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-plum/45 p-2 backdrop-blur-xs sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="create-post-title" className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-panel border border-border bg-surface text-ink">
        
        <div className="flex items-center justify-between border-b border-border bg-canvas/60 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-plum text-xs font-bold text-brand-lime">D</span>
              <span className="text-xs font-semibold text-ink">daimefilmes</span>
            </div>
            <h2 id="create-post-title" className="hidden text-sm font-semibold text-ink sm:block">Nova publicação</h2>
          </div>
          <button type="button" aria-label="Fechar criação de publicação" onClick={onClose} disabled={loading} className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          
          <div className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto border-b border-border p-4 sm:p-6 md:w-1/2 md:border-b-0 md:border-r">
            
            <div className="flex flex-wrap items-center gap-2">
              <select 
                value={contentType} 
                onChange={(e) => { setContentType(e.target.value as ContentType); setDraftSaved(false); }}
                aria-label="Tipo de publicação"
                className="min-h-11 rounded-control border border-border bg-canvas px-3 text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum md:text-sm"
              >
                <option value="REEL">REELS (Vídeo Vertical)</option>
                <option value="POST">POST (Feed)</option>
                <option value="STORY">STORY</option>
                <option value="CARROSSEL">CARROSSEL</option>
              </select>

              <button type="button" title={selectedFile ? 'Substituir mídia' : 'Selecionar mídia'} aria-label={selectedFile ? 'Substituir mídia selecionada' : 'Selecionar mídia'} onClick={() => fileInputRef.current?.click()} className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-border bg-surface text-ink-muted transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
                <Plus size={16} />
              </button>

              <button type="button" aria-label="Carregar rascunho local" title="Carregar rascunho local" onClick={handleLoadDraft} className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-border bg-surface text-ink-muted transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
                <FolderOpen size={16} />
              </button>

              <button type="button" aria-expanded={isNotesOpen} onClick={() => setIsNotesOpen((isOpen) => !isOpen)} className={`min-h-11 rounded-control border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${isNotesOpen ? 'border-brand-plum bg-[#f3f0e9] text-brand-plum' : 'border-border bg-surface text-ink-muted hover:bg-canvas hover:text-ink'}`}>
                {isNotesOpen ? 'Ocultar notas' : 'Notas'}
              </button>
            </div>

            <div className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-panel border border-border bg-canvas">
              <textarea 
                ref={captionRef}
                value={caption} 
                onChange={(e) => { setCaption(e.target.value); setDraftSaved(false); }}
                placeholder="Escreva sua legenda aqui..."
                aria-label="Legenda da publicação"
                maxLength={2200}
                className="w-full flex-1 resize-none bg-transparent p-4 text-base font-medium text-ink placeholder:text-ink-muted focus:outline-none"
              />
              
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface p-2">
                <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} className="sr-only" aria-label="Selecionar uma imagem ou vídeo" />
                <div className="relative flex flex-wrap items-center gap-0.5 text-ink-muted">
                  <button type="button" aria-label="Selecionar ou substituir mídia" title="Selecionar ou substituir mídia" onClick={() => fileInputRef.current?.click()} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
                    <Camera size={16} />
                  </button>
                  <button type="button" aria-label="Inserir emoji" aria-expanded={isEmojiPickerOpen} title="Inserir emoji" onClick={() => { setCaptionTool(null); setIsEmojiPickerOpen((isOpen) => !isOpen); }} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"><Smile size={16} /></button>
                  <button type="button" aria-label="Inserir hashtag" title="Inserir hashtag" onClick={() => insertCaptionText('#')} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"><Hash size={16} /></button>
                  <button type="button" aria-label="Inserir menção" title="Inserir menção" onClick={() => insertCaptionText('@')} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"><AtSign size={16} /></button>
                  <button type="button" aria-label="Adicionar localização" aria-expanded={captionTool === 'location'} title="Adicionar localização" onClick={() => { setIsEmojiPickerOpen(false); setCaptionTool(captionTool === 'location' ? null : 'location'); setCaptionToolValue(''); }} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"><MapPin size={16} /></button>
                  <button type="button" aria-label="Inserir link" aria-expanded={captionTool === 'link'} title="Inserir link" onClick={() => { setIsEmojiPickerOpen(false); setCaptionTool(captionTool === 'link' ? null : 'link'); setCaptionToolValue(''); }} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"><Link size={16} /></button>
                  <button type="button" aria-label="Inserir oferta" aria-expanded={captionTool === 'offer'} title="Inserir oferta" onClick={() => { setIsEmojiPickerOpen(false); setCaptionTool(captionTool === 'offer' ? null : 'offer'); setCaptionToolValue(''); }} className="flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"><Percent size={16} /></button>
                  <button type="button" aria-label={draftSaved ? 'Rascunho salvo neste dispositivo' : 'Salvar rascunho neste dispositivo'} aria-pressed={draftSaved} title={draftSaved ? 'Rascunho salvo neste dispositivo' : 'Salvar rascunho neste dispositivo'} onClick={handleSaveDraft} className={`flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors hover:bg-canvas hover:text-brand-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${draftSaved ? 'text-brand-plum' : ''}`}><Bookmark size={16} fill={draftSaved ? 'currentColor' : 'none'} /></button>
                  {isEmojiPickerOpen && (
                    <div role="group" aria-label="Escolha um emoji" className="absolute bottom-full left-0 z-10 mb-2 flex gap-1 rounded-control border border-border bg-surface p-2">
                      {['😊', '✨', '🏡', '🌴', '❤️', '📍'].map((emoji) => (
                        <button key={emoji} type="button" aria-label={`Inserir ${emoji}`} onClick={() => { insertCaptionText(emoji); setIsEmojiPickerOpen(false); }} className="flex h-10 w-10 items-center justify-center rounded-control text-lg hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-plum">{emoji}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
                  <span>{(caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length}/30 #</span>
                  <span>{caption.length}/2200</span>
                </div>
              </div>
            </div>

            {captionTool && (
              <form onSubmit={handleCaptionToolSubmit} className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface p-3">
                <label htmlFor="caption-tool-value" className="sr-only">
                  {captionTool === 'location' ? 'Localização' : captionTool === 'link' ? 'Link' : 'Oferta'}
                </label>
                <input
                  id="caption-tool-value"
                  autoFocus
                  type={captionTool === 'link' ? 'url' : 'text'}
                  value={captionToolValue}
                  onChange={(event) => setCaptionToolValue(event.target.value)}
                  placeholder={captionTool === 'location' ? 'Ex.: Trancoso, Bahia' : captionTool === 'link' ? 'https://...' : 'Ex.: 10% de desconto'}
                  className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-canvas px-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
                />
                <button type="submit" className="min-h-11 rounded-control bg-brand-plum px-3 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">Inserir</button>
              </form>
            )}

            {isNotesOpen && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink">Notas internas <span className="font-normal text-ink-muted">— não serão publicadas</span></span>
                <textarea value={notes} onChange={(event) => { setNotes(event.target.value); setDraftSaved(false); }} rows={2} placeholder="Lembretes para sua equipe..." className="w-full resize-y rounded-control border border-border bg-surface p-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum" />
              </label>
            )}

            {editorFeedback && <p role="status" className="text-xs text-ink-muted">{editorFeedback}</p>}

            <div className="space-y-3 rounded-panel border border-border bg-canvas p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Data</label>
                  <input 
                    type="date" 
                    value={scheduledDate}
                    onChange={(e) => { setScheduledDate(e.target.value); setDraftSaved(false); }}
                    className="min-h-11 w-full rounded-control border border-border bg-surface p-2 text-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum md:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Horário</label>
                  <select 
                    value={scheduledHour}
                    onChange={(e) => { setScheduledHour(Number(e.target.value)); setDraftSaved(false); }}
                    className="min-h-11 w-full rounded-control border border-border bg-surface p-2 text-base font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum md:text-sm"
                  >
                    {Array.from({ length: 14 }, (_, i) => i + 11).map(h => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  O conteúdo será adicionado ao calendário. A publicação automática depende da integração com a rede social.
                </p>
              </div>
            </div>

          </div>

          <div className="flex w-full flex-col items-center justify-between gap-5 bg-canvas/60 p-4 sm:p-6 md:w-1/2">
            
            <div role="group" aria-label="Formato da pré-visualização" className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
              <button 
                type="button"
                aria-label="Pré-visualizar em celular"
                aria-pressed={previewDevice === 'mobile'}
                onClick={() => setPreviewDevice('mobile')} 
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${previewDevice === 'mobile' ? 'bg-brand-plum text-brand-lime' : 'text-ink-muted hover:text-ink'}`}
              >
                <Smartphone size={16} />
              </button>
              <button 
                type="button"
                aria-label="Pré-visualizar em desktop"
                aria-pressed={previewDevice === 'desktop'}
                onClick={() => setPreviewDevice('desktop')} 
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${previewDevice === 'desktop' ? 'bg-brand-plum text-brand-lime' : 'text-ink-muted hover:text-ink'}`}
              >
                <Monitor size={16} />
              </button>
              <button 
                type="button"
                aria-label="Pré-visualizar no grid"
                aria-pressed={previewDevice === 'grid'}
                onClick={() => setPreviewDevice('grid')} 
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum ${previewDevice === 'grid' ? 'bg-brand-plum text-brand-lime' : 'text-ink-muted hover:text-ink'}`}
              >
                <Grid size={16} />
              </button>
            </div>

            <div className={`relative flex w-full flex-col justify-between overflow-hidden bg-black ${previewFrameClass}`}>
              {previewDevice !== 'grid' && (
                <div className={`z-10 flex items-center gap-2 p-3 ${previewDevice === 'mobile' ? 'bg-gradient-to-b from-black/80 to-transparent' : 'bg-surface'}`}>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-plum text-[10px] font-bold text-brand-lime">D</div>
                  <span className={`text-[11px] font-semibold ${previewDevice === 'mobile' ? 'text-white' : 'text-ink'}`}>daimefilmes</span>
                </div>
              )}

              {mediaPreviewUrl ? (
                <div className={`flex min-h-0 flex-1 items-center justify-center bg-black ${previewDevice === 'desktop' ? 'flex-row' : ''}`}>
                  <MediaPreview
                    key={mediaPreviewUrl}
                    src={mediaPreviewUrl}
                    mediaType={selectedFile?.type}
                    alt="Pré-visualização da mídia escolhida"
                    controls={isVideo}
                    muted
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#302d34] p-4 text-center text-xs text-white/60">
                  <Video size={24} className="mb-2 text-brand-lime" />
                  <span>Selecione uma imagem ou vídeo</span>
                </div>
              )}

              {previewDevice !== 'grid' && (
                <div className={`z-10 p-3 ${previewDevice === 'mobile' ? 'bg-gradient-to-t from-black/90 to-transparent' : 'bg-surface'}`}>
                  <p className={`line-clamp-2 text-[11px] font-medium ${previewDevice === 'mobile' ? 'text-gray-200' : 'text-ink'}`}>
                    {caption || 'Sua legenda aparecerá aqui...'}
                  </p>
                </div>
              )}
              {previewDevice === 'grid' && (
                <p className="absolute bottom-0 left-0 right-0 line-clamp-2 bg-black/70 p-2 text-[10px] text-white">
                  {caption || 'Prévia do conteúdo no grid'}
                </p>
              )}
            </div>

            <p className="max-w-xs text-center text-[10px] font-medium text-ink-muted">
              A pré-visualização é uma simulação do layout da rede social.
            </p>
          </div>

        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3.5 sm:px-6">
          <button type="button" onClick={onClose} disabled={loading} className="min-h-11 rounded-control px-4 text-xs font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50">
            Cancelar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-canvas px-3 text-xs font-semibold text-ink">
              <Calendar size={14} className="text-brand-plum" />
              <span>{new Intl.DateTimeFormat('pt-BR').format(new Date(`${scheduledDate}T00:00:00`))} às {scheduledHour}:00</span>
            </div>

            <button 
              type="button"
              onClick={handleSavePost}
              disabled={loading}
              className="flex min-h-11 items-center gap-2 rounded-control bg-brand-plum px-5 text-xs font-semibold text-brand-lime transition-colors hover:bg-[#352a42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-[#ccf600]" />
                  <span>{uploadStatus}</span>
                </>
              ) : (
                <>
                  <span>Agendar</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}