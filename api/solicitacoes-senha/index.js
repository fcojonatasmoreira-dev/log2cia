import { supabaseAdmin, usuarioAutenticado, normalizarRole, respostaErro } from "../_server.js";

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const matricula = String(req.body?.matricula || "").trim();
      const motivo = String(req.body?.motivo || "").trim();
      if (!matricula || !motivo) return respostaErro(res, 400, "Informe matrícula e motivo da solicitação.");
      if (motivo.length > 1000) return respostaErro(res, 400, "O motivo deve ter no máximo 1000 caracteres.");
      const db = supabaseAdmin();
      const { data: policial, error: buscaError } = await db
        .from("policiais").select("id, matricula, nome_guerra").eq("matricula", matricula).maybeSingle();
      if (buscaError) throw buscaError;
      if (!policial) return respostaErro(res, 404, "Militar não encontrado com esta matrícula.");
      const { error } = await db.from("solicitacoes_senha").insert({
        policial_id: policial.id,
        matricula: policial.matricula,
        nome_guerra: policial.nome_guerra,
        motivo,
        status: "pendente",
      });
      if (error) throw error;
      return res.status(201).json({ ok: true });
    }

    if (req.method === "GET") {
      const usuario = await usuarioAutenticado(req, res);
      if (!usuario) return;
      if (normalizarRole(usuario) !== "master") return respostaErro(res, 403, "Apenas o Master pode consultar as solicitações.");
      const db = supabaseAdmin();
      const { data, error } = await db.from("solicitacoes_senha").select("id, policial_id, matricula, nome_guerra, motivo, status, created_at")
        .eq("status", "pendente").order("created_at", { ascending: false });
      if (error) throw error;
      return res.status(200).json({ solicitacoes: data || [] });
    }
    return res.setHeader("Allow", "GET, POST").status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Erro nas solicitações de senha:", error.message);
    return respostaErro(res, 500, "Não foi possível concluir a operação.");
  }
}
