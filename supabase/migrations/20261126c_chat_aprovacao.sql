-- Chat da Aprovação vídeos: mensagens entre a equipe e a Thereza em cada vídeo.
-- A equipe escreve pelo painel (aparece na hora no link de aprovação) e pode apagar as próprias mensagens.
-- A Thereza escreve pelo link (rota do servidor com chave de serviço).
-- Mudar o status pelo painel não grava mais o texto como "comentário da Thereza".
-- Rodar no SQL Editor do Supabase (depois da 20261126b_historico_respostas.sql).

create table if not exists public.post_messages (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  version integer,
  author_kind text not null check (author_kind in ('equipe', 'aprovadora')),
  author_id uuid references auth.users (id) on delete set null,
  author_label text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_messages_post_idx on public.post_messages (post_id, created_at);

alter table public.post_messages enable row level security;
revoke all on public.post_messages from anon, authenticated;
grant select, insert, delete on public.post_messages to authenticated;

drop policy if exists "post_messages: quem vê publicações lê" on public.post_messages;
create policy "post_messages: quem vê publicações lê" on public.post_messages
  for select to authenticated using (public.has_permission('ver_publicacoes'));

drop policy if exists "post_messages: equipe escreve" on public.post_messages;
create policy "post_messages: equipe escreve" on public.post_messages
  for insert to authenticated
  with check (author_kind = 'equipe' and author_id = auth.uid()
              and (public.has_permission('aprovar_publicacoes') or public.has_permission('enviar_link_aprovacao')
                   or public.has_permission('editar_publicacoes')));

drop policy if exists "post_messages: apaga a própria" on public.post_messages;
create policy "post_messages: apaga a própria" on public.post_messages
  for delete to authenticated using (author_kind = 'equipe' and author_id = auth.uid());

-- Nome de quem escreveu (equipe) vem do cadastro, não do navegador.
create or replace function public.fill_post_message_author()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.author_kind = 'equipe' and auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_label := coalesce(public.actor_name(auth.uid()), 'Equipe');
  end if;
  new.body := btrim(new.body);
  return new;
end $$;

drop trigger if exists post_messages_author on public.post_messages;
create trigger post_messages_author
  before insert on public.post_messages
  for each row execute function public.fill_post_message_author();

-- Mensagem da Thereza vira notificação no sininho.
create or replace function public.log_post_message()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.author_kind = 'aprovadora' then
    insert into public.activity_log (actor_id, actor_label, action, entity_type, entity_id, details)
    select null, 'Cliente (link de aprovação)', 'post.mensagem', 'post', new.post_id::text,
           jsonb_build_object('titulo', p.title, 'comentario', new.body)
      from public.posts p where p.id = new.post_id;
  end if;
  return null;
end $$;

drop trigger if exists post_messages_log on public.post_messages;
create trigger post_messages_log
  after insert on public.post_messages
  for each row execute function public.log_post_message();

-- Casa 09 (post 128): o texto das 18:23 foi escrito pelo Cainan para a Thereza, não é pedido de ajustes dela.
-- Vira mensagem do chat e sai do campo de comentário da aprovação.
insert into public.post_messages (post_id, version, author_kind, author_id, author_label, body, created_at)
select 128, 1, 'equipe', p.user_id, 'Cainan Constantino', 'Olá Thereza, então o video está aprovado?', '2026-11-26T21:23:00+00:00'
  from public.posts p
 where p.id = 128
   and not exists (select 1 from public.post_messages m where m.post_id = 128 and m.body = 'Olá Thereza, então o video está aprovado?');
update public.posts set client_feedback = null where id = 128 and client_feedback = 'Olá Thereza, então o video está aprovado?';
update public.post_versions set feedback = null where post_id = 128 and version = 1 and feedback = 'Olá Thereza, então o video está aprovado?';

-- Painel atualiza a conversa sozinho quando a Thereza escreve (Realtime).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_messages') then
    alter publication supabase_realtime add table public.post_messages;
  end if;
end $$;
