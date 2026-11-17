-- Data planejada da publicação de cada pasta (Aprovação fotos).
-- Definida ao salvar a pasta pelo Drive; dá para mudar na pasta, na fila e arrastando na Grade do feed.
-- Enquanto a pasta não vira post, ela aparece na Grade do feed nessa data (planejamento do mês).

alter table public.cover_collections
  add column if not exists planned_date date,
  add column if not exists planned_hour smallint check (planned_hour between 0 and 23);
