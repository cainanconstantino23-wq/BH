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

interface VersionLike {
  version: number;
  decision: string;
}

/** Caminho do vídeo: cada envio (aguardando / reenviado) seguido da resposta, se houve. */
export function stagePath(status: string, versions: VersionLike[]): ApprovalStage[] {
  if (versions.length === 0) {
    const current = stageOf(status, 1);
    return current === 'aguardando' ? ['aguardando'] : ['aguardando', current];
  }
  return versions.flatMap((v, index) => {
    const sent: ApprovalStage = index === 0 ? 'aguardando' : 'reenviado';
    const answer = DECISION_STAGE[v.decision];
    return answer ? [sent, answer] : [sent];
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
  kind: 'enviado' | 'resposta' | 'esperando';
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
    const answer = DECISION_STAGE[v.decision];
    if (answer) events.push({ kind: 'resposta', stage: answer, version: v.version, at: v.responded_at, by: v.responded_by_label, text: v.feedback });
    else if (index === versions.length - 1) events.push({ kind: 'esperando', stage: sent, version: v.version, at: '', by: '', text: '' });
  });
  return events;
}
