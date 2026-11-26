import { respostaErro, supabaseAdmin, usuarioAutenticado } from "../_server.js";

const TIPOS = Object.freeze({
  PERMUTA_RECEBIDA: { tipo: "Permuta recebida", descricao: "Você recebeu uma permuta para confirmar." },
  PERMUTA_AGUARDANDO_ANALISE: { tipo: "Permuta aguardando análise", descricao: "Uma permuta recebeu as confirmações e aguarda análise administrativa." },
  PERMUTA_DEFERIDA: { tipo: "Permuta deferida", descricao: "Uma permuta foi deferida." },
  PERMUTA_INDEFERIDA: { tipo: "Permuta indeferida", descricao: "Uma permuta foi indeferida." },
  PERMUTA_CANCELADA: { tipo: "Permuta cancelada", descricao: "Uma solicitação de permuta foi cancelada." },
  PERMUTA_ESCALA_APLICADA: { tipo: "Serviço aplicado à escala", descricao: "O serviço desta permuta foi atualizado na escala." },
  PERMUTA_ESCALA_REABERTA: { tipo: "Atualização da escala reaberta", descricao: "A atualização deste serviço voltou a ficar pendente de conferência." },
  PERMUTA_ESCALA_REVISAO_CONCLUIDA: { tipo: "Revisão da escala concluída", descricao: "A revisão deste serviço foi concluída." },
  BANCO_HORAS_NOVA: { tipo: "Nova solicitação no Banco de Horas", descricao: "Há uma solicitação aguardando análise." },
  BANCO_HORAS_DEFERIDA: { tipo: "Solicitação deferida", descricao: "Sua solicitação do Banco de Horas foi deferida." },
  BANCO_HORAS_INDEFERIDA: { tipo: "Solicitação indeferida", descricao: "Sua solicitação do Banco de Horas foi indeferida." },
});
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERFIS_PERMUTAS = new Set(["policial", "p1", "p1_escalante_servico_ordinario", "oficial", "master"]);
const TIPOS_PESSOAIS_POLICIAL = [
  "PERMUTA_RECEBIDA",
  "BANCO_HORAS_DEFERIDA",
  "BANCO_HORAS_INDEFERIDA",
];
const TIPOS_ADMINISTRATIVOS = [
  "PERMUTA_AGUARDANDO_ANALISE",
  "PERMUTA_DEFERIDA",
  "PERMUTA_INDEFERIDA",
  "PERMUTA_CANCELADA",
  "PERMUTA_ESCALA_APLICADA",
  "PERMUTA_ESCALA_REABERTA",
  "PERMUTA_ESCALA_REVISAO_CONCLUIDA",
  "BANCO_HORAS_NOVA",
];
const TIPOS_DECISAO_PERMUTA = ["PERMUTA_DEFERIDA", "PERMUTA_INDEFERIDA", "PERMUTA_CANCELADA"];
const TIPOS_ESCALA_PERMUTA = ["PERMUTA_ESCALA_APLICADA", "PERMUTA_ESCALA_REABERTA", "PERMUTA_ESCALA_REVISAO_CONCLUIDA"];
const TIPOS_PERMUTA_PROPRIA = [...TIPOS_DECISAO_PERMUTA, ...TIPOS_ESCALA_PERMUTA];
const CAMPOS_NOTIFICACAO = "id,permuta_id,escala_id,banco_horas_solicitacao_id,tipo,mensagem_disponivel,criado_em,lida_em";
const TAMANHO_LOTE_NOTIFICACOES = 100;

function podeAcessar(usuario) {
  return usuario?.is_master === true || PERFIS_PERMUTAS.has(String(usuario?.role || "").trim().toLowerCase());
}

function statusDoErro(error) {
  if (["22P02", "22023"].includes(error?.code)) return 400;
  if (error?.code === "42P10") return 503;
  if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code)) return 503;
  return 500;
}

function mensagemDoErro(error, status) {
  if (error?.code === "42P10") return "A reconciliação das notificações não corresponde ao índice parcial do Controle de Escala. Aplique a migration corretiva antes de tentar novamente.";
  if (["42703", "PGRST204"].includes(error?.code)) return "A estrutura de notificações está incompatível com o código publicado. Confira as migrations de Banco de Horas e Controle de Escala.";
  if (["42P01", "PGRST205"].includes(error?.code)) return "A tabela necessária à central de notificações não foi encontrada. Confira as migrations aplicadas.";
  if (["42883", "PGRST202"].includes(error?.code)) return "A função de reconciliação de notificações não foi encontrada. Confira as migrations aplicadas.";
  if (status === 500) return "Não foi possível carregar as notificações.";
  return error?.message || "Dados de notificação inválidos.";
}

function apresentar(notificacao, usuario) {
  const conteudo = TIPOS[notificacao.tipo];
  if (!conteudo) return null;
  return {
    id: notificacao.id,
    permuta_id: notificacao.permuta_id,
    ...(notificacao.escala_id ? { escala_id: notificacao.escala_id } : {}),
    ...(notificacao.banco_horas_solicitacao_id ? { banco_horas_solicitacao_id: notificacao.banco_horas_solicitacao_id } : {}),
    tipo: conteudo.tipo,
    descricao: conteudo.descricao,
    criado_em: notificacao.criado_em,
    lida_em: notificacao.lida_em,
    ...((String(usuario?.role || "").trim().toLowerCase() === "master" || usuario?.is_master === true || ["p1", "p1_escalante_servico_ordinario"].includes(String(usuario?.role || "").trim().toLowerCase()))
      && ["PERMUTA_DEFERIDA", "PERMUTA_CANCELADA", "PERMUTA_ESCALA_APLICADA", "PERMUTA_ESCALA_REABERTA", "PERMUTA_ESCALA_REVISAO_CONCLUIDA"].includes(notificacao.tipo)
      ? { abrir_controle_escala: true } : {}),
  };
}

async function buscarPermutasParticipante(db, usuarioId) {
  const permutas = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await db.from("permutas_servico")
      .select("id,solicitante_id,destinatario_id")
      .or(`solicitante_id.eq.${usuarioId},destinatario_id.eq.${usuarioId}`)
      .range(inicio, inicio + 999);
    if (error) throw error;
    permutas.push(...(data || []));
    if (!data || data.length < 1000) return permutas;
  }
}

async function listar(db, usuario, res) {
  const role = String(usuario.role || "").trim().toLowerCase();
  const modoPolicial = usuario.modo_acesso === "policial";
  if (role === "oficial" || role === "master" || usuario.is_master === true) {
    const { error } = await db.rpc("permutas_notificacoes_reconciliar_v1", {
      p_destinatario_id: usuario.id,
    });
    if (error) throw error;
  }
  let notificacoesBase;
  let naoLidas;
  if (modoPolicial) {
    const permutasDoUsuario = await buscarPermutasParticipante(db, usuario.id);
    const idsPermutasProprias = [...new Set(permutasDoUsuario.map((item) => item.id))];
    const carregarGrupo = async (tipos, ids = null) => {
      const lotes = ids
        ? Array.from({ length: Math.ceil(ids.length / TAMANHO_LOTE_NOTIFICACOES) }, (_, indice) => ids.slice(indice * TAMANHO_LOTE_NOTIFICACOES, (indice + 1) * TAMANHO_LOTE_NOTIFICACOES))
        : [null];
      const linhasGrupo = [];
      let totalNaoLidas = 0;
      for (const lote of lotes) {
        const consulta = (selecao, options, unread = false) => {
          let builder = db.from("notificacoes_internas").select(selecao, options)
            .eq("destinatario_id", usuario.id).in("tipo", tipos);
          if (lote) builder = builder.in("permuta_id", lote);
          if (unread) builder = builder.is("lida_em", null);
          return builder;
        };
        const [linhas, contagem] = await Promise.all([
          consulta(CAMPOS_NOTIFICACAO).order("criado_em", { ascending: false }).limit(50),
          consulta("id", { count: "exact", head: true }, true),
        ]);
        if (linhas.error) throw linhas.error;
        if (contagem.error) throw contagem.error;
        linhasGrupo.push(...(linhas.data || []));
        totalNaoLidas += contagem.count || 0;
      }
      return { linhas: linhasGrupo, naoLidas: totalNaoLidas };
    };
    const [pessoais, decisoes] = await Promise.all([
      carregarGrupo(TIPOS_PESSOAIS_POLICIAL),
      idsPermutasProprias.length
        ? carregarGrupo(TIPOS_PERMUTA_PROPRIA, idsPermutasProprias)
        : Promise.resolve({ linhas: [], naoLidas: 0 }),
    ]);
    const permutaPorId = new Map(permutasDoUsuario.map((item) => [item.id, item]));
    const idsDecididas = [...new Set(decisoes.linhas
      .filter((item) => ["PERMUTA_DEFERIDA", "PERMUTA_INDEFERIDA"].includes(item.tipo))
      .map((item) => item.permuta_id).filter(Boolean))];
    let decisoesHistorico = [];
    if (idsDecididas.length) {
      const { data, error } = await db.from("permutas_servico_historico")
        .select("permuta_id,tipo_evento,mensagem_policial_1,mensagem_policial_2")
        .in("permuta_id", idsDecididas).in("tipo_evento", ["DEFERIDA", "INDEFERIDA"]);
      if (error) throw error;
      decisoesHistorico = data || [];
    }
    const mensagensPoliciais = new Map();
    for (const evento of decisoesHistorico) {
      const permuta = permutaPorId.get(evento.permuta_id);
      const mensagem = permuta?.solicitante_id === usuario.id
        ? evento.mensagem_policial_1
        : permuta?.destinatario_id === usuario.id ? evento.mensagem_policial_2 : null;
      if (mensagem?.trim()) mensagensPoliciais.set(`${evento.permuta_id}:${evento.tipo_evento}`, true);
    }
    notificacoesBase = [...pessoais.linhas, ...decisoes.linhas]
      .map((item) => {
        if (!["PERMUTA_DEFERIDA", "PERMUTA_INDEFERIDA"].includes(item.tipo)) return item;
        const evento = item.tipo === "PERMUTA_DEFERIDA" ? "DEFERIDA" : "INDEFERIDA";
        return { ...item, mensagem_disponivel: mensagensPoliciais.has(`${item.permuta_id}:${evento}`) };
      })
      .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
      .slice(0, 50);
    naoLidas = pessoais.naoLidas + decisoes.naoLidas;
  } else {
    const [resultado, contagem] = await Promise.all([
      db.from("notificacoes_internas")
        .select(CAMPOS_NOTIFICACAO)
        .eq("destinatario_id", usuario.id).in("tipo", TIPOS_ADMINISTRATIVOS)
        .order("criado_em", { ascending: false })
        .limit(50),
      db.from("notificacoes_internas")
        .select("id", { count: "exact", head: true })
        .eq("destinatario_id", usuario.id).in("tipo", TIPOS_ADMINISTRATIVOS)
        .is("lida_em", null),
    ]);
    if (resultado.error) throw resultado.error;
    if (contagem.error) throw contagem.error;
    notificacoesBase = resultado.data || [];
    naoLidas = contagem.count || 0;
  }
  const idsEscala = [...new Set(notificacoesBase.map((item) => item.escala_id).filter(Boolean))];
  const idsPermuta = [...new Set(notificacoesBase.filter((item) => ["PERMUTA_DEFERIDA", "PERMUTA_CANCELADA"].includes(item.tipo)).map((item) => item.permuta_id).filter(Boolean))];
  const [escalasDiretas, escalasPorPermuta, manifestacoes] = await Promise.all([
    idsEscala.length ? db.from("permutas_servico_escala").select("id,permuta_id,manifestacao_id,situacao").in("id", idsEscala) : Promise.resolve({ data: [], error: null }),
    idsPermuta.length ? db.from("permutas_servico_escala").select("id,permuta_id,manifestacao_id,situacao").in("permuta_id", idsPermuta) : Promise.resolve({ data: [], error: null }),
    idsPermuta.length ? db.from("permutas_servico_manifestacoes").select("permuta_id,data_servico,turno").in("permuta_id", idsPermuta) : Promise.resolve({ data: [], error: null }),
  ]);
  if (escalasDiretas.error) throw escalasDiretas.error;
  if (escalasPorPermuta.error) throw escalasPorPermuta.error;
  if (manifestacoes.error) throw manifestacoes.error;
  const dadosEscalas = [...(escalasDiretas.data || []), ...(escalasPorPermuta.data || [])];
  const manifestacaoPorEscala = new Map();
  if (dadosEscalas.length) {
    const idsManifestacao = [...new Set(dadosEscalas.map((item) => item.manifestacao_id))];
    const { data, error } = await db.from("permutas_servico_manifestacoes").select("id,data_servico,turno").in("id", idsManifestacao);
    if (error) throw error;
    for (const item of data || []) manifestacaoPorEscala.set(item.id, item);
  }
  const escalaPorId = new Map(dadosEscalas.map((item) => [item.id, item]));
  const manifestacoesPorPermuta = new Map();
  for (const item of manifestacoes.data || []) manifestacoesPorPermuta.set(item.permuta_id, [...(manifestacoesPorPermuta.get(item.permuta_id) || []), item]);
  const dataTurno = (item) => item ? `${String(item.data_servico).split("-").reverse().join("/")} · turno ${item.turno}` : "";
  const notificacoes = notificacoesBase.map((item) => {
    const seguro = apresentar(item, usuario);
    if (seguro && item.escala_id) {
      const escala = escalaPorId.get(item.escala_id);
      const servico = escala ? manifestacaoPorEscala.get(escala.manifestacao_id) : null;
      const especificacao = dataTurno(servico);
      if (especificacao) seguro.descricao += ` Serviço: ${especificacao}.`;
    } else if (seguro && ["PERMUTA_DEFERIDA", "PERMUTA_CANCELADA"].includes(item.tipo)) {
      const especificacoes = (manifestacoesPorPermuta.get(item.permuta_id) || []).map(dataTurno);
      if (especificacoes.length) seguro.descricao += ` Serviços: ${especificacoes.join("; ")}.`;
      if (item.tipo === "PERMUTA_CANCELADA" && dadosEscalas.some((escala) => escala.permuta_id === item.permuta_id && escala.situacao === "REVISAO_NECESSARIA")) {
        seguro.descricao += " Há serviço que requer revisão da escala.";
      }
    }
    if (seguro && item.tipo === "PERMUTA_DEFERIDA" && !modoPolicial) seguro.descricao += " Atualize a escala no Controle de Escala.";
    if (seguro && item.mensagem_disponivel) seguro.descricao += " O Oficial deixou uma mensagem reservada para você.";
    return seguro;
  }).filter(Boolean);
  return res.status(200).json({ notificacoes, nao_lidas: naoLidas });
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
  const modoPolicial = usuario.modo_acesso === "policial";
  const idsPermutasProprias = modoPolicial
    ? new Set((await buscarPermutasParticipante(db, usuario.id)).map((item) => item.id))
    : null;
  if (modoPolicial && acao === "marcar_lida") {
    const { data, error } = await db.from("notificacoes_internas")
      .select("id,tipo,permuta_id")
      .eq("destinatario_id", usuario.id).eq("id", id).maybeSingle();
    if (error) throw error;
    const pessoal = TIPOS_PESSOAIS_POLICIAL.includes(data?.tipo);
    const eventoProprio = TIPOS_PERMUTA_PROPRIA.includes(data?.tipo)
      && idsPermutasProprias.has(data?.permuta_id);
    if (!data || (!pessoal && !eventoProprio)) return res.status(200).json({ atualizadas: 0 });
  }

  if (modoPolicial && acao === "marcar_todas_lidas") {
    const atualizarGrupo = async (tipos, permutaIds = null) => {
      let consulta = db.from("notificacoes_internas")
        .update({ lida_em: new Date().toISOString() })
        .eq("destinatario_id", usuario.id).in("tipo", tipos).is("lida_em", null);
      if (permutaIds) consulta = consulta.in("permuta_id", permutaIds);
      const { data, error } = await consulta.select("id");
      if (error) throw error;
      return (data || []).length;
    };
    const [pessoais, decisoes] = await Promise.all([
      atualizarGrupo(TIPOS_PESSOAIS_POLICIAL),
      idsPermutasProprias.size
        ? atualizarGrupo(TIPOS_PERMUTA_PROPRIA, [...idsPermutasProprias])
        : Promise.resolve(0),
    ]);
    return res.status(200).json({ atualizadas: pessoais + decisoes });
  }

  let consulta = db.from("notificacoes_internas")
    .update({ lida_em: new Date().toISOString() })
    .eq("destinatario_id", usuario.id)
    .in("tipo", TIPOS_ADMINISTRATIVOS)
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
    if (status === 500 || error?.code === "42P10") console.error("Erro na API de notificações:", error?.code || "erro interno");
    return respostaErro(res, status, mensagemDoErro(error, status));
  }
}
