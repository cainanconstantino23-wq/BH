-- Liga o post à pasta (Aprovação de capa / Aprovação fotos) cuja capa a aprovadora aprovou.
-- A Grade do feed mostra só fotos: as publicadas no Instagram e os posts com esta ligação.
-- Só o servidor (POST /api/capa/[id]/post, chave de serviço) grava a coluna.

alter table public.posts
  add column if not exists cover_collection_id bigint references public.cover_collections(id) on delete set null;

-- posts já criados pela aprovação de capa (o registro guarda o id do post)
update public.posts p
   set cover_collection_id = l.entity_id::bigint
  from public.activity_log l
 where l.action = 'capa.post_criado'
   and l.entity_id ~ '^\d+$'
   and (l.details->>'post') ~ '^\d+$'
   and (l.details->>'post')::bigint = p.id
   and p.cover_collection_id is null
   and exists (select 1 from public.cover_collections c where c.id = l.entity_id::bigint);

-- no navegador ninguém cria post já ligado a uma pasta aprovada
create or replace function public.guard_post_cover_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    new.cover_collection_id := null;
  end if;
  return new;
end $$;

drop trigger if exists guard_post_cover_insert on public.posts;
create trigger guard_post_cover_insert
  before insert on public.posts
  for each row execute function public.guard_post_cover_insert();

-- nem altera a ligação depois (mesma função de antes + cover_collection_id)
create or replace function public.guard_post_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if new.user_id is distinct from old.user_id
     or new.approval_token is distinct from old.approval_token
     or new.cover_collection_id is distinct from old.cover_collection_id then
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
end $function$;
