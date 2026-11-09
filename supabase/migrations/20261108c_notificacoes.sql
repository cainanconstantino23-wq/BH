-- Notificações: até onde cada pessoa já leu + atualização em tempo real.
-- Requer 20261108_equipe_bahia_homes.sql e 20261108b_permissoes.sql. Pode ser rodado mais de uma vez.
-- Rodar no Supabase: SQL Editor > New query > colar tudo > Run.

begin;

-- Até quando cada pessoa já viu as notificações (cada um só lê e grava a própria linha).
create table if not exists public.notification_reads (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon;
grant select, insert, update on public.notification_reads to authenticated;

drop policy if exists "notification_reads: própria linha" on public.notification_reads;
create policy "notification_reads: própria linha" on public.notification_reads
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Tempo real: novas ações (sininho e histórico) e mudanças na equipe (aviso de cadastros).
do $$
declare t text;
begin
  foreach t in array array['activity_log', 'team_members', 'posts'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
