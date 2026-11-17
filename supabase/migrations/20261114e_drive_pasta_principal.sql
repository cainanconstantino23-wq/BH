-- Google Drive: limitar a navegação a uma pasta (e subpastas). Vazio = Drive inteiro.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run.
alter table public.google_drive_connections
  add column if not exists root_folder_id text check (root_folder_id is null or root_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  add column if not exists root_folder_name text;
