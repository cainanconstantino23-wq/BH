# Tabela de postagens + volta da Aprovação de capa — design curto

Data: 18/11/2026 · Aprovado na conversa.

## Por quê
O social media precisa saber qual casa postar a seguir (planilha "POSTAGENS INSTA 2025", que fica no Drive) e fechar a escolha de capas com a Thereza num lugar só, com registro de data de cada escolha.

## Objetivos
1. Plataformas: sai Facebook, YouTube, LinkedIn. Fica Instagram e entra **Tabela de postagens**.
2. Workspace: **Aprovação de capa** volta, logo depois de "Grade do feed".

## Fora do escopo (agora)
- Escrever na planilha / sincronizar (fica para depois; exigirá escopo `spreadsheets` e planilha nativa do Google).
- Preencher datas de postagem automaticamente ao publicar.

## Abordagens consideradas
- **A (escolhida p/ futuro):** app lê e escreve direto na planilha do Drive, sem cópia no banco.
- B: cópia no Supabase + sincronização periódica — descartada (conflitos, mais peças).
- Agora: só leitura, baixando o arquivo com o escopo `drive.readonly` que já existe.

## Tabela de postagens
- Servidor (rota com login) baixa o arquivo do Drive pela conexão da equipe: Planilha Google → exporta como .xlsx; .xlsx → baixa direto. Lê a aba **POSTAGENS** com `exceljs`.
- Arquivo: procura por nome contendo "POSTAGENS INSTA 2025"; env opcional `POSTAGENS_SHEET_ID` fixa o arquivo.
- Colunas por cabeçalho: ATUALIZADO, CASA, Ultima Postagem, OBSERVAÇÕES, QUALIF CORRETORAS, Data entrada site, todas as POSTAGEM (datas em ordem; 1ª e última em destaque, lista completa ao clicar). Datas do Excel (número serial) convertidas.
- Linhas sem CASA são ignoradas.
- **Prioridade (decisão minha):** nunca postada → postada há mais tempo → … ; casas com "NÃO PUBLICAR" / "Não postar" no fim, esmaecidas. Selo "há X meses".
- Filtros: busca por casa; Atualizado; Qualif. corretoras.
- Botão Atualizar. Sem conexão Google → aviso "Reconectar Google Drive".
- Visível para todo membro ativo.

## Aprovação de capa
- Reativa a aba com `CoverApprovalPanel mode="capa"` (código já existe).
- Link público `/capa/[token]`: Thereza pode **cortar** uma capa em 4:5 (carrossel). Corte enviado ao R2 por rota pública validada pelo token; grava `edited_url` etc. na foto + quem/quando (Thereza).
- Tela da pasta mostra a data/hora de cada escolha da Thereza (escolhida, adicionada, cortada).
- **Confirmar capas**: depois da resposta, o social media confirma; grava `confirmed_by`/`confirmed_at` na pasta e no Registro (activity_log).
- Migração SQL nova para as colunas novas (rodada manualmente no SQL Editor).

## Fica para o construtor
Detalhes visuais seguindo DESIGN.md; nomes de rotas; tratamento de células mescladas/vazias.
