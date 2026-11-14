-- Conexão com o Google Drive (aba "Aprovação de capa").
-- Guarda o refresh token do Google de quem conectou. Só o servidor (chave de serviço) lê e escreve:
-- o navegador não tem acesso nenhum a esta tabela.

create table if not exists public.google_drive_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text,
  updated_at timestamptz not null default now()
);

alter table public.google_drive_connections enable row level security;
revoke all on public.google_drive_connections from anon, authenticated;
