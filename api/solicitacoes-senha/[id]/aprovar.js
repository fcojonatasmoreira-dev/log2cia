import { supabaseAdmin, usuarioAutenticado, normalizarRole, respostaErro } from "../../_server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.setHeader("Allow", "POST").status(405).json({ error: "Método não permitido." });
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (normalizarRole(usuario) !== "master") return respostaErro(res, 403, "Apenas o Master pode aprovar redefinições de senha.");

    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Identificador da solicitação inválido.");

    const db = supabaseAdmin();
    const { data, error } = await db.rpc("aprovar_solicitacao_senha", { p_solicitacao_id: id });
    if (error) {
      if (error.code === "P0001" && error.message?.includes("ja_processada")) {
        return respostaErro(res, 409, "Esta solicitação já foi processada.");
      }
      if (error.code === "P0001" && error.message?.includes("policial_nao_encontrado")) {
        return respostaErro(res, 404, "Policial vinculado não encontrado.");
      }
      if (error.code === "P0001" && error.message?.includes("solicitacao_nao_encontrada")) {
        return respostaErro(res, 404, "Solicitação não encontrada.");
      }
      throw error;
    }
    if (data !== true) return respostaErro(res, 409, "Não foi possível confirmar a aprovação da solicitação.");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erro ao aprovar solicitação de senha:", error.message);
    return respostaErro(res, 500, "Não foi possível aprovar a solicitação.");
  }
}
