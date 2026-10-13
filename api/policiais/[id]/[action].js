import { supabaseAdmin, usuarioAutenticado, respostaErro, normalizarRole } from "../../_server.js";

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  if (action === "cautelas") return consultarCautelas(req, res);
  if (action === "reset-senha") return resetarSenha(req, res);
  return respostaErro(res, 404, "Ação do policial não encontrada.");
}

async function consultarCautelas(req, res) {
  if (req.method !== "GET") return res.setHeader("Allow", "GET").status(405).json({ error: "Método não permitido." });
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Identificador do policial inválido.");
    const role = normalizarRole(usuario);
    const acessoTotal = ["master", "p4", "armeiro", "oficial"].includes(role);
    if (!acessoTotal && String(usuario.id) !== id) {
      return respostaErro(res, 403, "Você não tem permissão para consultar as cautelas deste policial.");
    }

    const db = supabaseAdmin();
    const { data: cautelas, error } = await db.from("cautelas").select("*").eq("policial_id", id);
    if (error) throw error;
    const ativas = (cautelas || []).filter(c => ["ativa", "em_andamento"].includes(String(c.status || "").toLowerCase()));
    const resultado = await Promise.all(ativas.map(async cautela => {
      const { data: itens, error: itensError } = await db.from("cautela_itens").select("*, equipamentos(*)").eq("cautela_id", cautela.id);
      if (itensError) throw itensError;
      return (itens || []).map(item => ({ ...cautela, equipamentos: item.equipamentos || null }));
    }));
    return res.status(200).json({ cautelas: resultado.flat() });
  } catch (error) {
    console.error("Erro ao consultar cautelas do policial:", error.message);
    return res.status(500).json({ error: "Não foi possível consultar as cautelas." });
  }
}

async function resetarSenha(req, res) {
  if (req.method !== "POST") return res.setHeader("Allow", "POST").status(405).json({ error: "Método não permitido." });
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (!["master", "p4"].includes(normalizarRole(usuario))) return respostaErro(res, 403, "Sem permissão para resetar senhas.");

    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Identificador do policial inválido.");
    const db = supabaseAdmin();
    const { data: alvo, error: alvoError } = await db.from("policiais").select("id, role, auth_version").eq("id", id).maybeSingle();
    if (alvoError) throw alvoError;
    if (!alvo) return respostaErro(res, 404, "Policial não encontrado.");
    if (normalizarRole(usuario) === "p4" && ["master", "p4"].includes(normalizarRole(alvo))) {
      return respostaErro(res, 403, "Usuários P4 não podem resetar senhas de perfis Master ou P4.");
    }

    const versaoAtual = Number.isInteger(alvo.auth_version) ? alvo.auth_version : 0;
    const { data: atualizado, error } = await db.from("policiais")
      .update({ senha: null, primeiro_acesso: true, auth_version: versaoAtual + 1 })
      .eq("id", id).eq("auth_version", versaoAtual).select("id").maybeSingle();
    if (error) throw error;
    if (!atualizado) return respostaErro(res, 409, "Os dados de autenticação foram alterados. Atualize e tente novamente.");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erro ao resetar senha:", error.message);
    return res.status(500).json({ error: "Não foi possível resetar a senha." });
  }
}
