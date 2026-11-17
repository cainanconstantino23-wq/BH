-- Aprovação fotos: o social media organiza, por casa, as 15 fotos do carrossel (de ~50 no Drive)
-- e marca as capas, antes de enviar para aprovação. Usa as mesmas tabelas da Aprovação de capa,
-- separadas pela coluna kind ('capa' = aba Aprovação de capa; 'fotos' = aba Aprovação fotos).

alter table public.cover_collections
  add column if not exists kind text not null default 'capa';

alter table public.cover_collections
  drop constraint if exists cover_collections_kind_check;
alter table public.cover_collections
  add constraint cover_collections_kind_check check (kind in ('capa', 'fotos'));

create index if not exists cover_collections_kind_idx on public.cover_collections (kind, updated_at desc);
