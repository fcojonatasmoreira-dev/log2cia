import { respostaErro, supabaseAdmin, usuarioAutenticado } from "../_server.js";

const TIPOS = Object.freeze({
  PERMUTA_RECEBIDA: { tipo: "Permuta recebida", descricao: "Você recebeu uma permuta para confirmar." },
  PERMUTA_AGUARDANDO_ANALISE: { tipo: "Permuta aguardando análise", descricao: "Uma permuta recebeu as confirmações e aguarda análise administrativa." },
  PERMUTA_DEFERIDA: { tipo: "Permuta deferida", descricao: "Uma permuta foi deferida." },
  PERMUTA_INDEFERIDA: { tipo: "Permuta indeferida", descricao: "Uma permuta foi indeferida." },
  PERMUTA_CANCELADA: { tipo: "Permuta cancelada", descricao: "Uma permuta deferida foi cancelada." },
});
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERFIS_PERMUTAS = new Set(["policial", "p1", "p1_escalante_servico_ordinario", "oficial", "master"]);

function podeAcessar(usuario) {
  return usuario?.is_master === true || PERFIS_PERMUTAS.has(String(usuario?.role || "").trim().toLowerCase());
}

function statusDoErro(error) {
  if (["22P02", "22023"].includes(error?.code)) return 400;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error?.code)) return 503;
  return 500;
}

function apresentar(notificacao) {
  const conteudo = TIPOS[notificacao.tipo];
  if (!conteudo) return null;
  return {
    id: notificacao.id,
    permuta_id: notificacao.permuta_id,
    tipo: conteudo.tipo,
    descricao: conteudo.descricao,
    criado_em: notificacao.criado_em,
    lida_em: notificacao.lida_em,
  };
}

async function listar(db, usuario, res) {
  const role = String(usuario.role || "").trim().toLowerCase();
  if (role === "oficial" || role === "master" || usuario.is_master === true) {
    const { error } = await db.rpc("permutas_notificacoes_reconciliar_v1", {
      p_destinatario_id: usuario.id,
    });
    if (error) throw error;
  }
  const [resultado, contagem] = await Promise.all([
    db.from("notificacoes_internas")
      .select("id,permuta_id,tipo,mensagem_disponivel,criado_em,lida_em")
      .eq("destinatario_id", usuario.id)
      .order("criado_em", { ascending: false })
      .limit(50),
    db.from("notificacoes_internas")
      .select("id", { count: "exact", head: true })
      .eq("destinatario_id", usuario.id)
      .is("lida_em", null),
  ]);
  if (resultado.error) throw resultado.error;
  if (contagem.error) throw contagem.error;
  const notificacoes = (resultado.data || []).map((item) => {
    const seguro = apresentar(item);
    if (seguro && item.mensagem_disponivel) seguro.descricao += " O Oficial deixou uma mensagem reservada para você.";
    return seguro;
  }).filter(Boolean);
  return res.status(200).json({ notificacoes, nao_lidas: contagem.count || 0 });
}

async function atualizarLeitura(db, usuario, req, res) {
  const acao = req.body?.acao;
  if (acao !== "marcar_lida" && acao !== "marcar_todas_lidas") {
    return respostaErro(res, 400, "Ação de notificação inválida.");
  }
  const id = req.body?.id;
  if (acao === "marcar_lida" && (typeof id !== "string" || !UUID_VALIDO.test(id))) {
    return respostaErro(res, 400, "Identificador de notificação inválido.");
  }
  let consulta = db.from("notificacoes_internas")
    .update({ lida_em: new Date().toISOString() })
    .eq("destinatario_id", usuario.id)
    .is("lida_em", null);
  if (acao === "marcar_lida") consulta = consulta.eq("id", id);
  const { data, error } = await consulta.select("id");
  if (error) throw error;
  return res.status(200).json({ atualizadas: (data || []).length });
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (!podeAcessar(usuario)) return respostaErro(res, 403, "Seu perfil não tem acesso à central de notificações.");
    const db = supabaseAdmin();
    if (req.method === "GET") return await listar(db, usuario, res);
    if (req.method === "PATCH") return await atualizarLeitura(db, usuario, req, res);
    res.setHeader("Allow", "GET, PATCH");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    const status = statusDoErro(error);
    if (status === 500) console.error("Erro na API de notificações:", error?.code || "erro interno");
    return respostaErro(res, status, status === 503
      ? "A migration manual da central ou da reconciliação de notificações ainda não foi aplicada."
      : status === 500 ? "Não foi possível carregar as notificações." : error?.message || "Dados de notificação inválidos.");
  }
}
