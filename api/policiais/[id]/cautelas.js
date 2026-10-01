import { supabaseAdmin, usuarioAutenticado, respostaErro, normalizarRole } from "../../_server.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.setHeader("Allow", "GET").status(405).json({ error: "Método não permitido." });
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Identificador do policial inválido.");
    const role = normalizarRole(usuario);
    const acessoTotal = ["master", "p4", "armeiro"].includes(role);
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
