import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { type DriveFolder, parseDriveFolders } from '@/lib/google/driveScope';

export interface ActiveMember {
  user: User;
  permissions: string[];
  /** Pastas do Drive que a pessoa pode ver; null = todo o Drive da equipe (src/lib/google/driveScope.ts). */
  driveFolders: DriveFolder[] | null;
  /** Nome para o histórico (nome completo ou e-mail). */
  label: string;
  can: (permission: string) => boolean;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/** Usuário logado e ATIVO na equipe, com as permissões; null se não logado, pendente ou bloqueado. */
export async function getActiveMember(): Promise<ActiveMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const read = (columns: string) => supabase.from('team_members').select(columns).eq('user_id', user.id).maybeSingle();
  let { data, error } = await read('status, permissions, full_name, email, drive_folders');
  // migração 20261126_drive_pastas_membro.sql ainda não rodada: lê sem a coluna (todos veem o Drive como antes)
  if (error?.code === '42703') ({ data, error } = await read('status, permissions, full_name, email'));
  const member = data as { status?: string; permissions?: string[]; full_name?: string | null; email?: string | null; drive_folders?: unknown } | null;

  if (!member || member.status !== 'ativo') return null;
  const permissions: string[] = member.permissions ?? [];
  const label = (member.full_name as string | null) || (member.email as string | null) || user.email || 'Usuário';
  return { user, permissions, driveFolders: parseDriveFolders(member.drive_folders), label, can: (permission) => permissions.includes(permission), supabase };
}

/** A conexão do Instagram da equipe (a mais recente com conta identificada). Usar com o cliente admin. */
export async function getTeamConnection(admin: SupabaseClient, columns: string) {
  const { data, error } = await admin
    .from('user_meta_config')
    .select(columns)
    .not('instagram_account_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as Record<string, unknown> | null, error };
}
