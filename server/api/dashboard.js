import { calcularDashboardMetrics } from "../../src/utils/dashboardMetrics.js";
import { normalizarRole, respostaErro, supabaseAdmin, usuarioAutenticado } from "./_server.js";

const ROLES_DASHBOARD = ["master", "p4", "armeiro", "oficial", "p1", "p1_escalante_servico_ordinario", "policial", "permanente da guarda", "user"];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.setHeader("Allow", "GET").status(405).json({ error: "Método não permitido." });
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (!ROLES_DASHBOARD.includes(normalizarRole(usuario)) && usuario.is_master !== true) return respostaErro(res, 403, "Sem permissão para consultar o painel.");
    const db = supabaseAdmin();
    const [cautelas, equipamentos, efetivo] = await Promise.all([
      db.from("cautelas").select("id, status, tipo_cautela, cautela_itens(equipamento_id)"),
      db.from("equipamentos").select("id, tipo, status, detalhes"),
      db.from("policiais").select("id", { count: "exact", head: true }).eq("status", "EM ATIVIDADE"),
    ]);
    if (cautelas.error) throw cautelas.error;
    if (equipamentos.error) throw equipamentos.error;
    if (efetivo.error) throw efetivo.error;
    return res.status(200).json({ metrics: calcularDashboardMetrics(cautelas.data || [], equipamentos.data || [], efetivo.count || 0) });
  } catch (error) {
    console.error("Erro na API do painel:", error.message);
    return respostaErro(res, 500, "Não foi possível carregar os dados do painel.");
  }
}
