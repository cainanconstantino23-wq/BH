import { NextResponse } from 'next/server';

export async function GET() {
  const appId = process.env.META_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/auth/meta/callback`;

  if (!appId) {
    return NextResponse.json(
      { error: 'META_CLIENT_ID não está configurado no .env.local' },
      { status: 500 }
    );
  }

  // Escopos para ler métricas orgânicas do Instagram/Página + Ads
  const scopes = [
    'ads_read',
    'instagram_basic',
    'instagram_manage_insights',
    'pages_read_engagement',
    'business_management'
  ].join(',');

  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scopes}&response_type=code`;

  return NextResponse.redirect(authUrl);
}