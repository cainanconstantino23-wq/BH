-- Passo 2: prepara user_meta_config para a conexão do Instagram (login unificado, sem anúncios).
-- A tabela está vazia em 06/11/2026; nada é perdido.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run.

begin;

-- Sem Meta Ads por enquanto: a conta de anúncios deixa de ser obrigatória.
alter table public.user_meta_config alter column ad_account_id drop not null;

-- Dados da conta conectada e controle do token.
alter table public.user_meta_config
  add column if not exists instagram_username text,
  add column if not exists token_expires_at timestamptz,  -- vazio = token que não expira (usuário do sistema)
  add column if not exists updated_at timestamptz not null default now();

-- Uma conexão por usuário (o upsert do app usa user_id como chave).
create unique index if not exists user_meta_config_user_id_key on public.user_meta_config (user_id);

commit;
