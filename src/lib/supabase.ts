import { createClient } from '@supabase/supabase-js';

// Limpa qualquer barra ou sufixo duplicado no final do URL por segurança
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);