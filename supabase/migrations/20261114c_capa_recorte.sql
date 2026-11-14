-- Aprovação de capa: versão cortada da foto (o Drive é só leitura; o corte fica no R2).
alter table public.cover_collection_photos
  add column if not exists edited_url text,
  add column if not exists edited_width integer,
  add column if not exists edited_height integer,
  add column if not exists edited_label text;
