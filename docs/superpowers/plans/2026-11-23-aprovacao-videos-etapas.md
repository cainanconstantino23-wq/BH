# Aprovação vídeos por etapas — plano

> Execução: superpowers:executing-plans (inline). Spec: docs/superpowers/specs/2026-11-23-aprovacao-videos-etapas-design.md

### Task 1: regras das etapas (src/lib/videoApproval.ts + .test.ts)
- `type ApprovalStage = 'aguardando' | 'alteracao' | 'reenviado' | 'aprovado' | 'reprovado'`; `STAGES` (id, label, hint).
- `stageOf(status: string, versionCount: number): ApprovalStage`
- `stagePath(status, versions: {decision: string}[]): ApprovalStage[]` — V1 = aguardando, V2+ = reenviado, cada decisão vira aprovado/alteracao/reprovado; sem versões: [aguardando] + etapa atual se diferente.
- `timelineEvents(versions)` → `{ stage, version, kind: 'enviado'|'resposta'|'esperando', at, by, text }[]`.
- Testes: V1 pendente; V1 ajustes; V2 pendente; V3 após 2 ajustes; aprovado após V2; reprovado; sem versões.

### Task 2: tela (src/components/ApprovalSectionOrange.tsx)
- StageTimeline no topo; grupos recolhíveis fechados; linha nova; detalhe sem publicar; abas de versão; linha do tempo do vídeo com timelineEvents.
- Remover código de publicar que ficar sem uso (CreatePostModal, PublishResultDialog, publishPost/publishResult).
- Verificar: npm test, tsc, eslint, build, tela no localhost.
