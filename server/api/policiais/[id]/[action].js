import { supabaseAdmin, usuarioAutenticado, respostaErro, normalizarRole } from "../../_server.js";
import { gerarSenhaTemporaria, hashSenha } from "../../auth/_password.js";
import { definirCredencialMaster } from "../../_credentialAudit.js";

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
    const acessoTotal = usuario.is_master === true || ["master", "p4", "armeiro", "oficial"].includes(role);
    if (!acessoTotal && String(usuario.id) !== id) {
      return respostaErro(res, 403, "Você não tem permissão para consultar as cautelas deste policial.");
    }

    const db = supabaseAdmin();
    const { data: cautelas, error } = await db.from("cautelas").select("id, status").eq("policial_id", id);
    if (error) throw error;
    const ativas = (cautelas || []).filter(c => ["ativa", "em_andamento"].includes(String(c.status || "").toLowerCase()));
    const resultado = await Promise.all(ativas.map(async cautela => {
      const { data: itens, error: itensError } = await db.from("cautela_itens").select("id, equipamentos(tipo, modelo_descricao, num_serie)").eq("cautela_id", cautela.id);
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
    const role = normalizarRole(usuario);
    const ehMaster = role === "master" || usuario.is_master === true;
    if (!ehMaster) return respostaErro(res, 403, "Somente o Master pode redefinir credenciais.");

    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Identificador do policial inválido.");
    const db = supabaseAdmin();
    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await hashSenha(senhaTemporaria);
    const atualizado = await definirCredencialMaster(db, {
      origem: "policiais", usuarioId: id, atorId: usuario.id,
      senhaHash, evento: "reset_admin",
    });
    if (!atualizado) return respostaErro(res, 409, "Os dados de autenticação foram alterados. Atualize e tente novamente.");
    return res.status(200).json({ ok: true, senhaTemporaria });
  } catch (error) {
    if (["42703", "PGRST202", "PGRST204", "42883"].includes(error?.code)) {
      return respostaErro(res, 503, "O reset de credenciais depende da migração manual pendente.");
    }
    console.error("Erro ao resetar senha:", error.message);
    return res.status(500).json({ error: "Não foi possível resetar a senha." });
  }
}
