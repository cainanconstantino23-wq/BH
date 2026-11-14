-- Publicação no Instagram pela plataforma.
-- Só o servidor (chave de serviço) muda a situação da publicação; o navegador só liga/desliga a publicação automática.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run. Pode ser rodado mais de uma vez.

alter table public.posts
  add column if not exists auto_publish boolean not null default false, -- publicar sozinho no horário agendado
  add column if not exists publish_status text check (publish_status in ('processing', 'published', 'error')),
  add column if not exists publish_error text,
  add column if not exists publish_container_id text, -- contêiner do Instagram (vídeo ainda processando)
  add column if not exists publish_attempted_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists ig_media_id text,
  add column if not exists ig_permalink text;

create index if not exists posts_auto_publish_idx on public.posts (scheduled_date) where auto_publish and publish_status is distinct from 'published';

-- Guarda de edição (mesma da migração de versões) + campos da publicação só pelo servidor.
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
  if (new.publish_status, new.publish_error, new.publish_container_id, new.publish_attempted_at, new.published_at, new.ig_media_id, new.ig_permalink)
     is distinct from (old.publish_status, old.publish_error, old.publish_container_id, old.publish_attempted_at, old.published_at, old.ig_media_id, old.ig_permalink) then
    raise exception 'A situação da publicação só é alterada pelo servidor.';
  end if;
  if new.auto_publish is distinct from old.auto_publish and not public.has_permission('publicar_instagram') then
    raise exception 'Sem permissão para publicar no Instagram.';
  end if;
  return new;
end $$;

-- Na criação também: o navegador não cria post já "publicado".
create or replace function public.guard_post_insert_publish()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.publish_status := null;
  new.publish_error := null;
  new.publish_container_id := null;
  new.publish_attempted_at := null;
  new.published_at := null;
  new.ig_media_id := null;
  new.ig_permalink := null;
  if new.auto_publish and not public.has_permission('publicar_instagram') then
    new.auto_publish := false;
  end if;
  return new;
end $$;

drop trigger if exists posts_guard_insert_publish on public.posts;
create trigger posts_guard_insert_publish
  before insert on public.posts
  for each row execute function public.guard_post_insert_publish();
