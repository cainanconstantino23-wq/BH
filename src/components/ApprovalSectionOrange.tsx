'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isVideoMedia } from '@/lib/media';
import { uploadMedia } from '@/lib/uploadImage';
import { MediaPreview } from '@/components/MediaPreview';
import { GROUP_TONE, StagePathBars, StageTimeline, STAGE_TONE } from '@/components/approval/VideoStages';
import { ApprovalChat } from '@/components/approval/ApprovalChat';
import { GROUPS, STAGES, groupOf, stageOf, stagePath, type ApprovalGroup, type ChatMessage, type PastResponse } from '@/lib/videoApproval';
import { useTeam } from '@/lib/team';
import { useDismiss } from '@/lib/useDismiss';
import { guessHouseFromFileName, houseLabel } from '@/lib/house';
import { DropOverlay } from '@/components/media/DropOverlay';
import { useFileDrop } from '@/lib/useFileDrop';
import { MediaLightbox } from '@/components/media/MediaLightbox';
import { InstagramImageEditor } from '@/components/media/InstagramImageEditor';
import { findClosestFormat, findExactFormat, formatPlaceLabel, type InstagramFormat } from '@/lib/instagramFormats';
import { Plus, Copy, Calendar, Send, Trash2, Image as ImageIcon, X, CheckCircle2, AlertCircle, Eye, Sparkles, Loader2, Upload, ListChecks, RefreshCw, Crop, Check, Video, ChevronRight } from 'lucide-react';

interface ApprovalVersion {
  version: number;
  media_url: string;
  media_type: string;
  caption: string;
  note: string;
  created_at: string;
  created_by_label: string;
  decision: string;
  feedback: string;
  responded_at: string;
  responded_by_label: string;
  history: PastResponse[];
}

interface ApprovalPost {
  id: string | number;
  house_name: string;
  house_number: string;
  house_label: string;
  versions: ApprovalVersion[];
  messages: ChatMessage[];
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
  // publicação no Instagram (vídeo aprovado: "Publicar" abre a tela de postagem; aí ele entra na Grade do feed)
  platform: string;
  hour: number | null;
  auto_publish: boolean;
  publish_status: '' | 'processing' | 'published' | 'error';
  publish_error: string;
  ig_permalink: string;
}

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Erro inesperado.';
};

const isVideoFile = (file: File) => file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);

export default function ApprovalSectionOrange() {
  const team = useTeam();
  const refreshPostsRef = useRef<() => Promise<void>>(async () => {});
  const [posts, setPosts] = useState<ApprovalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ApprovalPost | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<number>(0);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [houseName, setHouseName] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  // Mesmo bloco de mídia do "Programar Post": miniatura com X, prévia grande e recorte nas medidas do Instagram.
  const [mediaDims, setMediaDims] = useState<{ width: number; height: number } | null>(null);
  const [mediaLightboxOpen, setMediaLightboxOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // data planejada: o vídeo já aparece na Grade do feed nessa data (planejamento do mês)
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedHour, setPlannedHour] = useState(19);
  // fila em 3 grupos (Aguardando aprovação / Ajuste / Aprovado): fechados ao entrar; tocar num grupo abre só aquele
  const [openStages, setOpenStages] = useState<Set<ApprovalGroup>>(new Set());
  // versão mostrada no detalhe (null = a atual)
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const toggleStage = (stage: ApprovalGroup) =>
    setOpenStages((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  const closeCreateModal = useCallback(() => setIsModalOpen(false), []);
  const createDismiss = useDismiss(isModalOpen, closeCreateModal, submitting || mediaLightboxOpen || imageEditorOpen);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [generatingCopy, setGeneratingCopy] = useState(false);
  // Tela de envio no centro: progresso real, depois sucesso ou erro em linguagem simples.
  const [sendState, setSendState] = useState<SendState | null>(null);
  // Link único com todos os não aprovados (/aprovar/[token])
  const [listLink, setListLink] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listCopied, setListCopied] = useState(false);

  // Nova versão (V2, V3...) no mesmo link
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionPreview, setVersionPreview] = useState<string | null>(null);
  const [versionCaption, setVersionCaption] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [versionError, setVersionError] = useState('');
  const closeVersionModal = useCallback(() => setVersionModalOpen(false), []);
  const versionDismiss = useDismiss(versionModalOpen, closeVersionModal, submitting);

  useEffect(() => {
    return () => {
      if (versionPreview) URL.revokeObjectURL(versionPreview);
    };
  }, [versionPreview]);

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

    // Versões de cada post (V1, V2...). Sem a tabela, a fila funciona só com a versão atual.
    // history (respostas anteriores) vem da migração 20261126b; sem ela, lê sem a coluna.
    const versionColumns = 'post_id, version, media_url, media_type, caption, note, created_at, created_by_label, decision, feedback, responded_at, responded_by_label';
    const readVersions = (columns: string) => supabase.from('post_versions').select(columns).order('version', { ascending: true });
    let { data: versionData, error: versionError } = await readVersions(`${versionColumns}, history`);
    if (versionError) ({ data: versionData, error: versionError } = await readVersions(versionColumns));
    if (versionError) console.warn('Não foi possível carregar as versões:', versionError.message);
    const versionsByPost = new Map<string, ApprovalVersion[]>();
    for (const raw of (versionData ?? []) as unknown as Record<string, unknown>[]) {
      const text = (value: unknown) => (typeof value === 'string' ? value : '');
      const key = String(raw.post_id);
      const list = versionsByPost.get(key) ?? [];
      list.push({
        version: typeof raw.version === 'number' ? raw.version : 1,
        media_url: text(raw.media_url),
        media_type: text(raw.media_type),
        caption: text(raw.caption),
        note: text(raw.note),
        created_at: text(raw.created_at),
        created_by_label: text(raw.created_by_label),
        decision: text(raw.decision),
        feedback: text(raw.feedback),
        responded_at: text(raw.responded_at),
        responded_by_label: text(raw.responded_by_label),
        history: (Array.isArray(raw.history) ? raw.history : []).map((h: Record<string, unknown>) => ({
          decision: text(h.decision),
          feedback: text(h.feedback),
          responded_at: text(h.responded_at),
          responded_by_label: text(h.responded_by_label),
          reopened_at: text(h.reopened_at),
          reopened_by: text(h.reopened_by),
        })),
      });
      versionsByPost.set(key, list);
    }

    // Conversa de cada vídeo (migração 20261126c). Sem a tabela, o chat mostra só envios e decisões.
    const { data: messageData, error: messageError } = await supabase
      .from('post_messages')
      .select('id, post_id, author_kind, author_id, author_label, body, created_at')
      .order('created_at', { ascending: true });
    if (messageError) console.warn('Não foi possível carregar as mensagens:', messageError.message);
    const messagesByPost = new Map<string, ChatMessage[]>();
    for (const raw of (messageData ?? []) as Record<string, unknown>[]) {
      const key = String(raw.post_id);
      const list = messagesByPost.get(key) ?? [];
      list.push({
        id: Number(raw.id),
        author_kind: raw.author_kind === 'aprovadora' ? 'aprovadora' : 'equipe',
        author_id: typeof raw.author_id === 'string' ? raw.author_id : '',
        author_label: typeof raw.author_label === 'string' ? raw.author_label : '',
        body: typeof raw.body === 'string' ? raw.body : '',
        created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
      });
      messagesByPost.set(key, list);
    }

    // Aprovação vídeos lista só vídeos; fotos e carrosséis ficam na Aprovação fotos.
    const rows = ((data ?? []) as Record<string, unknown>[]).filter((item) => {
      const text = (value: unknown) => (typeof value === 'string' ? value : '');
      return isVideoMedia(text(item.image_url) || text(item.media_url), text(item.media_type));
    });
    return rows.map((item, index) => {
      const id = typeof item.id === 'string' || typeof item.id === 'number' ? item.id : `post-${index}`;
      const stringValue = (value: unknown) => typeof value === 'string' ? value : '';
      const captionValue = stringValue(item.caption) || stringValue(item.content);
      const houseNameValue = stringValue(item.house_name) || stringValue(item.title) || 'Casa';
      const houseNumberValue = stringValue(item.house_number);

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
        house_number: houseNumberValue,
        house_label: houseLabel(houseNameValue, houseNumberValue) || 'Casa',
        versions: versionsByPost.get(String(id)) ?? [],
        messages: messagesByPost.get(String(id)) ?? [],
        approval_status: stringValue(item.approval_status) || 'pending',
        approval_token: stringValue(item.approval_token) || String(id),
        views_count: typeof item.views_count === 'number' ? item.views_count : 0,
        client_feedback: stringValue(item.client_feedback),
        scheduled_date: stringValue(item.scheduled_date),
        scheduled_time: stringValue(item.scheduled_time) || stringValue(item.time_string),
        created_at: stringValue(item.created_at),
        platform: stringValue(item.platform),
        hour: typeof item.hour === 'number' ? item.hour : null,
        auto_publish: item.auto_publish === true,
        publish_status: (['processing', 'published', 'error'].includes(stringValue(item.publish_status))
          ? stringValue(item.publish_status)
          : '') as ApprovalPost['publish_status'],
        publish_error: stringValue(item.publish_error),
        ig_permalink: stringValue(item.ig_permalink),
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

    // 3. Mensagem nova (da Thereza pelo link) ou apagada: recarrega a conversa
    const chatChannel = supabase
      .channel(`chat_${selectedPost.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_messages', filter: `post_id=eq.${selectedPost.id}` }, () => {
        void refreshPostsRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(dbChannel);
    };
  }, [selectedPost?.id, selectedPost?.approval_token]);

  // muda a data planejada/agendada do vídeo (mesmas colunas que a Grade do feed usa)
  const savePlanned = async (postId: ApprovalPost['id'], date: string, hour: number) => {
    const { error } = await supabase
      .from('posts')
      .update({
        scheduled_date: date,
        hour,
        time_string: `${String(hour).padStart(2, '0')}:00`,
        day_index: (new Date(`${date}T12:00:00`).getDay() + 6) % 7,
      })
      .eq('id', postId);
    if (error) setFeedbackMessage('Não foi possível mudar a data. Tente de novo.');
    await refreshPosts();
  };

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
  useEffect(() => {
    refreshPostsRef.current = refreshPosts;
  });

  const readMediaDims = (selectedFile: File) => {
    setMediaDims(null);
    if (isVideoFile(selectedFile)) return;
    const url = URL.createObjectURL(selectedFile);
    const img = new window.Image();
    img.onload = () => {
      setMediaDims({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const removeFile = () => {
    setMediaPreview((previousPreview) => {
      if (previousPreview) URL.revokeObjectURL(previousPreview);
      return null;
    });
    setFile(null);
    setMediaDims(null);
    setMediaLightboxOpen(false);
    setFeedbackMessage('');
  };

  const applyCrop = ({ file: cropped, format }: { file: File; format: InstagramFormat }) => {
    setFile(cropped);
    setMediaPreview((previousPreview) => {
      if (previousPreview) URL.revokeObjectURL(previousPreview);
      return URL.createObjectURL(cropped);
    });
    setMediaDims({ width: format.width, height: format.height });
    setImageEditorOpen(false);
    setFeedbackMessage(`Imagem ajustada para ${formatPlaceLabel(format)}: ${format.width} × ${format.height} px (${format.ratioLabel}).`);
  };

  const chooseFile = (selectedFile: File) => {
    // Aprovação vídeos: só vídeo (fotos são aprovadas na Aprovação fotos)
    if (!isVideoFile(selectedFile)) {
      setFeedbackMessage('Aqui só entra vídeo (MP4, MOV ou WEBM). Fotos vão para a Aprovação fotos.');
      return;
    }
    setFile(selectedFile);
    readMediaDims(selectedFile);
    setFeedbackMessage('');
    // Nome e número da casa pelo nome do arquivo, só nos campos ainda vazios.
    const guess = guessHouseFromFileName(selectedFile.name);
    if (guess.name) setHouseName((current) => current || guess.name);
    if (guess.number) setHouseNumber((current) => current || guess.number);
    setMediaPreview((previousPreview) => {
      if (previousPreview) URL.revokeObjectURL(previousPreview);
      return URL.createObjectURL(selectedFile);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) chooseFile(e.target.files[0]);
  };

  // Arrastar o vídeo ou a foto do computador direto para a janela.
  const createDrop = useFileDrop(
    chooseFile,
    () => setFeedbackMessage('Aqui só entra vídeo (MP4, MOV ou WEBM). Fotos vão para a Aprovação fotos.'),
    submitting || imageEditorOpen || mediaLightboxOpen,
  );

  const handleSendForApproval = async () => {
    if (!houseName.trim()) {
      setFeedbackMessage('Informe o nome da casa ou do cliente.');
      return;
    }
    if (!file) {
      setFeedbackMessage('Selecione o vídeo para continuar.');
      return;
    }
    if (!plannedDate) {
      setFeedbackMessage('Escolha a data planejada para publicar.');
      return;
    }

    const isVideo = isVideoFile(file);
    const kind = isVideo ? 'video' : 'foto';

    try {
      setSubmitting(true);
      setFeedbackMessage('');
      setSendState({ phase: 'sending', percent: 0, kind });

      // 1 e 2. URL assinada + envio direto do navegador, com progresso real
      const publicUrl = await uploadMedia(file, (percent) => setSendState({ phase: 'sending', percent, kind }));

      // 3. registra a publicação na fila
      setSendState({ phase: 'saving', kind });
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const { error: dbError } = await supabase.from('posts').insert([
        {
          title: houseLabel(houseName, houseNumber),
          house_name: houseName.trim(),
          house_number: houseNumber.trim() || null,
          content: caption,
          caption: caption,
          image_url: publicUrl,
          media_type: isVideo ? 'video' : 'image',
          approval_status: 'pending',
          approval_token: token,
          platform: 'REEL',
          // data planejada (aparece na Grade do feed); só vai sozinho para o Instagram depois de aprovado e agendado
          scheduled_date: plannedDate,
          hour: plannedHour,
          time_string: `${String(plannedHour).padStart(2, '0')}:00`,
          day_index: (new Date(`${plannedDate}T12:00:00`).getDay() + 6) % 7,
          views_count: 0
        },
      ]);
      if (dbError) throw dbError;

      setIsModalOpen(false);
      setHouseName('');
      setHouseNumber('');
      setPlannedDate('');
      setPlannedHour(19);
      setCaption('');
      setFile(null);
      setMediaPreview(null);
      setMediaDims(null);
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
        body: JSON.stringify({ houseName: houseLabel(houseName, houseNumber), notes: caption, currentCaption: caption, format: 'REEL' }),
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

  const loadListLink = async (renew = false) => {
    if (renew && !confirm('Gerar um link novo? O link antigo deixa de abrir.')) return;
    setListLoading(true);
    setFeedbackMessage('');
    try {
      const response = await fetch('/api/approval-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renew }),
      });
      const result = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error ?? `erro ${response.status}`);
      setListLink(`${window.location.origin}/aprovar/${result.token}`);
      setListCopied(false);
    } catch (error) {
      setFeedbackMessage(`Não foi possível gerar o link da lista: ${getErrorMessage(error)}`);
    } finally {
      setListLoading(false);
    }
  };

  const copyListLink = async () => {
    if (!listLink) return;
    try {
      await navigator.clipboard.writeText(listLink);
      setListCopied(true);
      window.setTimeout(() => setListCopied(false), 3000);
    } catch {
      setFeedbackMessage('Não foi possível copiar automaticamente. Selecione e copie o link.');
    }
  };

  const openVersionModal = () => {
    if (!selectedPost) return;
    setVersionFile(null);
    setVersionPreview(null);
    setVersionCaption(selectedPost.caption);
    setVersionNote('');
    setVersionError('');
    setVersionModalOpen(true);
  };

  const chooseVersionFile = (chosen: File) => {
    if (!isVideoFile(chosen)) {
      setVersionError('Aqui só entra vídeo (MP4, MOV ou WEBM). Fotos vão para a Aprovação fotos.');
      return;
    }
    setVersionFile(chosen);
    setVersionError('');
    setVersionPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(chosen);
    });
  };

  const handleVersionFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) chooseVersionFile(chosen);
  };

  const versionDrop = useFileDrop(
    (chosen) => chooseVersionFile(chosen),
    () => setVersionError('Aqui só entra vídeo (MP4, MOV ou WEBM). Fotos vão para a Aprovação fotos.'),
    submitting,
  );


  // Envia a V2, V3... no mesmo link: o post volta para "pendente" e o aprovador vê todas as versões.
  const handleSendNewVersion = async () => {
    if (!selectedPost) return;
    const captionChanged = versionCaption.trim() !== selectedPost.caption.trim();
    if (!versionFile && !captionChanged) {
      setVersionError('Escolha o vídeo corrigido, ou altere a legenda.');
      return;
    }
    const kind = versionFile ? (isVideoFile(versionFile) ? 'video' : 'foto') : selectedPost.media_type === 'video' ? 'video' : 'foto';

    try {
      setSubmitting(true);
      setVersionError('');
      setSendState({ phase: versionFile ? 'sending' : 'saving', percent: 0, kind } as SendState);
      const publicUrl = versionFile
        ? await uploadMedia(versionFile, (percent) => setSendState({ phase: 'sending', percent, kind }))
        : null;

      setSendState({ phase: 'saving', kind });
      const { error } = await supabase.rpc('submit_post_version', {
        p_post_id: Number(selectedPost.id),
        p_media_url: publicUrl,
        p_media_type: versionFile ? (isVideoFile(versionFile) ? 'video' : 'image') : null,
        p_caption: versionCaption,
        p_note: versionNote.trim() || null,
      });
      if (error) throw error;

      setVersionModalOpen(false);
      setVersionFile(null);
      setVersionPreview(null);
      setSendState({ phase: 'done', kind, message: 'Nova versão no mesmo link. Avise o aprovador.' });
      await refreshPosts();
    } catch (error) {
      console.error('Erro ao enviar nova versão:', getErrorMessage(error), error);
      setSendState({ phase: 'error', kind });
    } finally {
      setSubmitting(false);
    }
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

  const fileIsVideo = file ? isVideoFile(file) : false;
  const photoDims = file && !fileIsVideo ? mediaDims : null;
  const photoExact = photoDims ? findExactFormat(null, photoDims.width, photoDims.height) : null;
  const photoSuggested = photoDims ? findClosestFormat(null, photoDims.width, photoDims.height) : null;

  return (
    <div className="section-enter space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[34px]">Aprovação vídeos</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-muted">Revise os vídeos, acompanhe as respostas e compartilhe os links de aprovação.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
        {team.can('enviar_link_aprovacao') && (
          <button
            type="button"
            onClick={() => (listLink ? setListLink(null) : void loadListLink())}
            disabled={listLoading}
            aria-expanded={Boolean(listLink)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-white/80 px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {listLoading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ListChecks size={15} aria-hidden="true" />}
            Link com todos os pendentes
          </button>
        )}
        {team.can('criar_publicacoes') && <button
          type="button"
          onClick={() => { setFeedbackMessage(''); setIsModalOpen(true); }}
          className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus size={16} /> Novo post para aprovação
        </button>}
        </div>
      </div>

      {listLink && (
        <div className="space-y-3 cartao rounded-panel p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold text-ink">Link com todos os pendentes</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              O aprovador vê numa página só tudo o que ainda não foi aprovado e responde um por um. O link é sempre o mesmo e se atualiza sozinho.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={listLink}
              aria-label="Link com todos os pendentes"
              onFocus={(event) => event.target.select()}
              className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-canvas px-3 font-mono text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <button type="button" onClick={() => void copyListLink()} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <Copy size={13} aria-hidden="true" /> {listCopied ? 'Copiado!' : 'Copiar link'}
            </button>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Olá! Aqui estão todos os conteúdos da Bahia Homes esperando aprovação: ${listLink}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border bg-white/80 px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Enviar por WhatsApp
            </a>
            <a
              href={listLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border bg-white/80 px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Abrir
            </a>
          </div>
          <button
            type="button"
            onClick={() => void loadListLink(true)}
            disabled={listLoading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-60"
          >
            <RefreshCw size={13} aria-hidden="true" /> Gerar link novo (o antigo para de abrir)
          </button>
        </div>
      )}

      {feedbackMessage && !isModalOpen && <p role="status" className="rounded-control border border-border bg-surface px-4 py-3 text-xs text-ink">{feedbackMessage}</p>}

      <StageTimeline
        counts={Object.fromEntries(GROUPS.map((group) => [group.id, posts.filter((p) => groupOf(stageOf(p.approval_status, p.versions.length)) === group.id).length])) as Record<ApprovalGroup, number>}
        active={openStages.size === 1 ? [...openStages][0] : null}
        onPick={(stage) => setOpenStages(new Set([stage]))}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.7fr)]">
        
        <div className="overflow-hidden cartao rounded-panel">
          <div className="flex items-center justify-between border-b border-border/70 p-4 text-[13px] font-semibold text-ink-muted">
            <span>Fila de aprovação</span>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-semibold text-brand-plum">{posts.length}</span>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-ink-muted">Carregando…</div>
            ) : posts.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-muted">Nenhum vídeo em aprovação.</div>
            ) : (
              GROUPS.map((stage) => {
                const items = posts.filter((p) => groupOf(stageOf(p.approval_status, p.versions.length)) === stage.id);
                const open = openStages.has(stage.id);
                const tone = GROUP_TONE[stage.id];
                return (
                  <section key={stage.id} aria-label={stage.label} className="border-b border-border/70 last:border-b-0">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleStage(stage.id)}
                        className="sticky top-0 z-10 flex min-h-11 w-full items-center gap-2 bg-surface/90 px-4 text-left text-[13px] font-semibold text-ink backdrop-blur-xl transition-colors hover:bg-surface-muted/80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <ChevronRight size={13} aria-hidden="true" className={`text-ink-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
                        {stage.label}
                        <span className="ml-auto tabular-nums text-ink-muted">{items.length}</span>
                      </button>
                    </h3>
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden" inert={!open}>
                        {items.length === 0 ? (
                          <p className="px-4 pb-3 pt-1 text-xs text-ink-muted">Nenhum vídeo neste grupo.</p>
                        ) : (
                          <div className="px-1.5 pb-1.5">
                            {items.map((p) => {
                              const selected = selectedPost?.id === p.id;
                              const path = stagePath(p.approval_status, p.versions);
                              const itemStage = stageOf(p.approval_status, p.versions.length);
                              const lastFeedback = p.versions.at(-1)?.feedback || p.client_feedback || '';
                              const sentAt = p.versions.at(-1)?.created_at || p.created_at || '';
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => { setSelectedPost(p); setViewVersion(null); }}
                                  className={`grid w-full grid-cols-[2.75rem_1fr_auto] items-center gap-2.5 rounded-control p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                                    selected ? 'bg-accent text-white' : 'hover:bg-surface-muted/80'
                                  }`}
                                >
                                  <span className="h-11 w-11 overflow-hidden rounded-[0.6rem] bg-canvas">
                                    <MediaPreview key={p.media_url} src={p.media_url} mediaType={p.media_type} alt="" className="h-full w-full object-cover" cover muted />
                                  </span>
                                  <span className="min-w-0">
                                    <span title={p.house_label} className="block truncate text-[13px] font-semibold">{p.house_label}</span>
                                    <span className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] ${selected ? 'text-white/80' : 'text-ink-muted'}`}>
                                      {p.versions.length > 1 && (
                                        <span className={`shrink-0 rounded px-1 text-[10px] font-bold ${selected ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink'}`}>V{p.versions.length}</span>
                                      )}
                                      <span className="truncate">
                                        {itemStage === 'alteracao' && lastFeedback
                                          ? `“${lastFeedback}”`
                                          : itemStage === 'reprovado'
                                            ? 'Não será publicado'
                                            : p.scheduled_date
                                              ? `Planejado ${p.scheduled_date.split('-').reverse().slice(0, 2).join('/')}`
                                              : 'Sem data planejada'}
                                      </span>
                                    </span>
                                    <StagePathBars path={path} label={`Caminho: ${path.map((id) => STAGES.find((s) => s.id === id)?.label).join(', ')}`} />
                                  </span>
                                  <span className={`self-start pt-0.5 text-[11px] tabular-nums ${selected ? 'text-white/80' : 'text-ink-muted'}`}>
                                    {sentAt ? new Date(sentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col justify-between cartao rounded-panel p-4 sm:p-6">
          {selectedPost ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const stage = stageOf(selectedPost.approval_status, selectedPost.versions.length);
                      const tone = STAGE_TONE[stage];
                      return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone.soft} ${tone.text}`}>
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                          {STAGES.find((s) => s.id === stage)?.label}
                          {selectedPost.versions.length > 1 ? ` · V${selectedPost.versions.length}` : ''}
                        </span>
                      );
                    })()}

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

                  <h3 className="mt-2 break-words text-base font-semibold leading-snug text-ink">{selectedPost.house_label}</h3>
                  {/* data planejada (ou agendada): muda aqui, na tela de Publicar ou arrastando na Grade do feed */}
                  {selectedPost.publish_status !== 'published' && selectedPost.publish_status !== 'processing' && team.can('reagendar_publicacoes') ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <Calendar aria-hidden="true" size={13} /> {selectedPost.auto_publish ? 'Agendado para' : 'Planejado para'}
                      </span>
                      <input
                        type="date"
                        value={selectedPost.scheduled_date ?? ''}
                        onChange={(event) => event.target.value && void savePlanned(selectedPost.id, event.target.value, selectedPost.hour ?? 19)}
                        aria-label="Data planejada"
                        className="min-h-9 rounded-control border border-border bg-surface px-2.5 text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      />
                      <select
                        value={selectedPost.hour ?? 19}
                        onChange={(event) => selectedPost.scheduled_date && void savePlanned(selectedPost.id, selectedPost.scheduled_date, Number(event.target.value))}
                        disabled={!selectedPost.scheduled_date}
                        aria-label="Horário planejado"
                        className="min-h-9 rounded-control border border-border bg-surface px-2.5 text-sm tabular-nums text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                        ))}
                      </select>
                      {!selectedPost.scheduled_date && <span className="text-status-warning">Defina a data para aparecer na Grade do feed.</span>}
                    </div>
                  ) : selectedPost.scheduled_date ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                      <Calendar aria-hidden="true" size={13} />
                      {selectedPost.scheduled_date.split('-').reverse().join('/')}
                      {selectedPost.hour !== null ? ` às ${String(selectedPost.hour).padStart(2, '0')}:00` : ''}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {team.can('editar_publicacoes') && (
                    <button
                      type="button"
                      onClick={openVersionModal}
                      className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-white/80 px-3 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Upload size={14} aria-hidden="true" /> Enviar nova versão
                    </button>
                  )}
                  {team.can('apagar_publicacoes') && <button
                    type="button"
                    aria-label={`Excluir publicação de ${selectedPost.house_label}`}
                    onClick={() => deletePost(selectedPost.id)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-status-danger-soft hover:text-status-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    title="Excluir publicação"
                  >
                    <Trash2 size={15} />
                  </button>}
                </div>
              </div>

              {team.can('enviar_link_aprovacao') && <div className="space-y-3 rounded-panel border border-border bg-canvas p-4">
                <label htmlFor="approval-link" className="block text-[13px] font-semibold text-ink-muted">
                  Link exclusivo de aprovação para o cliente
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="approval-link"
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/approval/${selectedPost.approval_token.replace(/[()]/g, '')}`}
                    className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-xs font-mono text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <button
                    type="button"
                    onClick={() => copyApprovalLink(selectedPost.approval_token, selectedPost.id)}
                    className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Copy size={13} />
                    {copiedId === String(selectedPost.id) ? 'Copiado!' : 'Copiar link'}
                  </button>
                  
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Olá! ${selectedPost.versions.length > 1 ? `Enviei a versão ${selectedPost.versions.length} com os ajustes` : 'Segue o link exclusivo para aprovação'} do vídeo da ${selectedPost.house_label}: ${window.location.origin}/approval/${selectedPost.approval_token.replace(/[()]/g, '')}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Enviar link de aprovação por WhatsApp"
                    className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border bg-white/80 px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
              </div>}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
                <div>
                  {(() => {
                    const shown = viewVersion !== null ? selectedPost.versions.find((version) => version.version === viewVersion) : undefined;
                    const src = shown?.media_url || selectedPost.media_url;
                    const type = shown ? (isVideoMedia(shown.media_url, shown.media_type) ? 'video' : 'image') : selectedPost.media_type;
                    return (
                      <div className="flex max-h-[360px] min-h-[240px] items-center justify-center overflow-hidden rounded-panel bg-brand-plum">
                        <MediaPreview key={src} src={src} mediaType={type} alt={`Mídia para ${selectedPost.house_label}`} controls={type === 'video'} className="h-full max-h-[360px] w-full object-contain" />
                      </div>
                    );
                  })()}
                  {selectedPost.versions.length > 1 && (
                    <div role="tablist" aria-label="Versões" className="mt-2 flex gap-1 rounded-control bg-surface-muted p-0.5">
                      {selectedPost.versions.map((version) => {
                        const current = version.version === selectedPost.versions.at(-1)?.version;
                        const on = viewVersion === null ? current : viewVersion === version.version;
                        return (
                          <button
                            key={version.version}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setViewVersion(current ? null : version.version)}
                            className={`min-h-8 flex-1 rounded-[0.6rem] text-xs font-semibold transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                          >
                            V{version.version}{current ? ' · atual' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="mb-1.5 text-[13px] font-semibold text-ink-muted">Legenda / copy</h4>
                    <div className="max-h-36 overflow-y-auto rounded-control border border-border bg-canvas p-3 text-xs font-medium text-ink">
                      {selectedPost.caption || 'Sem legenda inserida.'}
                    </div>

                    {selectedPost.versions.length > 0 ? (
                      <div className="mt-4">
                        <ApprovalChat
                          key={`${selectedPost.id}-${selectedPost.approval_status}`}
                          postId={selectedPost.id}
                          status={selectedPost.approval_status}
                          versions={selectedPost.versions}
                          messages={selectedPost.messages}
                          currentVersion={selectedPost.versions.at(-1)?.version ?? 1}
                          userId={team.userId}
                          canDecide={team.can('aprovar_publicacoes')}
                          canWrite={team.can('aprovar_publicacoes') || team.can('enviar_link_aprovacao') || team.can('editar_publicacoes')}
                          onChanged={async (notice) => {
                            await refreshPosts();
                            setFeedbackMessage(notice);
                          }}
                        />
                      </div>
                    ) : selectedPost.client_feedback ? (
                      <div className="mt-4">
                        <h4 className="mb-1.5 text-[13px] font-semibold text-status-warning">Feedback do cliente</h4>
                        <div className="rounded-control border border-status-warning-border bg-status-warning-soft p-3 text-xs font-medium text-status-warning">
                          {selectedPost.client_feedback}
                        </div>
                      </div>
                    ) : null}
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
        <div {...createDismiss} {...createDrop.dropProps} className="fixed inset-0 z-50 flex items-center justify-center bg-brand-plum/45 p-2 backdrop-blur-xs sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="approval-create-title" className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden cartao rounded-panel md:flex-row">
            {createDrop.dragging && <DropOverlay title="Solte o vídeo aqui" hint="MP4, MOV ou WEBM" />}
            
            <div className="flex-1 space-y-4 overflow-y-auto border-b border-border p-4 sm:p-6 md:border-b-0 md:border-r">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 id="approval-create-title" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Novo post para aprovação</h2>
                    <p className="mt-1 text-xs text-ink-muted">Prepare a mídia e o link que será enviado ao cliente.</p>
                  </div>
                </div>
                <button type="button" aria-label="Fechar janela de aprovação" onClick={() => setIsModalOpen(false)} disabled={submitting} className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                <div>
                  <label htmlFor="approval-house-name" className="mb-1.5 block text-xs font-semibold text-ink">Nome da casa / cliente</label>
                  <input
                    id="approval-house-name"
                    type="text"
                    value={houseName}
                    onChange={(e) => { setHouseName(e.target.value); setFeedbackMessage(''); }}
                    placeholder="Ex: Vila dos Coqueiros"
                    className="min-h-11 w-full rounded-control border border-border bg-canvas px-3 text-sm font-medium text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                </div>
                <div>
                  <label htmlFor="approval-house-number" className="mb-1.5 block text-xs font-semibold text-ink">Número</label>
                  <input
                    id="approval-house-number"
                    type="text"
                    inputMode="numeric"
                    value={houseNumber}
                    onChange={(e) => { setHouseNumber(e.target.value); setFeedbackMessage(''); }}
                    placeholder="Ex: 110"
                    className="min-h-11 w-full rounded-control border border-border bg-canvas px-3 text-sm font-medium tabular-nums text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                </div>
              </div>

              <fieldset className="space-y-1.5">
                <legend className="flex items-center gap-1.5 text-xs font-semibold text-ink"><Calendar size={14} className="text-brand-plum" aria-hidden="true" /> Quando planejamos publicar</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(event) => { setPlannedDate(event.target.value); setFeedbackMessage(''); }}
                    aria-label="Data planejada"
                    className="min-h-11 w-full rounded-control border border-border bg-canvas px-3 text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <select
                    value={plannedHour}
                    onChange={(event) => setPlannedHour(Number(event.target.value))}
                    aria-label="Horário planejado"
                    className="min-h-11 w-full rounded-control border border-border bg-canvas px-3 text-sm tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-ink-muted">O vídeo já aparece na Grade do feed nessa data. Só é publicado depois de aprovado e agendado.</p>
              </fieldset>

              <div className="space-y-3 cartao rounded-panel p-4">
                <textarea
                  value={caption}
                  onChange={(e) => { setCaption(e.target.value); setFeedbackMessage(''); }}
                  placeholder="Escreva sua legenda aqui..."
                  rows={6}
                  maxLength={2200}
                  aria-label="Legenda para o cliente"
                  className="min-h-28 w-full resize-y text-sm font-medium text-ink placeholder:text-ink-muted focus-visible:outline-none"
                />

                {/* Miniatura: clicar abre em tamanho grande; o X remove para escolher outra */}
                {file && mediaPreview && (
                  <div className="flex flex-wrap items-start gap-4 pt-1">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMediaLightboxOpen(true)}
                        aria-label="Ver mídia em tamanho grande"
                        className="group relative block h-20 w-20 overflow-hidden rounded-control border border-border bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {fileIsVideo ? (
                          <video src={mediaPreview} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) antes do envio
                          <img src={mediaPreview} alt="" className="h-full w-full object-cover" />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          Ver
                        </span>
                        {fileIsVideo && (
                          <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-black/60 p-0.5 text-white"><Video size={11} aria-hidden="true" /></span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={removeFile}
                        disabled={submitting}
                        aria-label="Remover mídia"
                        title="Remover"
                        className="absolute -right-2.5 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-900 text-white shadow-md transition-colors duration-150 hover:bg-status-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50"
                      >
                        <X size={13} strokeWidth={2.5} aria-hidden="true" />
                      </button>
                    </div>

                    {!fileIsVideo && (
                      <div className="min-w-0 flex-1 space-y-2">
                        {photoDims && photoExact ? (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-status-success">
                            <Check size={14} aria-hidden="true" />
                            {photoExact.width} × {photoExact.height} px, pronto para {formatPlaceLabel(photoExact)}
                          </p>
                        ) : photoDims && photoSuggested ? (
                          <p className="text-xs leading-relaxed text-status-warning">
                            Esta imagem tem {photoDims.width} × {photoDims.height} px. Para o feed, o Instagram usa {photoSuggested.width} × {photoSuggested.height} px ({photoSuggested.ratioLabel}).
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setImageEditorOpen(true)}
                          disabled={submitting}
                          className={`flex items-center gap-2 rounded-control px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                            photoDims && !photoExact
                              ? 'bg-accent text-white hover:bg-accent-hover'
                              : 'border border-border bg-canvas text-ink hover:bg-surface'
                          }`}
                        >
                          <Crop size={14} aria-hidden="true" />
                          {photoDims && !photoExact && photoSuggested
                            ? `Ajustar para ${photoSuggested.width} × ${photoSuggested.height}`
                            : 'Ajustar recorte'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-ink-muted">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-xs font-semibold transition-colors hover:bg-canvas hover:text-brand-plum focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                    <ImageIcon size={16} />
                    <span>{file ? 'Substituir vídeo' : 'Selecionar vídeo'}</span>
                    <input type="file" accept="video/*" onChange={handleFileChange} className="sr-only" aria-label="Selecionar vídeo" />
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]">{caption.length}/2200 caracteres</span>
                    <button
                      type="button"
                      onClick={() => void generateCopy()}
                      disabled={generatingCopy || submitting}
                      title="Gerar legenda de Reels com IA a partir da casa e do que você escreveu"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
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
                      <p className="text-[11px] font-medium text-white/70">Arraste o vídeo para cá,<br />ou use &ldquo;Selecionar vídeo&rdquo;.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="min-h-11 rounded-control px-4 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendForApproval}
                  disabled={submitting}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <Send size={14} />
                  {submitting ? 'Enviando...' : 'Enviar para aprovação'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {mediaLightboxOpen && file && mediaPreview && (
        <MediaLightbox
          items={[{ id: 'aprovacao', file, url: mediaPreview, isVideo: fileIsVideo }]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setMediaLightboxOpen(false)}
          onRemove={removeFile}
          onCrop={() => { setMediaLightboxOpen(false); setImageEditorOpen(true); }}
        />
      )}

      {imageEditorOpen && file && mediaPreview && !fileIsVideo && (
        <InstagramImageEditor
          src={mediaPreview}
          fileName={file.name}
          contentType="POST"
          initialFormatId={photoExact?.id ?? photoSuggested?.id}
          onCancel={() => setImageEditorOpen(false)}
          onApply={applyCrop}
        />
      )}

      {versionModalOpen && selectedPost && (
        <div {...versionDismiss} {...versionDrop.dropProps} className="fixed inset-0 z-50 flex items-center justify-center bg-brand-plum/45 p-2 backdrop-blur-xs sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="new-version-title" className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden cartao rounded-panel md:flex-row">
            {versionDrop.dragging && <DropOverlay title="Solte o vídeo aqui" hint="MP4, MOV ou WEBM" />}
            <div className="flex-1 space-y-4 overflow-y-auto border-b border-border p-4 sm:p-6 md:border-b-0 md:border-r">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 id="new-version-title" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
                    Enviar versão {selectedPost.versions.length + 1}
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {selectedPost.house_label}. Vai para o mesmo link, e o aprovador vê esta versão e as anteriores.
                  </p>
                </div>
                <button type="button" aria-label="Fechar" onClick={closeVersionModal} disabled={submitting} className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>

              {selectedPost.client_feedback && (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-semibold text-status-warning">O que foi pedido</h3>
                  <p className="whitespace-pre-line rounded-control border border-status-warning-border bg-status-warning-soft p-3 text-xs font-medium text-status-warning">
                    {selectedPost.client_feedback}
                  </p>
                </div>
              )}

              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-canvas px-4 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                <ImageIcon size={16} aria-hidden="true" />
                {versionFile ? 'Trocar arquivo' : 'Escolher ou arrastar o vídeo corrigido'}
                <input type="file" accept="video/*" onChange={handleVersionFile} className="sr-only" />
              </label>
              {versionFile && <p className="truncate text-xs text-ink-muted">{versionFile.name}</p>}

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-ink">O que mudou (o aprovador vê)</span>
                <textarea
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Ex: troquei a cena de abertura pela vista da piscina."
                  className="w-full resize-y rounded-control border border-border bg-canvas p-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-ink">Legenda</span>
                <textarea
                  value={versionCaption}
                  onChange={(e) => { setVersionCaption(e.target.value); setVersionError(''); }}
                  rows={5}
                  maxLength={2200}
                  className="w-full resize-y rounded-control border border-border bg-canvas p-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              </label>

              {versionError && <p role="alert" className="rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink">{versionError}</p>}
            </div>

            <div className="flex w-full flex-col justify-between gap-4 bg-canvas/60 p-4 sm:p-6 md:w-80">
              <div className="flex flex-1 items-center justify-center">
                <div className="relative flex aspect-[9/16] max-h-[340px] w-full max-w-[200px] items-center justify-center overflow-hidden rounded-panel border border-border bg-brand-plum">
                  <MediaPreview
                    key={versionPreview ?? selectedPost.media_url}
                    src={versionPreview ?? selectedPost.media_url}
                    mediaType={versionFile ? versionFile.type : selectedPost.media_type}
                    alt="Prévia da nova versão"
                    controls
                    muted
                    className="h-full w-full object-contain"
                  />
                  {!versionPreview && (
                    <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Versão atual
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                <button type="button" onClick={closeVersionModal} disabled={submitting} className="min-h-11 rounded-control px-4 text-xs font-semibold text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-50">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendNewVersion()}
                  disabled={submitting}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <Send size={14} aria-hidden="true" />
                  {submitting ? 'Enviando…' : `Enviar versão ${selectedPost.versions.length + 1}`}
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
          onRetry={() => { setSendState(null); void (versionModalOpen ? handleSendNewVersion() : handleSendForApproval()); }}
        />
      )}

    </div>
  );
}

type SendState =
  | { phase: 'sending'; percent: number; kind: 'video' | 'foto' }
  | { phase: 'saving'; kind: 'video' | 'foto' }
  | { phase: 'done'; kind: 'video' | 'foto'; message?: string }
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
        className="w-[min(22rem,100%)] cartao rounded-panel p-6 text-center shadow-[0_24px_60px_-24px_rgb(35_27_45/0.55)]"
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
            <p className="mt-1 text-sm text-ink-muted">{state.message ?? 'Já está na fila de aprovação.'}</p>
            <button type="button" onClick={onClose} autoFocus className="mt-5 min-h-11 w-full rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
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
              <button type="button" onClick={onRetry} autoFocus className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
