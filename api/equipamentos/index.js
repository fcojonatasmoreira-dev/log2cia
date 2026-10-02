import {
  respostaErro,
  supabaseAdmin,
  usuarioAutenticado,
  normalizarRole,
} from "../_server.js";

const ROLES_GESTAO = ["master", "p4"];
const TIPOS_EDITAVEIS = ["colete", "municao"];
const STATUS_VALIDOS = ["disponivel", "cautelado", "em_manutencao", "baixado"];

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    if (!ROLES_GESTAO.includes(normalizarRole(usuario))) {
      return respostaErro(res, 403, "Apenas Master e P4 podem editar ou excluir equipamentos.");
    }

    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Informe o ID do equipamento.");

    const db = supabaseAdmin();

    if (req.method === "PATCH") {
      const body = req.body || {};
      const { data: atual, error: erroBusca } = await db
        .from("equipamentos")
        .select("id, tipo, modelo_descricao, num_serie, patrimonio, status, detalhes")
        .eq("id", id)
        .maybeSingle();

      if (erroBusca) throw erroBusca;
      if (!atual) return respostaErro(res, 404, "Equipamento não encontrado.");
      if (!TIPOS_EDITAVEIS.includes(String(atual.tipo || "").toLowerCase())) {
        return respostaErro(res, 400, "Esta API permite editar apenas coletes e munições.");
      }

      const modelo = String(body.modelo_descricao ?? "").trim();
      if (!modelo) return respostaErro(res, 400, "A descrição do equipamento é obrigatória.");

      const status = String(body.status ?? atual.status ?? "disponivel").trim().toLowerCase();
      if (!STATUS_VALIDOS.includes(status)) {
        return respostaErro(res, 400, "Status inválido.");
      }

      const detalhesEnviados = body.detalhes;
      if (!detalhesEnviados || typeof detalhesEnviados !== "object" || Array.isArray(detalhesEnviados)) {
        return respostaErro(res, 400, "Os detalhes do equipamento são inválidos.");
      }

      // Preserva dados não editados (incluindo URLs das imagens) e atualiza os campos enviados.
      const detalhes = { ...(atual.detalhes || {}), ...detalhesEnviados };
      if (String(atual.tipo || "").toLowerCase() === "colete" && detalhes.localizacao_atual === "Baixa Definitiva" && !String(detalhes.obs_baixa_definitiva || "").trim()) {
        return respostaErro(res, 400, "Informe a observação da baixa definitiva.");
      }
      const atualizacao = {
        modelo_descricao: modelo,
        num_serie: String(body.num_serie ?? "").trim(),
        patrimonio: body.patrimonio ? String(body.patrimonio).trim() : null,
        status,
        detalhes,
      };

      const { data, error } = await db
        .from("equipamentos")
        .update(atualizacao)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return res.status(200).json({ equipamento: data });
    }

    if (req.method === "DELETE") {
      const { data: atual, error: erroBusca } = await db
        .from("equipamentos")
        .select("id, tipo, status, detalhes")
        .eq("id", id)
        .maybeSingle();

      if (erroBusca) throw erroBusca;
      if (!atual) return respostaErro(res, 404, "Equipamento não encontrado.");
      if (!TIPOS_EDITAVEIS.includes(String(atual.tipo || "").toLowerCase())) {
        return respostaErro(res, 400, "Esta API permite excluir apenas coletes e munições.");
      }

      const localizacao = String(atual.detalhes?.localizacao_atual || "").toLowerCase();
      if (String(atual.status || "").toLowerCase() === "cautelado" || localizacao.includes("cautelad")) {
        return respostaErro(res, 409, "Não é possível excluir um equipamento cautelado. Regularize a cautela primeiro.");
      }

      const { error } = await db.from("equipamentos").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ success: true, id });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    console.error("Erro na API de equipamentos:", error);
    return respostaErro(res, 500, error.message || "Erro interno ao processar equipamento.");
  }
}
