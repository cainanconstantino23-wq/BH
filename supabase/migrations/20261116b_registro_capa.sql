-- Registro (auditoria) da Aprovação de capa e da Aprovação fotos: quem fez e quando, em cada foto.
-- As ações também vão para public.activity_log (entity_type = 'capa'), gravadas pelo servidor
-- com o nome de quem agiu; a aprovadora (link público) aparece como "Thereza (link de aprovação)".

alter table public.cover_collection_photos
  add column if not exists added_by text,            -- quem escolheu a foto no Drive (created_at = quando)
  add column if not exists favorited_by text,        -- quem marcou como capa (★)
  add column if not exists favorited_at timestamptz,
  add column if not exists favorited_by_approver boolean not null default false, -- a aprovadora pôs nas capas pelo link
  add column if not exists approved_by text,         -- quem aprovou a capa
  add column if not exists approved_at timestamptz;

alter table public.cover_collections
  add column if not exists link_created_by text,
  add column if not exists link_created_at timestamptz;

-- fotos já marcadas antes deste registro: usa a data em que entraram na pasta
update public.cover_collection_photos set favorited_at = created_at where is_favorite and favorited_at is null;
update public.cover_collection_photos p set approved_at = c.responded_at
  from public.cover_collections c
  where p.collection_id = c.id and p.approved and p.approved_at is null;
