import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Procura a configuração mais recente
    const { data: config, error: dbError } = await supabase
      .from('user_meta_config')
      .select('access_token, instagram_account_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbError || !config?.access_token) {
      return NextResponse.json({ mediaStats: null, reason: 'no_token' });
    }

    let igAccountId = config.instagram_account_id;

    // 2. Se o ID não estiver guardado na tabela, tenta procurar na Graph API pelas Páginas do Facebook
    if (!igAccountId) {
      const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?fields=name,instagram_business_account&access_token=${config.access_token}`;
      const pagesRes = await fetch(pagesUrl, { cache: 'no-store' });
      const pagesData = await pagesRes.json();

      if (pagesData.data) {
        for (const page of pagesData.data) {
          if (page.instagram_business_account?.id) {
            igAccountId = page.instagram_business_account.id;

            // Guarda na tabela para as próximas chamadas
            await supabase
              .from('user_meta_config')
              .update({ instagram_account_id: igAccountId })
              .eq('access_token', config.access_token);
            break;
          }
        }
      }
    }

    if (!igAccountId) {
      return NextResponse.json({
        mediaStats: null,
        error: 'Nenhuma conta do Instagram Business foi encontrada associada à Página do Facebook.'
      });
    }

    // 3. Consulta os últimos 15 posts com métricas de interação e alcance
    const fields = 'id,caption,like_count,comments_count,shares,reach,impressions,media_type,timestamp,permalink';
    const mediaUrl = `https://graph.facebook.com/v20.0/${igAccountId}/media?fields=${fields}&limit=15&access_token=${config.access_token}`;

    const mediaRes = await fetch(mediaUrl, { cache: 'no-store' });
    const mediaData = await mediaRes.json();

    if (mediaData.error) {
      return NextResponse.json({ mediaStats: null, error: mediaData.error.message });
    }

    const posts = mediaData.data || [];

    // 4. Calcula os totais acumulados dos posts
    const totals = posts.reduce(
      (acc: any, item: any) => {
        acc.totalLikes += item.like_count || 0;
        acc.totalComments += item.comments_count || 0;
        acc.totalShares += item.shares || 0;
        acc.totalReach += item.reach || 0;
        return acc;
      },
      { totalLikes: 0, totalComments: 0, totalShares: 0, totalReach: 0 }
    );

    return NextResponse.json({
      totals,
      postsCount: posts.length,
      posts,
    });
  } catch (err: any) {
    return NextResponse.json({ mediaStats: null, error: err.message }, { status: 500 });
  }
}