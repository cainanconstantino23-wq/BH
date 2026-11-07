-- Passo 1c: fecha o acesso anônimo ao banco.
-- Pré-requisito: a página /approval/[token] já usa /api/approval/[token] (chave de serviço), em produção desde 06/11/2026.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run. Roda numa transação: se algo falhar, nada é aplicado.

begin;

-- ---------------------------------------------------------------
-- 1. posts: dono, data de criação e token de aprovação seguro
-- ---------------------------------------------------------------
alter table public.posts
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid(),
  add column if not exists created_at timestamptz not null default now();

-- Posts existentes passam a pertencer ao único usuário atual (cainanconstantino23@gmail.com).
update public.posts set user_id = '4a77b87d-efe1-4127-9861-e9553e4f48ff' where user_id is null;
alter table public.posts alter column user_id set not null;

-- Token de aprovação aleatório (122 bits) gerado pelo banco quando o app não envia um.
alter table public.posts alter column approval_token set default replace(gen_random_uuid()::text, '-', '');
update public.posts
  set approval_token = replace(gen_random_uuid()::text, '-', '')
  where approval_token is null or approval_token = '';
create unique index if not exists posts_approval_token_key on public.posts (approval_token);

-- ---------------------------------------------------------------
-- 2. posts: remove as 10 políticas abertas e cria "só o dono"
-- ---------------------------------------------------------------
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'posts' loop
    execute format('drop policy %I on public.posts', p.policyname);
  end loop;
end $$;

alter table public.posts enable row level security;
revoke all on public.posts from anon;

create policy "posts: dono lê" on public.posts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "posts: dono cria" on public.posts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "posts: dono altera" on public.posts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "posts: dono apaga" on public.posts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- 3. user_meta_config: liga o RLS e bloqueia o navegador
--    (só o servidor, com a chave de serviço, lê e grava tokens do Meta/Instagram)
-- ---------------------------------------------------------------
drop policy if exists "Allow public read" on public.user_meta_config;
drop policy if exists "Usuário lê apenas sua própria configuração" on public.user_meta_config;
alter table public.user_meta_config enable row level security;
revoke all on public.user_meta_config from anon, authenticated;

-- ---------------------------------------------------------------
-- 4. Storage (bucket posts): leitura continua pública, upload só logado
-- ---------------------------------------------------------------
drop policy if exists "Permitir upload e leitura pública 1rma4z_1" on storage.objects;
drop policy if exists "Permitir upload publico no bucket posts" on storage.objects;

create policy "posts bucket: upload logado" on storage.objects
  for insert to authenticated with check (bucket_id = 'posts');
create policy "posts bucket: dono substitui" on storage.objects
  for update to authenticated
  using (bucket_id = 'posts' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'posts' and owner_id = (select auth.uid())::text);

commit;

-- Conferência (rode depois, separado): deve listar só as políticas novas.
-- select schemaname, tablename, policyname, cmd, roles
-- from pg_policies
-- where (schemaname = 'public' and tablename in ('posts', 'user_meta_config'))
--    or (schemaname = 'storage' and tablename = 'objects')
-- order by 1, 2, 4;
