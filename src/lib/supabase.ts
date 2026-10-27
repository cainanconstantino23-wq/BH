import { createClient } from '@supabase/supabase-js';

// Credenciais diretas validadas para evitar falhas de ambiente local ou cache
const supabaseUrl = 'https://mzhnpjhwtxpcmvrmfewc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aG5wamh3dHhwY212cm1mZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzQwMTYsImV4cCI6MjEwODcxMDAxNn0.d6b41lvmxdoIwxBPOSdmKRm5V387Te1QrjuFTi5T34A';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);