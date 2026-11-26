-- Respostas anteriores da aprovação de vídeos não somem mais.
-- Antes: voltar o vídeo para "Aguardando aprovação" (ou uma nova resposta na mesma versão)
-- apagava a resposta da Thereza da versão. Agora a resposta antiga vai para post_versions.history.
-- Rodar no SQL Editor do Supabase.

alter table public.post_versions
  add column if not exists history jsonb not null default '[]'::jsonb;

create or replace function public.sync_post_version_response()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  cur public.post_versions%rowtype;
  decided boolean := new.approval_status in ('approved', 'changes_requested', 'rejected');
begin
  if (new.approval_status, new.client_feedback) is not distinct from (old.approval_status, old.client_feedback) then
    return null;
  end if;
  select * into cur from public.post_versions v
   where v.post_id = new.id
     and v.version = (select max(version) from public.post_versions where post_id = new.id);
  if not found then return null; end if;

  -- só o comentário mudou, com a mesma decisão: atualiza sem arquivar
  if decided and new.approval_status = cur.decision then
    update public.post_versions set feedback = new.client_feedback where id = cur.id;
    return null;
  end if;

  update public.post_versions v
     set history = case when cur.decision is not null
                        then v.history || jsonb_build_array(jsonb_build_object(
                               'decision', cur.decision,
                               'feedback', cur.feedback,
                               'responded_at', cur.responded_at,
                               'responded_by_label', cur.responded_by_label,
                               'reopened_at', case when not decided then now() end,
                               'reopened_by', case when not decided then coalesce(public.actor_name(auth.uid()), 'Equipe') end))
                        else v.history end,
         decision = case when decided then new.approval_status end,
         feedback = case when decided then new.client_feedback end,
         responded_at = case when decided then now() end,
         responded_by_label = case when decided then coalesce(public.actor_name(auth.uid()), 'Aprovador pelo link') end
   where v.id = cur.id;
  return null;
end $$;

-- Devolve a resposta que sumiu em 26/11/2026 (Casa 09 · CASA 09 AS, post 128), vinda do Histórico.
update public.post_versions
   set history = history || jsonb_build_array(jsonb_build_object(
         'decision', 'changes_requested',
         'feedback', 'não quero postar esse reels ainda',
         'responded_at', '2026-11-26T13:34:10.598934+00:00',
         'responded_by_label', 'Aprovador pelo link',
         'reopened_at', '2026-11-26T21:12:16.374412+00:00',
         'reopened_by', 'Cainan Constantino'))
 where post_id = 128 and version = 1 and history = '[]'::jsonb;
