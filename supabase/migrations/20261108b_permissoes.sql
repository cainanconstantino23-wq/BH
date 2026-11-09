-- Permissões individuais da equipe (substitui os papéis fixos admin/membro/leitor).
-- Requer 20261108_equipe_bahia_homes.sql já aplicado. Pode ser rodado mais de uma vez.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run. Roda numa transação.
--
-- Permissões:
--   ver_estatisticas, ver_publicacoes,
--   criar_publicacoes, editar_publicacoes, reagendar_publicacoes, apagar_publicacoes,
--   aprovar_publicacoes, enviar_link_aprovacao,
--   atualizar_metricas, conectar_instagram, publicar_instagram,
--   gerenciar_pessoas, ver_historico
-- Modelos (coluna role, só como rótulo): admin, social, aprovador, leitor, personalizado.

begin;

-- ---------------------------------------------------------------
-- 1. Coluna de permissões e novos modelos
-- ---------------------------------------------------------------
alter table public.team_members add column if not exists permissions text[] not null default '{}';

alter table public.team_members drop constraint if exists team_members_role_check;
update public.team_members set role = 'social' where role = 'membro';
alter table public.team_members
  add constraint team_members_role_check check (role in ('admin', 'social', 'aprovador', 'leitor', 'personalizado'));

alter table public.team_members drop constraint if exists team_members_permissions_check;
alter table public.team_members add constraint team_members_permissions_check check (
  permissions <@ array[
    'ver_estatisticas', 'ver_publicacoes',
    'criar_publicacoes', 'editar_publicacoes', 'reagendar_publicacoes', 'apagar_publicacoes',
    'aprovar_publicacoes', 'enviar_link_aprovacao',
    'atualizar_metricas', 'conectar_instagram', 'publicar_instagram',
    'gerenciar_pessoas', 'ver_historico'
  ]::text[]
);

-- Quem já estava na equipe recebe as permissões do modelo correspondente.
update public.team_members set permissions = array[
  'ver_estatisticas', 'ver_publicacoes', 'criar_publicacoes', 'editar_publicacoes', 'reagendar_publicacoes',
  'apagar_publicacoes', 'aprovar_publicacoes', 'enviar_link_aprovacao', 'atualizar_metricas',
  'conectar_instagram', 'publicar_instagram', 'gerenciar_pessoas', 'ver_historico']
where role = 'admin';

update public.team_members set permissions = array[
  'ver_estatisticas', 'ver_publicacoes', 'criar_publicacoes', 'editar_publicacoes', 'reagendar_publicacoes',
  'apagar_publicacoes', 'enviar_link_aprovacao', 'atualizar_metricas']
where role = 'social' and permissions = '{}';

update public.team_members set permissions = array['ver_estatisticas', 'ver_publicacoes']
where role = 'leitor' and permissions = '{}';

grant update (permissions) on public.team_members to authenticated;

-- ---------------------------------------------------------------
-- 2. Verificação de permissão (só pessoas ATIVAS)
-- ---------------------------------------------------------------
create or replace function public.has_permission(permission text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.team_members
                     where user_id = auth.uid() and status = 'ativo' and permission = any (permissions)) $$;

revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- ---------------------------------------------------------------
-- 3. Equipe: quem tem "gerenciar_pessoas" aprova, muda permissões, bloqueia e remove
-- ---------------------------------------------------------------
drop policy if exists "team_members: admin altera" on public.team_members;
drop policy if exists "team_members: admin remove" on public.team_members;
drop policy if exists "team_members: gestor altera" on public.team_members;
drop policy if exists "team_members: gestor remove" on public.team_members;
create policy "team_members: gestor altera" on public.team_members
  for update to authenticated using (public.has_permission('gerenciar_pessoas'))
  with check (public.has_permission('gerenciar_pessoas'));
create policy "team_members: gestor remove" on public.team_members
  for delete to authenticated using (public.has_permission('gerenciar_pessoas'));

-- Nunca deixar a equipe sem ninguém ativo que possa gerenciar pessoas.
create or replace function public.keep_one_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'ativo' and 'gerenciar_pessoas' = any (old.permissions)
     and (tg_op = 'DELETE' or new.status <> 'ativo' or not ('gerenciar_pessoas' = any (new.permissions))) then
    if not exists (select 1 from public.team_members
                   where status = 'ativo' and 'gerenciar_pessoas' = any (permissions) and user_id <> old.user_id) then
      raise exception 'A equipe precisa de pelo menos uma pessoa ativa com permissão para gerenciar pessoas.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Histórico também registra mudança de permissões.
create or replace function public.log_team_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  label text := public.actor_name(auth.uid());
  act text;
  info jsonb;
  target uuid := coalesce(new.user_id, old.user_id);
  target_name text := coalesce(new.full_name, new.email, old.full_name, old.email);
begin
  if tg_op = 'INSERT' then
    act := 'equipe.cadastro';
    actor := new.user_id;
    label := target_name;
    info := jsonb_build_object('pessoa', target_name, 'email', new.email);
  elsif tg_op = 'DELETE' then
    act := 'equipe.removido';
    info := jsonb_build_object('pessoa', target_name, 'papel', old.role);
  elsif new.status is distinct from old.status then
    act := case new.status when 'ativo' then 'equipe.aprovado' when 'bloqueado' then 'equipe.bloqueado' else 'equipe.status_alterado' end;
    info := jsonb_build_object('pessoa', target_name, 'papel', new.role, 'de', old.status, 'para', new.status,
                               'permissoes', to_jsonb(new.permissions));
  elsif new.permissions is distinct from old.permissions or new.role is distinct from old.role then
    act := 'equipe.permissoes_alteradas';
    info := jsonb_build_object('pessoa', target_name, 'de', old.role, 'para', new.role,
                               'adicionadas', to_jsonb(array(select unnest(new.permissions) except select unnest(old.permissions))),
                               'removidas', to_jsonb(array(select unnest(old.permissions) except select unnest(new.permissions))));
  else
    return null;
  end if;

  insert into public.activity_log (actor_id, actor_label, action, entity_type, entity_id, details)
  values (actor, coalesce(label, 'Sistema'), act, 'equipe', target::text, info);
  return null;
end $$;

-- ---------------------------------------------------------------
-- 4. Publicações
-- ---------------------------------------------------------------
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'posts' loop
    execute format('drop policy %I on public.posts', p.policyname);
  end loop;
end $$;

create policy "posts: quem vê publicações lê" on public.posts
  for select to authenticated using (public.has_permission('ver_publicacoes'));
create policy "posts: quem cria insere" on public.posts
  for insert to authenticated with check (public.has_permission('criar_publicacoes') and user_id = (select auth.uid()));
create policy "posts: quem edita, reagenda ou aprova altera" on public.posts
  for update to authenticated
  using (public.has_permission('editar_publicacoes') or public.has_permission('reagendar_publicacoes')
         or public.has_permission('aprovar_publicacoes'))
  with check (public.has_permission('editar_publicacoes') or public.has_permission('reagendar_publicacoes')
              or public.has_permission('aprovar_publicacoes'));
create policy "posts: quem apaga remove" on public.posts
  for delete to authenticated using (public.has_permission('apagar_publicacoes'));

-- Cada tipo de alteração exige a permissão certa (ex.: a aprovadora não muda legenda nem data).
-- Alterações do servidor (link do cliente, contador de visualizações) não passam por aqui.
create or replace function public.guard_post_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (new.title, new.content, new.caption, new.image_url, new.platform, new.house_name, new.media_type)
     is distinct from (old.title, old.content, old.caption, old.image_url, old.platform, old.house_name, old.media_type)
     and not public.has_permission('editar_publicacoes') then
    raise exception 'Sem permissão para editar publicações.';
  end if;
  if (new.scheduled_date, new.hour, new.time_string, new.day_index)
     is distinct from (old.scheduled_date, old.hour, old.time_string, old.day_index)
     and not public.has_permission('reagendar_publicacoes') then
    raise exception 'Sem permissão para reagendar publicações.';
  end if;
  if (new.approval_status, new.client_feedback) is distinct from (old.approval_status, old.client_feedback)
     and not public.has_permission('aprovar_publicacoes') then
    raise exception 'Sem permissão para aprovar ou reprovar publicações.';
  end if;
  if new.user_id is distinct from old.user_id or new.approval_token is distinct from old.approval_token then
    raise exception 'Estes campos não podem ser alterados.';
  end if;
  return new;
end $$;

drop trigger if exists posts_guard_update on public.posts;
create trigger posts_guard_update
  before update on public.posts
  for each row execute function public.guard_post_update();

-- ---------------------------------------------------------------
-- 5. Métricas, histórico e arquivos
-- ---------------------------------------------------------------
drop policy if exists "instagram_account_daily: equipe lê" on public.instagram_account_daily;
drop policy if exists "instagram_media: equipe lê" on public.instagram_media;
drop policy if exists "instagram_account_daily: quem vê estatísticas lê" on public.instagram_account_daily;
drop policy if exists "instagram_media: quem vê estatísticas ou publicações lê" on public.instagram_media;
create policy "instagram_account_daily: quem vê estatísticas lê" on public.instagram_account_daily
  for select to authenticated using (public.has_permission('ver_estatisticas'));
-- A grade do feed mostra as publicações já feitas: quem vê publicações também lê.
create policy "instagram_media: quem vê estatísticas ou publicações lê" on public.instagram_media
  for select to authenticated using (public.has_permission('ver_estatisticas') or public.has_permission('ver_publicacoes'));

drop policy if exists "activity_log: admin lê" on public.activity_log;
drop policy if exists "activity_log: quem vê histórico lê" on public.activity_log;
create policy "activity_log: quem vê histórico lê" on public.activity_log
  for select to authenticated using (public.has_permission('ver_historico'));

drop policy if exists "posts bucket: equipe envia" on storage.objects;
drop policy if exists "posts bucket: quem cria ou edita envia" on storage.objects;
create policy "posts bucket: quem cria ou edita envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posts' and (public.has_permission('criar_publicacoes') or public.has_permission('editar_publicacoes')));

commit;

-- Conferência (rode depois, separado):
-- select email, role, status, permissions from public.team_members;
