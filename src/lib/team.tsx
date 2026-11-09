'use client';

import { createContext, useContext, type ReactNode } from 'react';

// Equipe da Bahia Homes: situação e permissões de quem está logado.
export type TeamStatus = 'pendente' | 'ativo' | 'bloqueado';
export type TeamPreset = 'admin' | 'social' | 'aprovador' | 'leitor' | 'personalizado';

export type Permission =
  | 'ver_estatisticas'
  | 'ver_publicacoes'
  | 'criar_publicacoes'
  | 'editar_publicacoes'
  | 'reagendar_publicacoes'
  | 'apagar_publicacoes'
  | 'aprovar_publicacoes'
  | 'enviar_link_aprovacao'
  | 'atualizar_metricas'
  | 'conectar_instagram'
  | 'publicar_instagram'
  | 'gerenciar_pessoas'
  | 'ver_historico';

export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string; hint?: string }[] }[] = [
  {
    title: 'Visualizar',
    items: [
      { key: 'ver_estatisticas', label: 'Ver estatísticas', hint: 'Painel, métricas e ranking do Instagram' },
      { key: 'ver_publicacoes', label: 'Ver publicações', hint: 'Grade do feed, calendário e central de aprovação' },
    ],
  },
  {
    title: 'Publicações',
    items: [
      { key: 'criar_publicacoes', label: 'Criar publicações e enviar mídia', hint: 'Fotos e vídeos' },
      { key: 'editar_publicacoes', label: 'Editar publicações', hint: 'Legenda, mídia e formato' },
      { key: 'reagendar_publicacoes', label: 'Reagendar e reorganizar', hint: 'Mudar data e horário, arrastar na grade' },
      { key: 'apagar_publicacoes', label: 'Apagar publicações' },
    ],
  },
  {
    title: 'Aprovação',
    items: [
      { key: 'aprovar_publicacoes', label: 'Aprovar ou reprovar publicações', hint: 'Dentro do SaaS, com comentário' },
      { key: 'enviar_link_aprovacao', label: 'Enviar link de aprovação', hint: 'Para clientes de fora, pelo WhatsApp' },
    ],
  },
  {
    title: 'Instagram',
    items: [
      { key: 'atualizar_metricas', label: 'Atualizar métricas', hint: 'Botão "Atualizar agora"' },
      { key: 'conectar_instagram', label: 'Conectar o Instagram da empresa' },
      { key: 'publicar_instagram', label: 'Publicar no Instagram', hint: 'Quando a publicação automática existir' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { key: 'gerenciar_pessoas', label: 'Aprovar e gerenciar pessoas', hint: 'Cadastros, permissões e bloqueios' },
      { key: 'ver_historico', label: 'Ver o histórico de ações' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export const PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.label])),
) as Record<Permission, string>;

export const PRESETS: Record<Exclude<TeamPreset, 'personalizado'>, { label: string; hint: string; permissions: Permission[] }> = {
  admin: { label: 'Admin', hint: 'Todas as permissões', permissions: ALL_PERMISSIONS },
  social: {
    label: 'Social media',
    hint: 'Produz, agenda e organiza o conteúdo',
    permissions: [
      'ver_estatisticas',
      'ver_publicacoes',
      'criar_publicacoes',
      'editar_publicacoes',
      'reagendar_publicacoes',
      'apagar_publicacoes',
      'enviar_link_aprovacao',
      'atualizar_metricas',
    ],
  },
  aprovador: {
    label: 'Dona / Aprovadora',
    hint: 'Vê tudo e aprova ou reprova, sem criar conteúdo',
    permissions: ['ver_estatisticas', 'ver_publicacoes', 'aprovar_publicacoes'],
  },
  leitor: { label: 'Leitor', hint: 'Só acompanha', permissions: ['ver_estatisticas', 'ver_publicacoes'] },
};

export const PRESET_LABELS: Record<TeamPreset, string> = {
  admin: PRESETS.admin.label,
  social: PRESETS.social.label,
  aprovador: PRESETS.aprovador.label,
  leitor: PRESETS.leitor.label,
  personalizado: 'Personalizado',
};

/** Modelo que corresponde exatamente às permissões (ou "personalizado"). */
export function presetFor(permissions: Permission[]): TeamPreset {
  const set = new Set(permissions);
  for (const [key, preset] of Object.entries(PRESETS) as [Exclude<TeamPreset, 'personalizado'>, (typeof PRESETS)['admin']][]) {
    if (preset.permissions.length === set.size && preset.permissions.every((permission) => set.has(permission))) return key;
  }
  return 'personalizado';
}

export interface TeamMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: TeamPreset;
  status: TeamStatus;
  permissions: Permission[];
  created_at: string;
  approved_at: string | null;
}

export interface TeamSession {
  userId: string;
  name: string;
  email: string;
  preset: TeamPreset;
  permissions: Permission[];
  can: (permission: Permission) => boolean;
}

const TeamContext = createContext<TeamSession | null>(null);

export function TeamProvider({ value, children }: { value: TeamSession; children: ReactNode }) {
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

/** Sessão da equipe. Fora do provedor, nada é permitido (mais seguro). */
export function useTeam(): TeamSession {
  return (
    useContext(TeamContext) ?? { userId: '', name: '', email: '', preset: 'leitor', permissions: [], can: () => false }
  );
}

export function toSession(member: Pick<TeamMember, 'user_id' | 'full_name' | 'email' | 'role' | 'permissions'>): TeamSession {
  const permissions = member.permissions ?? [];
  return {
    userId: member.user_id,
    name: member.full_name || member.email?.split('@')[0] || 'Usuário',
    email: member.email ?? '',
    preset: member.role,
    permissions,
    can: (permission) => permissions.includes(permission),
  };
}
