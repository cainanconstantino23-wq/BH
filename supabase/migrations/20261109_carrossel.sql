-- Carrossel: um post pode ter várias mídias (o Instagram aceita até 20).
-- image_url continua sendo a capa (primeira mídia), então grade, aprovação e planner seguem funcionando.
-- media_items guarda a lista completa, na ordem: [{"url": "...", "type": "image" | "video"}, ...]
-- Pode ser rodado mais de uma vez. Rodar no Supabase: SQL Editor > New query > colar tudo > Run.

alter table public.posts
  add column if not exists media_items jsonb not null default '[]'::jsonb;

comment on column public.posts.media_items is
  'Mídias do post na ordem de exibição (carrossel). A primeira também fica em image_url.';
