# Aprovação vídeos por etapas — design curto

Data: 23/11/2026 · Aprovado pela prévia macOS (scratchpad aprovacao-videos-macos.html).

## Por quê
A equipe precisa ver de relance em que ponto cada vídeo está, inclusive os que voltaram para alteração e os reenviados. A aba é só de aprovação.

## O que muda
- Etapas (por vídeo): Aguardando (pendente, 1 versão) · Voltou para alteração (changes_requested) · Reenviado (pendente, V2+) · Aprovado · Reprovado. Regra pura em src/lib/videoApproval.ts (stageOf, stagePath, timelineEvents) com testes.
- Topo: linha do tempo de vidro com as 5 etapas, contagem, setas, divisória antes dos resultados e o lembrete do vai e volta. Tocar numa etapa abre só aquele grupo.
- Fila: 5 grupos recolhíveis, todos fechados ao entrar (sem memória). Linha: miniatura, casa, versão, data planejada (ou o pedido da Thereza em "Voltou para alteração"), data à direita e barrinhas com o caminho.
- Detalhe: data planejada continua (editável); saem Publicar / Agendar / Cancelar agendamento (publicar fica na Grade do feed). Versões em abas (V1, V2…) para trocar a mídia; linha do tempo do vídeo (enviado, pediu alterações com o comentário, reenviado, aguardando).
- Selo de publicação (PublishStatusTag) sai das linhas.

## Fora
- Seletor "Só o que precisa de mim" da prévia: fica para depois (depende de quem está olhando).
- Nada muda no banco nem no link público.

## Decisões minhas
- Publicar/Agendar saem desta aba (prévia aprovada sem eles); Grade do feed segue publicando vídeos com data.
- Grupos sempre começam fechados.
