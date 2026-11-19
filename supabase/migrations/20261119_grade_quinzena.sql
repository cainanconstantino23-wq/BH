-- Aprovação da grade (19/11/2026): a social media monta a grade do feed dos próximos 15 (ou 30) dias com as casas
-- e as capas candidatas (pastas da Aprovação de capa) e manda UM link para a Thereza (/grade/[token]).
-- Ela vê como o feed vai ficar, arrasta para trocar as posições, escolhe a capa de cada casa, troca uma casa
-- por outra da reserva e aprova a grade. 1 post de foto por dia; domingo é dia de Reels (vídeo, fora da grade por enquanto).
-- Só o servidor lê e grava (chave de serviço). Pode ser rodado mais de uma vez.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run.

create table if not exists public.feed_plans (
  id bigint generated always as identity primary key,
  start_date date not null,
  days integer not null check (days between 7 and 31),
  post_hour integer not null default 19 check (post_hour between 0 and 23),
  share_token text unique check (share_token ~ '^[A-Za-z0-9_-]{16,128}$'),
  link_created_at timestamptz,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado')),
  feedback text not null default '',
  responded_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_by_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma linha por casa no plano. slot_date nulo = casa da reserva (a Thereza pode trocar uma casa da grade por ela).
create table if not exists public.feed_plan_items (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.feed_plans (id) on delete cascade,
  collection_id bigint not null references public.cover_collections (id) on delete cascade,
  slot_date date,
  cover_drive_id text,
  unique (plan_id, collection_id)
);
create index if not exists feed_plan_items_plan_idx on public.feed_plan_items (plan_id);

alter table public.feed_plans enable row level security;
alter table public.feed_plan_items enable row level security;
revoke all on public.feed_plans from anon, authenticated;
revoke all on public.feed_plan_items from anon, authenticated;
