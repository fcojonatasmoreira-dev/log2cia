import { normalizarRole, respostaErro, supabaseAdmin, usuarioAutenticado } from "./_server.js";

const ROLES_INVENTARIO = ["master", "p4", "armeiro", "oficial"];

// Cautelas está temporariamente suspensa. A única leitura mantida é a lista
// mínima usada pelo Inventário para identificar equipamentos atualmente
// vinculados. Nenhuma rota deste handler pode alterar dados.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return respostaErro(res, 503, "As operações de Cautelas estão temporariamente suspensas.");
  }

  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (String(req.query?.uso || "") !== "ativas") {
      return respostaErro(res, 503, "Esta consulta de Cautelas está temporariamente suspensa.");
    }
    if (!ROLES_INVENTARIO.includes(normalizarRole(usuario)) && usuario.is_master !== true) {
      return respostaErro(res, 403, "Sem permissão para consultar vínculos do inventário.");
    }

    const { data, error } = await supabaseAdmin()
      .from("cautelas")
      .select("id, tipo_cautela, cautela_itens(equipamento_id)")
      .eq("status", "ativa");
    if (error) throw error;
    return res.status(200).json({ cautelas: data || [] });
  } catch (error) {
    console.error("Erro na leitura mínima de cautelas para o Inventário:", error.message);
    return respostaErro(res, 500, "Não foi possível consultar os vínculos do inventário.");
  }
}
