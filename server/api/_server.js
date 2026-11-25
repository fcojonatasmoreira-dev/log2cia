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

export async function usuarioAutenticado(req, res, dependencias = {}) {
  const lerSessaoAtual = dependencias.lerSessao || lerSessao;
  const criarClienteAdmin = dependencias.supabaseAdmin || supabaseAdmin;
  const sessao = lerSessaoAtual(req);
  if (!sessao?.sub || !Number.isInteger(sessao.ver)) {
    respostaErro(res, 401, "Sessão inválida ou expirada.");
    return null;
  }

  const db = criarClienteAdmin();
  const { data, error } = await db
    .from("policiais")
    .select("*")
    .eq("id", sessao.sub)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    respostaErro(res, 401, "Usuário não encontrado.");
    return null;
  }

  if (data.conta_suspensa === true) {
    respostaErro(res, 401, "Conta suspensa. Entre em contato com a administração.");
    return null;
  }

  if (data.auth_version !== sessao.ver) {
    respostaErro(res, 401, "Sessão revogada. Entre novamente.");
    return null;
  }

  if (data.credencial_provisionada === false) {
    respostaErro(res, 403, "A credencial ainda precisa ser provisionada pelo Master.");
    return null;
  }

  if (data.primeiro_acesso === true) {
    res.status(403).json({
      error: "Altere a senha temporária antes de acessar este recurso.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    return null;
  }

  return {
    id: data.id,
    nome_completo: data.nome_completo,
    nome_guerra: data.nome_guerra,
    matricula: data.matricula,
    posto_graduacao: data.posto_graduacao,
    numeral: data.numeral,
    role: data.role,
    ...(typeof data.is_master === "boolean" ? { is_master: data.is_master } : {}),
    unidade: data.unidade,
    status: data.status,
    conta_suspensa: data.conta_suspensa === true,
    primeiro_acesso: data.primeiro_acesso,
    drso_escalante: data.drso_escalante,
  };
}

export function normalizarRole(user) {
  return String(user?.role || "").trim().toLowerCase();
}

export function semSenha(policial) {
  if (!policial) return policial;
  const { senha, ...seguro } = policial;
  return seguro;
}
