// Etapas da Aprovação vídeos: em que ponto cada vídeo está e o caminho que fez até ali.
// Sem imports com "@/": também roda no `node --test`.

export type ApprovalStage = 'aguardando' | 'alteracao' | 'reenviado' | 'aprovado' | 'reprovado';

/** Ordem da linha do tempo; as duas últimas são resultado. */
export const STAGES: { id: ApprovalStage; label: string; hint: string }[] = [
  { id: 'aguardando', label: 'Aguardando', hint: '1ª versão enviada' },
  { id: 'alteracao', label: 'Voltou para alteração', hint: 'Thereza pediu ajustes' },
  { id: 'reenviado', label: 'Reenviado', hint: 'V2, V3… com alterações' },
  { id: 'aprovado', label: 'Aprovado', hint: 'Thereza aprovou' },
  { id: 'reprovado', label: 'Reprovado', hint: 'Não será publicado' },
];

const DECISION_STAGE: Record<string, ApprovalStage> = {
  approved: 'aprovado',
  changes_requested: 'alteracao',
  rejected: 'reprovado',
};

/** Etapa atual: pendente com mais de uma versão = reenviado. */
export function stageOf(status: string, versionCount: number): ApprovalStage {
  return DECISION_STAGE[status] ?? (versionCount > 1 ? 'reenviado' : 'aguardando');
}

/** Grupos da fila (como na Edição do site Daime): cada etapa cai em um dos três. */
export type ApprovalGroup = 'aguardando' | 'ajuste' | 'aprovado';

export const GROUPS: { id: ApprovalGroup; label: string; hint: string; stages: ApprovalStage[] }[] = [
  { id: 'aguardando', label: 'Aguardando aprovação', hint: 'V1 ou nova versão com a Thereza', stages: ['aguardando', 'reenviado'] },
  { id: 'ajuste', label: 'Ajuste', hint: 'Ajustes pedidos ou reprovado', stages: ['alteracao', 'reprovado'] },
  { id: 'aprovado', label: 'Aprovado', hint: 'Thereza aprovou', stages: ['aprovado'] },
];

export function groupOf(stage: ApprovalStage): ApprovalGroup {
  return GROUPS.find((g) => g.stages.includes(stage))!.id;
}

/** Resposta anterior na mesma versão (a equipe voltou o vídeo para aguardando, ou veio outra resposta). */
export interface PastResponse {
  decision: string;
  feedback: string;
  responded_at: string;
  responded_by_label: string;
  /** Preenchido quando a equipe devolveu o vídeo para "Aguardando aprovação". */
  reopened_at: string;
  reopened_by: string;
}

interface VersionLike {
  version: number;
  decision: string;
  history?: PastResponse[];
}

/** Caminho do vídeo: cada envio (aguardando / reenviado) seguido da resposta, se houve. */
export function stagePath(status: string, versions: VersionLike[]): ApprovalStage[] {
  if (versions.length === 0) {
    const current = stageOf(status, 1);
    return current === 'aguardando' ? ['aguardando'] : ['aguardando', current];
  }
  return versions.flatMap((v, index) => {
    const sent: ApprovalStage = index === 0 ? 'aguardando' : 'reenviado';
    const path: ApprovalStage[] = [sent];
    for (const past of v.history ?? []) {
      const old = DECISION_STAGE[past.decision];
      if (old) path.push(old);
      if (past.reopened_at) path.push(sent);
    }
    const answer = DECISION_STAGE[v.decision];
    if (answer) path.push(answer);
    return path;
  });
}

export interface TimelineVersion extends VersionLike {
  created_at: string;
  created_by_label: string;
  note: string;
  feedback: string;
  responded_at: string;
  responded_by_label: string;
}

export interface TimelineEvent {
  kind: 'enviado' | 'resposta' | 'reaberto' | 'esperando';
  stage: ApprovalStage;
  version: number;
  /** ISO; vazio em "esperando". */
  at: string;
  by: string;
  /** Envio: o que mudou; resposta: comentário da aprovadora. */
  text: string;
}

/** Linha do tempo do vídeo, da primeira versão até agora. */
export function timelineEvents(versions: TimelineVersion[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  versions.forEach((v, index) => {
    const sent: ApprovalStage = index === 0 ? 'aguardando' : 'reenviado';
    events.push({ kind: 'enviado', stage: sent, version: v.version, at: v.created_at, by: v.created_by_label, text: v.note });
    for (const past of v.history ?? []) {
      const old = DECISION_STAGE[past.decision];
      if (old) events.push({ kind: 'resposta', stage: old, version: v.version, at: past.responded_at, by: past.responded_by_label, text: past.feedback });
      if (past.reopened_at) events.push({ kind: 'reaberto', stage: sent, version: v.version, at: past.reopened_at, by: past.reopened_by, text: '' });
    }
    const answer = DECISION_STAGE[v.decision];
    if (answer) events.push({ kind: 'resposta', stage: answer, version: v.version, at: v.responded_at, by: v.responded_by_label, text: v.feedback });
    else if (index === versions.length - 1) events.push({ kind: 'esperando', stage: sent, version: v.version, at: '', by: '', text: '' });
  });
  return events;
}

/** Rótulo gravado pelo banco quando a resposta veio do link (sem login). */
export const LINK_RESPONDER = 'Aprovador pelo link';

export interface ChatMessage {
  id: number;
  author_kind: 'equipe' | 'aprovadora';
  author_id: string;
  author_label: string;
  body: string;
  created_at: string;
}

export type ChatItem =
  | { kind: 'enviado'; stage: ApprovalStage; version: number; at: string; by: string; text: string }
  /** Decisão: fromLink = resposta da Thereza pelo link; senão alguém da equipe mudou o status. */
  | { kind: 'decisao'; stage: ApprovalStage; version: number; at: string; by: string; text: string; fromLink: boolean }
  | { kind: 'reaberto'; stage: ApprovalStage; version: number; at: string; by: string }
  | { kind: 'mensagem'; message: ChatMessage; at: string }
  | { kind: 'esperando'; stage: ApprovalStage };

/** Conversa do vídeo: envios, decisões e mensagens em ordem de horário; "esperando" no fim, se for o caso. */
export function chatItems(versions: TimelineVersion[], messages: ChatMessage[]): ChatItem[] {
  const timed: Exclude<ChatItem, { kind: 'esperando' }>[] = [];
  let waiting: ChatItem | null = null;
  for (const event of timelineEvents(versions)) {
    if (event.kind === 'esperando') waiting = { kind: 'esperando', stage: event.stage };
    else if (event.kind === 'resposta')
      timed.push({ kind: 'decisao', stage: event.stage, version: event.version, at: event.at, by: event.by, text: event.text, fromLink: !event.by || event.by === LINK_RESPONDER });
    else if (event.kind === 'reaberto') timed.push({ kind: 'reaberto', stage: event.stage, version: event.version, at: event.at, by: event.by });
    else timed.push({ kind: 'enviado', stage: event.stage, version: event.version, at: event.at, by: event.by, text: event.text });
  }
  for (const message of messages) timed.push({ kind: 'mensagem', message, at: message.created_at });
  const time = (at: string) => (at ? new Date(at).getTime() : 0);
  const sorted = timed
    .map((item, index) => ({ item, index }))
    .sort((a, b) => time(a.item.at) - time(b.item.at) || a.index - b.index)
    .map(({ item }) => item);
  return waiting ? [...sorted, waiting] : sorted;
}
