import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getActiveMember } from '@/lib/team-server';
import { neighborhoodOptions } from '@/lib/house';

// Bairros para escolher ao salvar a pasta da casa: os padrões (Quadrado, Rio da Barra) + os já usados nas pastas.
// Bairro novo passa a aparecer aqui assim que uma pasta é salva com ele.
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { data } = await createAdminClient().from('cover_collections').select('neighborhood').not('neighborhood', 'is', null).limit(2000);
  return NextResponse.json({ neighborhoods: neighborhoodOptions((data ?? []).map((row) => row.neighborhood as string)) }, { headers: noStore });
}
