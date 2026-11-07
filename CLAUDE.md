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
- Central de aprovação: src/components/ApprovalSectionOrange.tsx gera link público /approval/[token]; a página do cliente lê e responde por /api/approval/[token] (chave de serviço no servidor); prazo de 7 dias ainda não é aplicado.
- Agendamento: src/components/CreatePostModal.tsx com editor de imagem nas medidas do Instagram (src/components/media/InstagramImageEditor.tsx, medidas em src/lib/instagramFormats.ts); salva na tabela posts.
- Grade do feed: src/components/analytics/CatalogModal.tsx (prévia 3:4, agendados + publicados, arrastar para trocar datas).

## Segurança
- posts: RLS "só o dono" (user_id = auth.uid()); anon bloqueado. Inserções pelo servidor precisam informar user_id.
- Migrações SQL ficam em supabase/migrations/ e são rodadas manualmente no SQL Editor do Supabase.
- Rotas protegidas: /api/cron/* exige CRON_SECRET; /api/instagram/* exige login.

## Situação atual
- Publicação automática no Instagram NÃO existe ainda (agendamento só salva no banco).
- Próximo passo planejado: modelo de empresa/equipe (organizations + membros com convite por e-mail) para todos da Bahia Homes verem os mesmos dados; hoje os dados são por usuário e o cadastro está aberto.
- /api/upload-url ainda não exige login.

## Regras
- Nunca escrever chaves ou segredos em arquivos versionados; usar .env.local
- Antes de cada push: conferir variáveis de ambiente necessárias na Vercel e rodar o build de produção.
- Responder sempre em português
