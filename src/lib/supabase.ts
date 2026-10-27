import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Limpeza rigorosa: remove barras finais e qualquer sufixo /rest/v1 acidental
const cleanUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(cleanUrl, supabaseAnonKey);