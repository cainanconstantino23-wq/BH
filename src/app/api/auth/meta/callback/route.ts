import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Código de autorização não recebido' }, { status: 400 });
  }

  const appId = process.env.META_CLIENT_ID!;
  const appSecret = process.env.META_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta/callback`;

  try {
    // 1. Troca o código temporário pelo token de acesso de curta duração
    const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_secret=${appSecret}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) throw new Error(tokenData.error.message);

    const shortLivedToken = tokenData.access_token;

    // 2. Troca pelo token de longa duração (válido por 60 dias)
    const longLivedUrl = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = await longLivedRes.json();

    const longLivedToken = longLivedData.access_token;

    // Redireciona de volta para o Dashboard informando o sucesso
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard?meta=connected&token=${longLivedToken}`);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}