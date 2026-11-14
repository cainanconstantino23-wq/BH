# BH Analytics (Bahia Homes Analytics)

SaaS para imobiliárias e corretores de alto padrão (Trancoso / Porto Seguro). Cliente real: Bahia Homes; a conta Instagram @daimefilmes é só teste.
Tom visual: elegante, limpo, "luxo descalço". Interface em português (pt-BR).

## Stack
- Next.js 16 (App Router, pasta src/) + Tailwind 4 + lucide-react. Ler node_modules/next/dist/docs antes de usar APIs do Next (AGENTS.md).
- Supabase: Auth, banco e Storage. Sem banco separado de desenvolvimento: localhost e produção usam o mesmo projeto.
- Cloudflare R2: mídias (Supabase Free limita a 50 MB), upload via URL assinada em src/app/api/upload-url/route.ts
- Deploy: Vercel via `git push origin main` (vai direto para produção). Desenvolver e testar no localhost primeiro.

## Módulos
- Instagram (login unificado do Meta = Login do Facebook para Empresas com config_id; token de usuário do sistema, não expira):
  - Conexão: src/app/api/auth/instagram/(login|callback), lógica em src/lib/meta/graph.ts. O Meta não informa a conta no login (sem business_management); o ID da conta pode precisar ser salvo manualmente.
  - Token e conta em user_meta_config (só o servidor acessa; RLS fechado para o navegador).
  - Sincronização: src/lib/meta/instagramSync.ts → tabelas instagram_account_daily e instagram_media. Cron diário (vercel.json, 09:00 UTC) em /api/cron/instagram-sync com CRON_SECRET; botão "Atualizar agora" em /api/instagram/sync.
  - Painel: src/components/analytics/InstagramDashboard.tsx (dados via /api/instagram/metrics).
- Central de aprovação: src/components/ApprovalSectionOrange.tsx gera link público /approval/[token]; a página do cliente lê e responde por /api/approval/[token] (chave de serviço no servidor); qualquer pessoa com o link responde, sem login; prazo de 7 dias ainda não é aplicado.
  - Versões: tabela post_versions (V1 criada por trigger no insert; resposta gravada na versão atual por trigger). "Enviar nova versão" chama a função submit_post_version, que devolve o post a pendente no mesmo link. posts guarda sempre a versão atual.
  - Lista: /aprovar/[token] mostra todos os não aprovados num link fixo (tabela approval_list_links, só servidor); gerado no painel via /api/approval-list; dados públicos via /api/approval-list/[token]. Cada cartão abre /approval/[token]?lista=... com botão de voltar.
- Aprovação de capa (aba depois da Grade do feed): src/components/drive/CoverApprovalPanel.tsx (pastas por casa + detalhe) e DriveBrowser.tsx (navega no Drive, ✓ escolhe, ★ favorita para capa, salva na pasta da casa).
  - Pastas em cover_collections (nome, bairro, número, share_token, resposta) e cover_collection_photos (drive_file_id, is_favorite, approved); só servidor, via /api/capa e /api/capa/[id] (+ /link).
  - Link público /capa/[token] mostra só as favoritas; a aprovadora escolhe a capa e comenta via /api/capa-link/[token] (imagens em /api/capa-link/[token]/thumb/[fileId], só favoritas da pasta).
  - Login Google OAuth (escopo drive.readonly) em src/app/api/auth/google/(login|callback); lógica em src/lib/google/drive.ts; tokens em google_drive_connections (só servidor; conexão da equipe = a mais recente). Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
  - Listagem /api/drive/list?folder=root|shared|drives|<id>; miniaturas pelo servidor em /api/drive/thumb/[id]?s=400. Em modo de teste do Google o acesso expira a cada 7 dias (reconectar).
- Casa: posts.house_name + posts.house_number; exibição por houseLabel() em src/lib/house.ts ("Casa 110 · Vila dos Coqueiros").
- Agendamento: src/components/CreatePostModal.tsx com editor de imagem nas medidas do Instagram (src/components/media/InstagramImageEditor.tsx, medidas em src/lib/instagramFormats.ts); salva na tabela posts.
- Grade do feed: src/components/analytics/CatalogModal.tsx (prévia 3:4, agendados + publicados, arrastar para trocar datas).
- Tela inicial após o login: src/components/home/HomeHub.tsx (fotos das casas em public/inicio, avisos do dia, dock com motion). O logo do painel volta para ela.
- Equipe: cadastro aberto, admin aprova no app e escolhe entre 13 permissões (src/lib/team.tsx, src/lib/team-server.ts, src/components/team/). Histórico em activity_log (triggers no banco), sininho de notificações, menu da conta no canto superior direito.

## Segurança
- posts: RLS "só o dono" (user_id = auth.uid()); anon bloqueado. Inserções pelo servidor precisam informar user_id.
- Migrações SQL ficam em supabase/migrations/ e são rodadas manualmente no SQL Editor do Supabase.
- Rotas protegidas: /api/cron/* exige CRON_SECRET; /api/instagram/* exige login.

## Situação atual
- Publicação no Instagram: src/lib/meta/publish.ts (contêiner → espera processar → media_publish; foto, carrossel, Reels, Story). "Publicar agora" e "publicar sozinho no horário" na prévia da Grade do feed (POST/PATCH /api/instagram/publish, permissão publicar_instagram, só aprovados). Agendador: /api/cron/instagram-publish (CRON_SECRET; a cada 5 min por agendador externo, não publica atrasados > 6 h). Campos publish_* em posts só o servidor altera (guard). Exige instagram_content_publish no token; a API não aceita foto 3:4.
- Equipe única da Bahia Homes (sem organizations): todos os membros ativos veem os mesmos dados; permissões aplicadas no banco (has_permission + RLS + trigger guard_post_update).
- /api/upload-url exige login e permissão de criar/editar publicações.

## Regras
- Nunca escrever chaves ou segredos em arquivos versionados; usar .env.local
- Antes de cada push: conferir variáveis de ambiente necessárias na Vercel e rodar o build de produção.
- Responder sempre em português
