-- Aprovação de capa: pastas por casa com as fotos escolhidas no Google Drive.
-- O social media escolhe as fotos do carrossel/story e favorita as candidatas a capa;
-- o link público (share_token) mostra só as favoritas para a aprovadora escolher.
-- Tudo passa pelo servidor (chave de serviço): o navegador não acessa estas tabelas.

create table if not exists public.cover_collections (
  id bigint generated always as identity primary key,
  house_name text not null default '',
  neighborhood text not null default '',
  house_number text not null default '',
  share_token text unique check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{16,128}$'),
  client_feedback text not null default '',
  responded_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cover_collection_photos (
  id bigint generated always as identity primary key,
  collection_id bigint not null references public.cover_collections (id) on delete cascade,
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  name text not null default '',
  width integer,
  height integer,
  is_favorite boolean not null default false,
  approved boolean not null default false, -- escolhida como capa pela aprovadora
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (collection_id, drive_file_id)
);

create index if not exists cover_collection_photos_collection_idx on public.cover_collection_photos (collection_id, position);

alter table public.cover_collections enable row level security;
alter table public.cover_collection_photos enable row level security;
revoke all on public.cover_collections from anon, authenticated;
revoke all on public.cover_collection_photos from anon, authenticated;
