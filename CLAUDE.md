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
- Publicação automática no Instagram NÃO existe ainda (agendamento só salva no banco).
- Equipe única da Bahia Homes (sem organizations): todos os membros ativos veem os mesmos dados; permissões aplicadas no banco (has_permission + RLS + trigger guard_post_update).
- /api/upload-url exige login e permissão de criar/editar publicações.

## Regras
- Nunca escrever chaves ou segredos em arquivos versionados; usar .env.local
- Antes de cada push: conferir variáveis de ambiente necessárias na Vercel e rodar o build de produção.
- Responder sempre em português
