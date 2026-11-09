import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export interface ActiveMember {
  user: User;
  permissions: string[];
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

  const { data: member } = await supabase
    .from('team_members')
    .select('status, permissions')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member || member.status !== 'ativo') return null;
  const permissions: string[] = member.permissions ?? [];
  return { user, permissions, can: (permission) => permissions.includes(permission), supabase };
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
