-- Link único com todos os posts ainda não aprovados (/aprovar/[token]).
-- O link é fixo: mostra sempre os pendentes do momento. A equipe pode gerar um novo (o antigo deixa de abrir).
-- Só o servidor lê e grava (chave de serviço); o navegador não tem acesso à tabela.
-- Pode ser rodado mais de uma vez. Rodar no Supabase: SQL Editor > New query > colar tudo > Run.

create table if not exists public.approval_list_links (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{16,128}$'),
  created_at timestamptz not null default now(),
  created_by uuid,
  revoked_at timestamptz
);

alter table public.approval_list_links enable row level security;
revoke all on public.approval_list_links from anon, authenticated;
