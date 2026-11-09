-- Equipe da Bahia Homes: cadastro com aprovação do admin dentro do SaaS e histórico de ações.
-- Papéis: admin (aprova pessoas, conecta o Instagram, vê o histórico), membro (agenda, aprova, reorganiza), leitor (só visualiza).
-- Situação da pessoa: pendente (acabou de se cadastrar, sem acesso), ativo, bloqueado.
-- Pode ser rodado mais de uma vez (inclusive se a versão anterior deste arquivo já foi rodada).
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run. Roda numa transação: se algo falhar, nada é aplicado.

begin;

-- ---------------------------------------------------------------
-- 1. Equipe
-- ---------------------------------------------------------------
create table if not exists public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'leitor' check (role in ('admin', 'membro', 'leitor')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.team_members
  add column if not exists email text,
  add column if not exists status text not null default 'pendente',
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.team_members alter column role set default 'leitor';
alter table public.team_members alter column must_change_password set default false;
alter table public.team_members drop constraint if exists team_members_status_check;
alter table public.team_members add constraint team_members_status_check check (status in ('pendente', 'ativo', 'bloqueado'));

-- Quem já tem login entra na lista (como pendente); o e-mail é copiado para a tela do admin.
insert into public.team_members (user_id, email, full_name, role, status)
select u.id, u.email, nullif(u.raw_user_meta_data ->> 'full_name', ''), 'leitor', 'pendente'
from auth.users u
on conflict (user_id) do nothing;

update public.team_members t set email = u.email from auth.users u where u.id = t.user_id and t.email is null;

-- Primeiro admin: cainanconstantino23@gmail.com.
update public.team_members
set role = 'admin', status = 'ativo', must_change_password = false,
    full_name = coalesce(full_name, 'Cainan Constantino'), approved_at = coalesce(approved_at, now())
where user_id = '4a77b87d-efe1-4127-9861-e9553e4f48ff';

-- ---------------------------------------------------------------
-- 2. Funções de apoio (rodam com o dono do banco; só contam pessoas ATIVAS)
-- ---------------------------------------------------------------
create or replace function public.team_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.team_members where user_id = auth.uid() and status = 'ativo' $$;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.team_members where user_id = auth.uid() and status = 'ativo') $$;

create or replace function public.team_can_edit()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin', 'membro') from public.team_members
                        where user_id = auth.uid() and status = 'ativo'), false) $$;

revoke execute on function public.team_role(), public.is_team_member(), public.team_can_edit() from public, anon;
grant execute on function public.team_role(), public.is_team_member(), public.team_can_edit() to authenticated;

-- ---------------------------------------------------------------
-- 3. Cadastro: toda conta nova entra automaticamente como "pendente"
-- ---------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.team_members (user_id, email, full_name, role, status)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''), 'leitor', 'pendente')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------
-- 4. Regras da lista da equipe
--    - a pessoa vê a própria linha (para saber se está pendente);
--    - membros ativos veem a equipe;
--    - só o admin aprova, muda papel, bloqueia ou remove (direto do SaaS).
-- ---------------------------------------------------------------
alter table public.team_members enable row level security;
revoke all on public.team_members from anon;
revoke insert, update, delete on public.team_members from authenticated;
grant select on public.team_members to authenticated;
grant update (full_name, role, status, approved_by, approved_at) on public.team_members to authenticated;
grant delete on public.team_members to authenticated;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'team_members' loop
    execute format('drop policy %I on public.team_members', p.policyname);
  end loop;
end $$;

create policy "team_members: própria linha ou equipe" on public.team_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_team_member());
create policy "team_members: admin altera" on public.team_members
  for update to authenticated using (public.team_role() = 'admin') with check (public.team_role() = 'admin');
create policy "team_members: admin remove" on public.team_members
  for delete to authenticated using (public.team_role() = 'admin');

-- Nunca deixar a equipe sem nenhum admin ativo.
create or replace function public.keep_one_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin' and old.status = 'ativo')
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.status = 'ativo'
         and (new.role <> 'admin' or new.status <> 'ativo')) then
    if not exists (select 1 from public.team_members
                   where role = 'admin' and status = 'ativo' and user_id <> old.user_id) then
      raise exception 'A equipe precisa de pelo menos um admin ativo.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists team_members_keep_admin on public.team_members;
create trigger team_members_keep_admin
  before update or delete on public.team_members
  for each row execute function public.keep_one_admin();

-- ---------------------------------------------------------------
-- 5. Histórico de ações (só o banco grava; ninguém edita ou apaga)
-- ---------------------------------------------------------------
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
drop policy if exists "activity_log: admin lê" on public.activity_log;
create policy "activity_log: admin lê" on public.activity_log
  for select to authenticated using (public.team_role() = 'admin');

-- Nome de quem está agindo (ou nulo quando não há usuário logado: link do cliente ou sistema).
create or replace function public.actor_name(actor uuid)
returns text language sql stable security definer set search_path = public
as $$ select coalesce(full_name, email) from public.team_members where user_id = actor $$;

-- 5a. Posts: criado, editado, reagendado, apagado, aprovado / ajustes / reprovado
create or replace function public.log_post_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  label text := public.actor_name(auth.uid());
  act text;
  info jsonb;
  post_id text;
begin
  if tg_op = 'INSERT' then
    act := 'post.criado';
    post_id := new.id::text;
    info := jsonb_build_object('titulo', new.title, 'data', new.scheduled_date, 'horario', new.time_string, 'formato', new.platform);
  elsif tg_op = 'DELETE' then
    act := 'post.apagado';
    post_id := old.id::text;
    info := jsonb_build_object('titulo', old.title, 'data', old.scheduled_date);
  else
    post_id := new.id::text;
    if new.approval_status is distinct from old.approval_status then
      act := case new.approval_status
               when 'approved' then 'post.aprovado'
               when 'changes_requested' then 'post.ajustes_solicitados'
               when 'rejected' then 'post.reprovado'
               else 'post.aprovacao_reiniciada' end;
      info := jsonb_build_object('titulo', new.title, 'de', old.approval_status, 'para', new.approval_status,
                                 'comentario', new.client_feedback);
      if actor is null then label := 'Cliente (link de aprovação)'; end if;
    elsif (new.scheduled_date, new.hour, new.time_string) is distinct from (old.scheduled_date, old.hour, old.time_string) then
      act := 'post.reagendado';
      info := jsonb_build_object('titulo', new.title,
                                 'de', concat_ws(' ', old.scheduled_date, old.time_string),
                                 'para', concat_ws(' ', new.scheduled_date, new.time_string));
    elsif (new.title, new.content, new.caption, new.image_url, new.platform, new.house_name, new.media_type)
          is distinct from (old.title, old.content, old.caption, old.image_url, old.platform, old.house_name, old.media_type) then
      act := 'post.editado';
      info := jsonb_build_object('titulo', new.title);
    else
      return null; -- ex.: só o contador de visualizações mudou
    end if;
  end if;

  insert into public.activity_log (actor_id, actor_label, action, entity_type, entity_id, details)
  values (actor, coalesce(label, case when actor is null then 'Sistema' else 'Usuário' end), act, 'post', post_id, info);
  return null;
end $$;

drop trigger if exists posts_activity_log on public.posts;
create trigger posts_activity_log
  after insert or update or delete on public.posts
  for each row execute function public.log_post_activity();

-- 5b. Equipe: cadastro, aprovação, bloqueio, troca de papel, remoção
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
    info := jsonb_build_object('pessoa', target_name, 'papel', new.role, 'de', old.status, 'para', new.status);
  elsif new.role is distinct from old.role then
    act := 'equipe.papel_alterado';
    info := jsonb_build_object('pessoa', target_name, 'de', old.role, 'para', new.role);
  else
    return null;
  end if;

  insert into public.activity_log (actor_id, actor_label, action, entity_type, entity_id, details)
  values (actor, coalesce(label, 'Sistema'), act, 'equipe', target::text, info);
  return null;
end $$;

drop trigger if exists team_members_activity_log on public.team_members;
create trigger team_members_activity_log
  after insert or update or delete on public.team_members
  for each row execute function public.log_team_activity();

-- ---------------------------------------------------------------
-- 6. posts: de "só o dono" para "a equipe ativa"
-- ---------------------------------------------------------------
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'posts' loop
    execute format('drop policy %I on public.posts', p.policyname);
  end loop;
end $$;

create policy "posts: equipe lê" on public.posts
  for select to authenticated using (public.is_team_member());
create policy "posts: editores criam" on public.posts
  for insert to authenticated with check (public.team_can_edit() and user_id = (select auth.uid()));
create policy "posts: editores alteram" on public.posts
  for update to authenticated using (public.team_can_edit()) with check (public.team_can_edit());
create policy "posts: editores apagam" on public.posts
  for delete to authenticated using (public.team_can_edit());

-- ---------------------------------------------------------------
-- 7. Métricas do Instagram: toda a equipe ativa lê (só o servidor grava)
-- ---------------------------------------------------------------
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('instagram_account_daily', 'instagram_media') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "instagram_account_daily: equipe lê" on public.instagram_account_daily
  for select to authenticated using (public.is_team_member());
create policy "instagram_media: equipe lê" on public.instagram_media
  for select to authenticated using (public.is_team_member());

-- ---------------------------------------------------------------
-- 8. Storage (bucket posts): só quem edita envia arquivos
-- ---------------------------------------------------------------
drop policy if exists "posts bucket: upload logado" on storage.objects;
drop policy if exists "posts bucket: equipe envia" on storage.objects;
create policy "posts bucket: equipe envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'posts' and public.team_can_edit());

commit;

-- Conferência (rode depois, separado):
-- select email, full_name, role, status from public.team_members;
-- select created_at, actor_label, action, details from public.activity_log order by created_at desc limit 20;
