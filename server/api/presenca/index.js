import { respostaErro, supabaseAdmin, usuarioAutenticado } from "../_server.js";

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JANELA_ONLINE_MS = 120_000;

function ehMaster(usuario) {
  return String(usuario?.role || "").trim().toLowerCase() === "master" || usuario?.is_master === true;
}

function erroDeColunaOpcional(error) {
  return ["42703", "PGRST204"].includes(error?.code);
}

async function listar(db, res) {
  const [presencasResultado, policiaisComExtras] = await Promise.all([
    db.from("presenca_sessoes").select("policial_id,ultima_atividade").order("ultima_atividade", { ascending: false }),
    db.from("policiais").select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,role,unidade,is_master"),
  ]);
  if (presencasResultado.error) throw presencasResultado.error;

  let policiais = policiaisComExtras.data;
  if (policiaisComExtras.error) {
    if (!erroDeColunaOpcional(policiaisComExtras.error)) throw policiaisComExtras.error;
    const { data, error } = await db.from("policiais")
      .select("id,nome_completo,nome_guerra,matricula,numeral,posto_graduacao,role");
    if (error) throw error;
    policiais = data;
  }

  const atividadePorPolicial = new Map();
  for (const sessao of presencasResultado.data || []) {
    const atual = atividadePorPolicial.get(sessao.policial_id);
    if (!atual || Date.parse(sessao.ultima_atividade) > Date.parse(atual)) {
      atividadePorPolicial.set(sessao.policial_id, sessao.ultima_atividade);
    }
  }

  const agora = Date.now();
  const usuarios = (policiais || []).map((policial) => {
    const ultimaAtividade = atividadePorPolicial.get(policial.id) || null;
    const idade = ultimaAtividade ? agora - Date.parse(ultimaAtividade) : Number.POSITIVE_INFINITY;
    const online = idade >= 0 && idade <= JANELA_ONLINE_MS;
    return {
      id: policial.id,
      nome: policial.nome_guerra || policial.nome_completo || "Nome não informado",
      posto_graduacao: policial.posto_graduacao || "Não informado",
      numeral: policial.numeral || "—",
      matricula: policial.matricula || "",
      perfil: policial.is_master === true ? "master" : (policial.role || "policial"),
      unidade: policial.unidade || "",
      situacao: online ? "ONLINE" : "OFFLINE",
      ultima_atividade: ultimaAtividade,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return res.status(200).json({ usuarios, total_online: usuarios.filter((usuario) => usuario.situacao === "ONLINE").length });
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const db = supabaseAdmin();

    if (req.method === "POST") {
      const instanciaId = typeof req.body?.instancia_id === "string" ? req.body.instancia_id.trim() : "";
      if (!UUID_VALIDO.test(instanciaId)) return respostaErro(res, 400, "Identificador de sessão inválido.");
      const { data, error } = await db.rpc("presenca_registrar_v1", {
        p_policial_id: usuario.id,
        p_instancia_id: instanciaId,
      });
      if (error) throw error;
      return res.status(200).json({ ultima_atividade: data });
    }

    if (req.method === "GET") {
      if (!ehMaster(usuario)) return respostaErro(res, 403, "Somente o Master pode consultar presença geral.");
      return await listar(db, res);
    }

    res.setHeader("Allow", "GET, POST");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error?.code)) {
      return respostaErro(res, 503, "O monitoramento de presença depende da migration manual ainda não aplicada.");
    }
    if (["22P02", "22023"].includes(error?.code)) return respostaErro(res, 400, "Dados de presença inválidos.");
    console.error("Erro na API de presença:", error?.code || "erro interno");
    return respostaErro(res, 500, "Não foi possível consultar ou registrar presença.");
  }
}
