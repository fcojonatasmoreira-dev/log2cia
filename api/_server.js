import { createClient } from "@supabase/supabase-js";
import { lerSessao } from "./auth/_session.js";

export function respostaErro(res, status, error) {
  return res.status(status).json({ error });
}

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function usuarioAutenticado(req, res) {
  const sessao = lerSessao(req);
  if (!sessao?.sub || !Number.isInteger(sessao.ver)) {
    respostaErro(res, 401, "Sessão inválida ou expirada.");
    return null;
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("policiais")
    .select("id, nome_completo, nome_guerra, matricula, posto_graduacao, numeral, role, unidade, status, primeiro_acesso, auth_version")
    .eq("id", sessao.sub)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    respostaErro(res, 401, "Usuário não encontrado.");
    return null;
  }

  if (data.auth_version !== sessao.ver) {
    respostaErro(res, 401, "Sessão revogada. Entre novamente.");
    return null;
  }

  const { auth_version, ...usuario } = data;
  return usuario;
}

export function normalizarRole(user) {
  return String(user?.role || "").trim().toLowerCase();
}

export function semSenha(policial) {
  if (!policial) return policial;
  const { senha, ...seguro } = policial;
  return seguro;
}
