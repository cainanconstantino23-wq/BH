import { NextResponse } from 'next/server';

export async function GET() {
  const appId = process.env.META_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta/callback`;
  const scope = 'ads_read,read_insights';

  const metaAuthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scope}&response_type=code`;

  return NextResponse.redirect(metaAuthUrl);
}