import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Log2CIA Warning: Variáveis de ambiente do Supabase não configuradas.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
