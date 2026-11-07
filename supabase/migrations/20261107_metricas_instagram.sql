-- Passo 3: tabelas das métricas do Instagram.
-- Quem grava: só o servidor (rotina de sincronização, com a chave de serviço).
-- Quem lê: o dono, logado no painel.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run.

begin;

-- ---------------------------------------------------------------
-- 1. Um registro por dia do perfil (seguidores e métricas do dia)
--    A API não dá histórico de seguidores: o total é fotografado a cada sincronização.
-- ---------------------------------------------------------------
create table if not exists public.instagram_account_daily (
  instagram_account_id text not null,
  date date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  followers_count integer,
  follows_count integer,
  media_count integer,
  reach integer,
  views integer,
  accounts_engaged integer,
  total_interactions integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  profile_links_taps integer,
  follows integer,
  unfollows integer,
  updated_at timestamptz not null default now(),
  primary key (instagram_account_id, date)
);

-- ---------------------------------------------------------------
-- 2. Cada publicação, com as métricas mais recentes
-- ---------------------------------------------------------------
create table if not exists public.instagram_media (
  id text primary key,                      -- ID da mídia no Instagram
  instagram_account_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_type text,                          -- IMAGE, VIDEO, CAROUSEL_ALBUM
  media_product_type text,                  -- FEED, REELS, STORY
  caption text,
  permalink text,
  thumbnail_url text,                       -- links do Instagram expiram; são renovados a cada sincronização
  media_url text,
  published_at timestamptz,
  likes integer,
  comments integer,
  shares integer,
  saved integer,
  reach integer,
  views integer,
  total_interactions integer,
  reels_avg_watch_time_ms bigint,
  reels_total_watch_time_ms bigint,
  insights_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_media_account_published_idx
  on public.instagram_media (instagram_account_id, published_at desc);

-- ---------------------------------------------------------------
-- 3. Estado da sincronização na conexão
-- ---------------------------------------------------------------
alter table public.user_meta_config
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_error text;

-- ---------------------------------------------------------------
-- 4. Segurança: RLS ligado, leitura só do dono, nenhuma escrita pelo navegador
-- ---------------------------------------------------------------
alter table public.instagram_account_daily enable row level security;
alter table public.instagram_media enable row level security;
revoke all on public.instagram_account_daily, public.instagram_media from anon;
revoke insert, update, delete on public.instagram_account_daily, public.instagram_media from authenticated;

create policy "instagram_account_daily: dono lê" on public.instagram_account_daily
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "instagram_media: dono lê" on public.instagram_media
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
