-- Aprovação de capa (volta em 18/11/2026): corte feito pela aprovadora no link e confirmação do social media.
-- Rodar manualmente no SQL Editor do Supabase. Sem ela, o app funciona, só não grava esses campos.

alter table public.cover_collection_photos
  add column if not exists edited_by text,        -- quem fez o corte (edited_url): membro da equipe ou "Thereza (link de aprovação)"
  add column if not exists edited_at timestamptz;

alter table public.cover_collections
  add column if not exists confirmed_by text,     -- quem confirmou as capas escolhidas pela aprovadora
  add column if not exists confirmed_at timestamptz;
