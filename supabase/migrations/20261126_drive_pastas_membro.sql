-- Pastas do Drive por pessoa (26/11/2026).
-- team_members.drive_folders: null = vê todo o Drive da equipe (como antes);
-- [] = não vê nada do Drive; [{ "id": "...", "name": "..." }] = só essas pastas e o que está dentro delas.
-- Quem altera: a política "team_members: gestor altera" (permissão gerenciar_pessoas), igual às permissões.
-- A regra de "Compartilhados comigo" (src/lib/google/driveAccess.ts) continua valendo antes desta.

alter table public.team_members add column if not exists drive_folders jsonb;
grant update (drive_folders) on public.team_members to authenticated;

-- Histórico: registra também a mudança de pastas do Drive (equipe.drive_alterado).
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
  elsif new.drive_folders is distinct from old.drive_folders then
    act := 'equipe.drive_alterado';
    info := jsonb_build_object('pessoa', target_name, 'pastas', new.drive_folders);
  else
    return null;
  end if;

  insert into public.activity_log (actor_id, actor_label, action, entity_type, entity_id, details)
  values (actor, coalesce(label, 'Sistema'), act, 'equipe', target::text, info);
  return null;
end $$;
