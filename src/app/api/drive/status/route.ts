import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { DriveNotConnectedError, getDriveAccessToken, getDriveConnection, getGoogleAppConfig } from '@/lib/google/drive';

const noStore = { 'Cache-Control': 'private, no-store' };

// Situação da conexão com o Google Drive da equipe.
export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const configured = Boolean(getGoogleAppConfig());
  const canConnect = member.can('conectar_instagram');
  try {
    const connection = await getDriveConnection();
    if (!connection) return NextResponse.json({ configured, connected: false, canConnect }, { headers: noStore });
    // confirma que o acesso ainda vale (renova o token se precisar)
    await getDriveAccessToken();
    return NextResponse.json({ configured, connected: true, email: connection.google_email, canConnect }, { headers: noStore });
  } catch (error) {
    if (error instanceof DriveNotConnectedError) {
      return NextResponse.json({ configured, connected: false, expired: true, canConnect }, { headers: noStore });
    }
    console.error('Falha ao verificar o Drive:', error);
    return NextResponse.json({ error: 'status_failed' }, { status: 500, headers: noStore });
  }
}

// Desconecta: revoga o acesso no Google e apaga os tokens.
export async function DELETE() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!member.can('conectar_instagram')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const connection = await getDriveConnection().catch(() => null);
  if (connection) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: connection.refresh_token }),
    }).catch(() => undefined);
  }
  const { error } = await createAdminClient().from('google_drive_connections').delete().not('user_id', 'is', null);
  if (error) return NextResponse.json({ error: 'delete_failed' }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
