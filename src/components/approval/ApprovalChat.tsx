'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, Send, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { STAGE_TONE } from '@/components/approval/VideoStages';
import { chatItems, type ApprovalStage, type ChatMessage, type TimelineVersion } from '@/lib/videoApproval';

// Conversa de um vídeo na Aprovação vídeos: envios, decisões e mensagens num só lugar.
// A equipe escreve (a Thereza lê na hora no link) e, no mesmo envio, pode mudar o status.

type Status = 'pending' | 'approved' | 'changes_requested' | 'rejected';

const STATUS_OPTIONS: { value: Status; label: string; stage: ApprovalStage }[] = [
  { value: 'pending', label: 'Aguardando aprovação', stage: 'aguardando' },
  { value: 'approved', label: 'Aprovado', stage: 'aprovado' },
  { value: 'changes_requested', label: 'Ajustes pedidos', stage: 'alteracao' },
  { value: 'rejected', label: 'Reprovado', stage: 'reprovado' },
];

const DECISION_TEXT: Record<string, string> = {
  aprovado: 'aprovou',
  alteracao: 'pediu alterações',
  reprovado: 'reprovou',
};

const STAGE_LABEL: Record<string, string> = {
  aprovado: 'Aprovado',
  alteracao: 'Ajustes pedidos',
  reprovado: 'Reprovado',
};

function when(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' }).replace(',', ' às');
}

interface ApprovalChatProps {
  postId: string | number;
  status: string;
  versions: TimelineVersion[];
  messages: ChatMessage[];
  currentVersion: number;
  userId: string;
  canWrite: boolean;
  canDecide: boolean;
  onChanged: (notice: string) => Promise<void> | void;
}

export function ApprovalChat({ postId, status, versions, messages, currentVersion, userId, canWrite, canDecide, onChanged }: ApprovalChatProps) {
  const current = (STATUS_OPTIONS.some((o) => o.value === status) ? status : 'pending') as Status;
  const [text, setText] = useState('');
  const [nextStatus, setNextStatus] = useState<Status>(current);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const items = chatItems(versions, messages);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items.length, postId]);

  const changing = canDecide && nextStatus !== current;
  const body = text.trim();
  const canSend = !sending && (body.length > 0 || changing);
  const sendLabel = body && changing ? 'Enviar e mudar status' : changing ? 'Mudar status' : 'Enviar';

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      if (changing) {
        const { error: statusError } = await supabase.from('posts').update({ approval_status: nextStatus, client_feedback: null }).eq('id', postId);
        if (statusError) throw statusError;
      }
      if (body) {
        const { error: messageError } = await supabase
          .from('post_messages')
          .insert({ post_id: postId, version: currentVersion, author_kind: 'equipe', author_id: userId, body });
        if (messageError) throw messageError;
      }
      setText('');
      const label = STATUS_OPTIONS.find((o) => o.value === nextStatus)?.label;
      await onChanged(changing ? `Status mudado para ${label}.${body ? ' Mensagem enviada.' : ''}` : 'Mensagem enviada. A Thereza já vê no link.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      setError(/post_messages/.test(message) ? 'O chat ainda não está ativo: falta rodar a migração 20261126c_chat_aprovacao.sql.' : `Não foi possível enviar: ${message}`);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: number) => {
    setConfirmDelete(null);
    const { error: deleteError } = await supabase.from('post_messages').delete().eq('id', id);
    if (deleteError) {
      setError(`Não foi possível apagar: ${deleteError.message}`);
      return;
    }
    await onChanged('Mensagem apagada.');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) void send(event);
  };

  return (
    <section aria-label="Conversa sobre este vídeo">
      <h4 className="mb-2 text-[13px] font-semibold text-ink-muted">Conversa e status</h4>
      <div className="cartao overflow-hidden rounded-panel">
        <ol ref={listRef} className="max-h-[28rem] space-y-3 overflow-y-auto px-3 py-3">
          {items.map((item, index) => {
            if (item.kind === 'mensagem') {
              const m = item.message;
              const team = m.author_kind === 'equipe';
              const mine = team && m.author_id === userId;
              return (
                <li key={`m-${m.id}`} className={`group flex ${team ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%]">
                    <p className={`mb-0.5 text-[11px] text-ink-muted ${team ? 'text-right' : ''}`}>
                      {team ? m.author_label || 'Equipe' : 'Thereza'} · {when(m.created_at)}
                    </p>
                    <div className="flex items-start gap-1">
                      {mine && (
                        confirmDelete === m.id ? (
                          <span className="flex shrink-0 items-center gap-1 self-center text-[11px]">
                            <button type="button" onClick={() => void remove(m.id)} className="rounded-full bg-status-danger px-2 py-1 font-semibold text-white">Apagar</button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-full px-2 py-1 text-ink-muted hover:bg-surface-muted">Não</button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(m.id)}
                            aria-label="Apagar minha mensagem"
                            title="Apagar minha mensagem"
                            className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-ink-muted opacity-60 transition-opacity hover:bg-status-danger-soft hover:text-status-danger hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        )
                      )}
                      <p className={`whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-snug ${team ? 'rounded-tr-md bg-accent text-white' : 'rounded-tl-md border border-border bg-surface text-ink'}`}>
                        {m.body}
                      </p>
                    </div>
                  </div>
                </li>
              );
            }
            if (item.kind === 'decisao' && item.fromLink) {
              const tone = STAGE_TONE[item.stage];
              const Icon = tone.icon;
              return (
                <li key={`d-${index}`} className="flex justify-start">
                  <div className="max-w-[85%]">
                    <p className="mb-0.5 text-[11px] text-ink-muted">Thereza · {when(item.at)}</p>
                    <div className={`rounded-2xl rounded-tl-md px-3 py-2 text-[13px] text-ink ${tone.soft}`}>
                      <p className={`flex items-center gap-1.5 font-semibold ${tone.text}`}>
                        <Icon size={13} strokeWidth={2.6} aria-hidden="true" /> Thereza {DECISION_TEXT[item.stage]}
                      </p>
                      {item.text && <p className="mt-1 whitespace-pre-line leading-snug">{item.text}</p>}
                    </div>
                  </div>
                </li>
              );
            }
            if (item.kind === 'esperando') {
              return (
                <li key="esperando" className="flex items-center justify-center gap-2 text-[11.5px] text-ink-muted">
                  <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border-[1.5px] border-dashed border-ink-muted/60" />
                  Aguardando a resposta da Thereza
                </li>
              );
            }
            // linhas do sistema: envio de versão, status mudado pela equipe, volta para aguardando
            const tone = STAGE_TONE[item.stage];
            const Icon = item.kind === 'decisao' ? tone.icon : Upload;
            const label =
              item.kind === 'enviado'
                ? `V${item.version} enviada para aprovação`
                : item.kind === 'reaberto'
                  ? `${item.by || 'Equipe'} voltou para Aguardando aprovação`
                  : `${item.by || 'Equipe'} mudou o status para ${STAGE_LABEL[item.stage] ?? item.stage}`;
            return (
              <li key={`s-${index}`} className="text-center">
                <p className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full bg-surface-muted/70 px-3 py-1 text-[11.5px] text-ink-muted">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-white ${tone.dot}`}>
                    <Icon size={9} strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span className="font-semibold text-ink">{label}</span>
                  <span>
                    · {when(item.at)}
                    {item.kind === 'enviado' && item.by ? ` · ${item.by}` : ''}
                  </span>
                </p>
                {item.kind !== 'reaberto' && item.text && <p className="mx-auto mt-1 max-w-[85%] whitespace-pre-line text-[12px] text-ink-muted">“{item.text}”</p>}
              </li>
            );
          })}
        </ol>

        {canWrite && (
          <form onSubmit={(event) => void send(event)} className="space-y-2 border-t border-border bg-canvas/60 p-3">
            {canDecide && (
              <div role="radiogroup" aria-label="Status do vídeo" className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((option) => {
                  const tone = STAGE_TONE[option.stage];
                  const on = nextStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setNextStatus(option.value)}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors ${
                        on ? `border-transparent ${tone.soft} ${tone.text} ring-1 ring-current` : 'border-border bg-surface text-ink-muted hover:text-ink'
                      }`}
                    >
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {option.label}
                      {option.value === current && <span className="font-normal opacity-70">· atual</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={2000}
                aria-label="Mensagem para a Thereza"
                placeholder="Escreva para a Thereza (ela vê no link de aprovação)"
                className="min-h-11 flex-1 resize-y rounded-control border border-border bg-surface p-2.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                {sending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
                {sendLabel}
              </button>
            </div>
            <p className="text-[11px] text-ink-muted">
              Enter envia · Shift + Enter quebra a linha{canDecide ? ' · escolha outro status acima para mudar junto com a mensagem' : ''}
            </p>
            {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
