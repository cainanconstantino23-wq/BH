-- Número da casa e versões na aprovação.
--  1. posts.house_number: número da casa, separado do nome (a grade mostra "Casa 110 · Vila dos Coqueiros").
--  2. post_versions: cada mídia enviada para aprovação vira uma versão (V1, V2, V3...), com a resposta
--     do aprovador para aquela versão. O mesmo link mostra todas.
--     posts continua guardando a versão ATUAL (image_url, caption, approval_status, client_feedback),
--     então grade, painel e link seguem funcionando como antes.
--  3. submit_post_version(): envia uma nova versão e devolve o post para "pendente".
-- Requer 20261108b_permissoes.sql. Pode ser rodado mais de uma vez.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run. Roda numa transação.

begin;

-- ---------------------------------------------------------------
-- 1. Número da casa
-- ---------------------------------------------------------------
alter table public.posts add column if not exists house_number text;

-- ---------------------------------------------------------------
-- 2. Versões
-- ---------------------------------------------------------------
create table if not exists public.post_versions (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  version integer not null,
  media_url text,
  media_type text,
  media_items jsonb not null default '[]'::jsonb,
  caption text,
  note text,                       -- recado da equipe ao enviar a versão (ex.: "troquei a abertura")
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_label text,
  decision text check (decision in ('approved', 'changes_requested', 'rejected')),
  feedback text,
  responded_at timestamptz,
  responded_by_label text,
  unique (post_id, version)
);

create index if not exists post_versions_post_idx on public.post_versions (post_id, version desc);

alter table public.post_versions enable row level security;
revoke all on public.post_versions from anon, authenticated;
grant select on public.post_versions to authenticated;
drop policy if exists "post_versions: quem vê publicações lê" on public.post_versions;
create policy "post_versions: quem vê publicações lê" on public.post_versions
  for select to authenticated using (public.has_permission('ver_publicacoes'));

-- Todo post novo já nasce com a V1.
create or replace function public.create_first_post_version()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.post_versions (post_id, version, media_url, media_type, media_items, caption, created_by, created_by_label, created_at)
  values (new.id, 1, new.image_url, new.media_type, coalesce(new.media_items, '[]'::jsonb),
          coalesce(new.caption, new.content), auth.uid(), public.actor_name(auth.uid()), coalesce(new.created_at, now()))
  on conflict (post_id, version) do nothing;
  return null;
end $$;

drop trigger if exists posts_first_version on public.posts;
create trigger posts_first_version
  after insert on public.posts
  for each row execute function public.create_first_post_version();

-- A resposta (pelo link ou pelo painel) fica registrada na versão atual.
create or replace function public.sync_post_version_response()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.approval_status, new.client_feedback) is not distinct from (old.approval_status, old.client_feedback) then
    return null;
  end if;
  update public.post_versions v
     set decision = case when new.approval_status in ('approved', 'changes_requested', 'rejected') then new.approval_status end,
         feedback = case when new.approval_status in ('approved', 'changes_requested', 'rejected') then new.client_feedback end,
         responded_at = case when new.approval_status in ('approved', 'changes_requested', 'rejected') then now() end,
         responded_by_label = case when new.approval_status in ('approved', 'changes_requested', 'rejected')
                                   then coalesce(public.actor_name(auth.uid()), 'Aprovador pelo link') end
   where v.post_id = new.id
     and v.version = (select max(version) from public.post_versions where post_id = new.id);
  return null;
end $$;

drop trigger if exists posts_sync_version_response on public.posts;
create trigger posts_sync_version_response
  after update of approval_status, client_feedback on public.posts
  for each row execute function public.sync_post_version_response();

-- Posts que já existiam viram V1, com a resposta que já tinham.
insert into public.post_versions (post_id, version, media_url, media_type, media_items, caption, created_at,
                                  decision, feedback, responded_at, responded_by_label)
select p.id, 1, p.image_url, p.media_type, coalesce(p.media_items, '[]'::jsonb), coalesce(p.caption, p.content),
       coalesce(p.created_at, now()),
       case when p.approval_status in ('approved', 'changes_requested', 'rejected') then p.approval_status end,
       case when p.approval_status in ('approved', 'changes_requested', 'rejected') then p.client_feedback end,
       case when p.approval_status in ('approved', 'changes_requested', 'rejected') then coalesce(p.created_at, now()) end,
       case when p.approval_status in ('approved', 'changes_requested', 'rejected') then 'Aprovador' end
from public.posts p
on conflict (post_id, version) do nothing;

-- ---------------------------------------------------------------
-- 3. Guarda de edição: número da casa exige "editar"; nova versão pode voltar para "pendente"
-- ---------------------------------------------------------------
create or replace function public.guard_post_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (new.title, new.content, new.caption, new.image_url, new.platform, new.house_name, new.house_number, new.media_type, new.media_items)
     is distinct from (old.title, old.content, old.caption, old.image_url, old.platform, old.house_name, old.house_number, old.media_type, old.media_items)
     and not public.has_permission('editar_publicacoes') then
    raise exception 'Sem permissão para editar publicações.';
  end if;
  if (new.scheduled_date, new.hour, new.time_string, new.day_index)
     is distinct from (old.scheduled_date, old.hour, old.time_string, old.day_index)
     and not public.has_permission('reagendar_publicacoes') then
    raise exception 'Sem permissão para reagendar publicações.';
  end if;
  -- Enviar nova versão (submit_post_version) devolve o post para "pendente" sem exigir "aprovar".
  if (new.approval_status, new.client_feedback) is distinct from (old.approval_status, old.client_feedback)
     and not public.has_permission('aprovar_publicacoes')
     and coalesce(current_setting('bh.nova_versao', true), '') <> 'sim' then
    raise exception 'Sem permissão para aprovar ou reprovar publicações.';
  end if;
  if new.user_id is distinct from old.user_id or new.approval_token is distinct from old.approval_token then
    raise exception 'Estes campos não podem ser alterados.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------
-- 4. Enviar nova versão
-- ---------------------------------------------------------------
create or replace function public.submit_post_version(
  p_post_id bigint,
  p_media_url text,
  p_media_type text,
  p_caption text,
  p_note text default null
)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  next_version integer;
  current_post public.posts%rowtype;
begin
  if not public.has_permission('editar_publicacoes') then
    raise exception 'Sem permissão para enviar nova versão.';
  end if;

  select * into current_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Publicação não encontrada.';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.post_versions where post_id = p_post_id;

  insert into public.post_versions (post_id, version, media_url, media_type, media_items, caption, note, created_by, created_by_label)
  values (p_post_id, next_version,
          coalesce(nullif(p_media_url, ''), current_post.image_url),
          coalesce(nullif(p_media_type, ''), current_post.media_type),
          case when nullif(p_media_url, '') is null then coalesce(current_post.media_items, '[]'::jsonb) else '[]'::jsonb end,
          coalesce(p_caption, current_post.caption, current_post.content),
          nullif(trim(coalesce(p_note, '')), ''),
          auth.uid(), public.actor_name(auth.uid()));

  perform set_config('bh.nova_versao', 'sim', true);
  update public.posts
     set image_url = coalesce(nullif(p_media_url, ''), image_url),
         media_type = coalesce(nullif(p_media_type, ''), media_type),
         media_items = case when nullif(p_media_url, '') is null then media_items else '[]'::jsonb end,
         caption = coalesce(p_caption, caption),
         content = coalesce(p_caption, content),
         approval_status = 'pending',
         client_feedback = null
   where id = p_post_id;
  perform set_config('bh.nova_versao', '', true);

  return next_version;
end $$;

revoke execute on function public.submit_post_version(bigint, text, text, text, text) from public, anon;
grant execute on function public.submit_post_version(bigint, text, text, text, text) to authenticated;

commit;

-- Conferência (rode depois, separado):
-- select post_id, version, decision, left(feedback, 40), responded_by_label from public.post_versions order by post_id, version;
