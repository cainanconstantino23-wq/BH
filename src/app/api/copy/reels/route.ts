import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { NextResponse } from 'next/server';
import { getActiveMember } from '@/lib/team-server';

export const maxDuration = 30;

const noStore = { 'Cache-Control': 'private, no-store' };

// Gemini (plano gratuito). O modelo pode ser trocado pela variável GEMINI_MODEL sem mexer no código.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const FORMATS: Record<string, string> = { REEL: 'Reels', POST: 'post do feed', CARROSSEL: 'carrossel', STORY: 'Story' };

// Voz da Bahia Homes.
const SYSTEM = `Você escreve legendas de posts do Instagram (Reels, feed, carrossel e Story) para a Bahia Homes, imobiliária de alto padrão em Trancoso (Bahia).

Tom: "luxo descalço". Elegante, calmo e sensorial, nunca exagerado nem vendedor. Fale de luz, natureza, mar, Quadrado, madeira, piaçava, silêncio, convivência. Português do Brasil.

Formato da legenda:
- Primeira linha curta que prende a atenção (gancho), sem clichês como "imagine só" ou "sonho realizado".
- 2 a 4 frases curtas sobre a casa e a experiência de viver nela.
- Uma chamada para ação discreta (ex.: chamar no direct ou no link da bio).
- No fim, 5 a 8 hashtags relevantes (ex.: #trancoso #bahiahomes #casadepraia).
- No máximo 2 emojis, se fizerem sentido. Nada de texto em caixa alta.
- Até 900 caracteres no total.

Use só as informações fornecidas. Não invente metragem, número de suítes, preço ou endereço. Responda apenas com a legenda pronta, sem título, aspas nem comentários.`;

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Botão "Gerar legenda": escreve a legenda a partir da casa, do formato e das observações.
export async function POST(request: Request) {
  const member = await getActiveMember();
  if (!member) return NextResponse.json({ error: 'Entre na sua conta para gerar legendas.' }, { status: 401, headers: noStore });
  if (!member.can('criar_publicacoes')) {
    return NextResponse.json({ error: 'Você não tem permissão para criar publicações.' }, { status: 403, headers: noStore });
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY não configurada.');
    return NextResponse.json({ error: 'A geração de legendas ainda não está disponível. Avise quem administra o sistema.' }, { status: 503, headers: noStore });
  }

  const body: unknown = await request.json().catch(() => null);
  const input = (body ?? {}) as Record<string, unknown>;
  const houseName = clean(input.houseName, 120);
  const notes = clean(input.notes, 1500);
  const currentCaption = clean(input.currentCaption, 2200);
  const format = FORMATS[clean(input.format, 20).toUpperCase()] ?? 'Reels';
  if (!houseName && !notes) {
    return NextResponse.json({ error: 'Preencha o nome da casa ou escreva algumas observações para a legenda.' }, { status: 400, headers: noStore });
  }

  const brief = [
    houseName && `Casa: ${houseName}`,
    notes && `Observações da equipe: ${notes}`,
    currentCaption && `Rascunho atual (melhore ou reescreva): ${currentCaption}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Escreva a legenda deste ${format}.${format === 'Story' ? ' Para Story, seja bem curto: 1 ou 2 frases e no máximo 3 hashtags.' : ''}\n\n${brief}`,
      // legenda curta não precisa de raciocínio: responde em ~1 s
      config: { systemInstruction: SYSTEM, temperature: 0.9, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
    });

    const caption = (response.text ?? '').trim();
    if (!caption) {
      console.error('Gemini sem texto. Motivo:', response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason);
      return NextResponse.json({ error: 'Não foi possível gerar esta legenda. Ajuste o texto e tente de novo.' }, { status: 422, headers: noStore });
    }
    return NextResponse.json({ caption: caption.slice(0, 2200) }, { headers: noStore });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('Erro do Gemini ao gerar legenda:', error.status, error.message);
      if (error.status === 429) {
        return NextResponse.json({ error: 'Limite de legendas grátis atingido por agora. Tente de novo em alguns minutos.' }, { status: 429, headers: noStore });
      }
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        return NextResponse.json({ error: 'A geração de legendas está com problema de configuração. Avise quem administra o sistema.' }, { status: 503, headers: noStore });
      }
      return NextResponse.json({ error: 'O serviço de legendas falhou. Tente de novo em instantes.' }, { status: 502, headers: noStore });
    }
    console.error('Falha ao gerar legenda:', error);
    return NextResponse.json({ error: 'Não foi possível gerar a legenda.' }, { status: 500, headers: noStore });
  }
}
