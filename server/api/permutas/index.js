import { respostaErro, supabaseAdmin, usuarioAutenticado } from "../_server.js";
import { permissoesPermuta, validarServicoInformado } from "./rules.js";
import { ehPostoOficial } from "../../../src/utils/hierarquiaPolicial.js";

const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE_MOTIVO_PERMUTA = 500;
const TAMANHO_PAGINA = 1000;
const TAMANHO_LOTE_IDS = 100;
const TAMANHO_LOTE_MINI_CALENDARIO = 25;
const texto = (valor) => typeof valor === "string" ? valor.trim() : "";

function dataIsoValida(valor) {
  if (!DATA_VALIDA.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function statusDoErro(error) {
  if (error?.code === "P0002") return 404;
  if (["22023", "22P02", "23503"].includes(error?.code)) return 400;
  if (["23505", "40001", "42501"].includes(error?.code)) return error.code === "42501" ? 403 : 409;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error?.code)) return 503;
  return 500;
}

function mensagemDoErro(error) {
  if (statusDoErro(error) === 503) return "O módulo de Permutas depende da migration manual ainda não aplicada.";
  if (statusDoErro(error) === 500) return "Não foi possível concluir a operação de permuta.";
  return error?.message || "Não foi possível concluir a operação de permuta.";
}

function sanitizarEventoHistorico(evento, permuta, usuario, permissoes, policialPorId) {
  const seguro = { ...evento, ator: policialPorId.get(evento.ator_id) || null };
  const ehDecisao = ["DEFERIDA", "INDEFERIDA"].includes(evento.tipo_evento);
  if (!ehDecisao) {
    delete seguro.mensagem_escalante;
    delete seguro.mensagem_policial_1;
    delete seguro.mensagem_policial_2;
  } else {
    if (!permissoes.consultar_geral) delete seguro.mensagem_escalante;
    if (!permissoes.decidir && usuario.id !== permuta.solicitante_id) delete seguro.mensagem_policial_1;
    if (!permissoes.decidir && usuario.id !== permuta.destinatario_id) delete seguro.mensagem_policial_2;
  }
  // A justificativa única dos registros antigos é administrativa e não pode
  // ser reinterpretada nem apresentada como uma das mensagens privadas novas.
  if (!permissoes.decidir) delete seguro.justificativa;
  return seguro;
}

async function buscarTodasPaginas(criarConsulta) {
  const registros = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await criarConsulta(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    const pagina = data || [];
    registros.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) return registros;
  }
}

async function buscarRelacionadosPaginados(db, tabela, idsPermutas, colunaOrdem) {
  const registros = [];
  for (let inicio = 0; inicio < idsPermutas.length; inicio += TAMANHO_LOTE_IDS) {
    const lote = idsPermutas.slice(inicio, inicio + TAMANHO_LOTE_IDS);
    const pagina = await buscarTodasPaginas((inicioPagina, fimPagina) =>
      db.from(tabela).select("*").in("permuta_id", lote)
        .order(colunaOrdem).range(inicioPagina, fimPagina));
    registros.push(...pagina);
  }
  return registros;
}

async function buscarPorIdsPaginados(db, tabela, colunaId, ids, selecao = "*") {
  const registros = [];
  for (let inicio = 0; inicio < ids.length; inicio += TAMANHO_LOTE_IDS) {
    const lote = ids.slice(inicio, inicio + TAMANHO_LOTE_IDS);
    registros.push(...await buscarTodasPaginas((de, ate) => db.from(tabela).select(selecao).in(colunaId, lote).range(de, ate)));
  }
  return registros;
}

async function buscarDecisoesPermutaPaginadas(db, idsPermutas) {
  const registros = [];
  for (let inicio = 0; inicio < idsPermutas.length; inicio += TAMANHO_LOTE_IDS) {
    const lote = idsPermutas.slice(inicio, inicio + TAMANHO_LOTE_IDS);
    registros.push(...await buscarTodasPaginas((de, ate) => db.from("permutas_servico_historico")
      .select("id,permuta_id,ator_id,tipo_evento,estado_novo,ocorrido_em,mensagem_escalante,mensagem_policial_1,mensagem_policial_2")
      .in("permuta_id", lote).in("tipo_evento", ["DEFERIDA", "INDEFERIDA"])
      .order("ocorrido_em").order("id").range(de, ate)));
  }
  return registros;
}

async function buscarPoliciaisRelacionados(db, idsPoliciais) {
  const registros = [];
  for (let inicio = 0; inicio < idsPoliciais.length; inicio += TAMANHO_LOTE_IDS) {
    const lote = idsPoliciais.slice(inicio, inicio + TAMANHO_LOTE_IDS);
    const { data, error } = await db.from("policiais")
      .select("id,nome_completo,nome_guerra,posto_graduacao,numeral").in("id", lote);
    if (error) throw error;
    registros.push(...(data || []));
  }
  return registros;
}

async function listarCalendariosMini(db, usuario, res, query = {}) {
  const permissoes = permissoesPermuta(usuario);
  const textoIds = texto(query.policiais_ids);
  let idsPoliciais = textoIds ? [...new Set(textoIds.split(",").map((id) => id.trim()))] : [];
  if (idsPoliciais.some((id) => !UUID_VALIDO.test(id))) return respostaErro(res, 400, "Lista de policiais inválida para os mini calendários.");
  if (!permissoes.consultar_geral) {
    if (idsPoliciais.some((id) => id !== usuario.id)) return respostaErro(res, 403, "Você só pode consultar seu próprio calendário.");
    idsPoliciais = [usuario.id];
  } else if (!idsPoliciais.length) {
    return respostaErro(res, 400, "Informe os policiais dos mini calendários.");
  }
  if (idsPoliciais.length > TAMANHO_LOTE_MINI_CALENDARIO) return respostaErro(res, 400, "Consulte até 25 policiais por lote de mini calendário.");

  const dataInicio = texto(query.data_inicio);
  const dataFim = texto(query.data_fim);
  if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim) || dataInicio > dataFim) return respostaErro(res, 400, "Período inválido para os mini calendários.");
  const intervaloDias = (Date.parse(`${dataFim}T00:00:00Z`) - Date.parse(`${dataInicio}T00:00:00Z`)) / 86400000;
  if (intervaloDias > 44) return respostaErro(res, 400, "O período do mini calendário não pode exceder 45 dias.");

  const filtroIds = idsPoliciais.join(",");
  const manifestacoesNoPeriodo = await buscarTodasPaginas((inicio, fim) =>
    db.from("permutas_servico_manifestacoes").select("permuta_id")
      .gte("data_servico", dataInicio).lte("data_servico", dataFim)
      .or(`policial_id.in.(${filtroIds}),substituto_id.in.(${filtroIds})`)
      .range(inicio, fim));
  const idsPermutas = [...new Set(manifestacoesNoPeriodo.map((item) => item.permuta_id))];
  if (!idsPermutas.length) {
    return res.status(200).json({ calendarios: idsPoliciais.map((policial_id) => ({ policial_id, permutas: [] })) });
  }

  const permutas = [];
  for (let inicio = 0; inicio < idsPermutas.length; inicio += TAMANHO_LOTE_IDS) {
    const lote = idsPermutas.slice(inicio, inicio + TAMANHO_LOTE_IDS);
    const { data, error } = await db.from("permutas_servico")
      .select("id,tipo,status,motivo,solicitante_id,destinatario_id").in("id", lote);
    if (error) throw error;
    permutas.push(...(data || []));
  }
  const ids = permutas.map((permuta) => permuta.id);
  const manifestacoes = await buscarRelacionadosPaginados(db, "permutas_servico_manifestacoes", ids, "criada_em");
  const manifestacoesNoCalendario = manifestacoes.filter((item) =>
    item.data_servico >= dataInicio && item.data_servico <= dataFim);
  const idsParticipantes = [...new Set(permutas.flatMap((item) => [item.solicitante_id, item.destinatario_id]))];
  const policiais = await buscarPoliciaisRelacionados(db, idsParticipantes);
  const policialPorId = new Map(policiais.map((item) => [item.id, item]));
  const manifestacoesPorPermuta = new Map();
  for (const item of manifestacoesNoCalendario) {
    manifestacoesPorPermuta.set(item.permuta_id, [...(manifestacoesPorPermuta.get(item.permuta_id) || []), {
      id: item.id,
      permuta_id: item.permuta_id,
      policial_id: item.policial_id,
      substituto_id: item.substituto_id,
      data_servico: item.data_servico,
      turno: item.turno,
      horario_inicio: item.horario_inicio,
      horario_fim: item.horario_fim,
    }]);
  }
  const permutasDoCalendario = permutas.map((item) => ({
    ...item,
    solicitante: policialPorId.get(item.solicitante_id) || null,
    destinatario: policialPorId.get(item.destinatario_id) || null,
    manifestacoes: manifestacoesPorPermuta.get(item.id) || [],
  }));
  const calendarios = idsPoliciais.map((policial_id) => ({
    policial_id,
    permutas: permutasDoCalendario.filter((permuta) =>
      permuta.manifestacoes.some((item) => item.policial_id === policial_id || item.substituto_id === policial_id)),
  }));
  return res.status(200).json({ calendarios });
}

async function listarControleEscala(db, usuario, res, query = {}) {
  const permissoes = permissoesPermuta(usuario);
  if (!permissoes.consultar_geral) return respostaErro(res, 403, "Seu perfil não pode consultar o Controle de Escala.");
  const inicio = texto(query.data_inicio);
  const fim = texto(query.data_fim);
  const data = texto(query.data);
  const situacao = texto(query.situacao);
  const tipo = texto(query.tipo);
  const policialId = texto(query.policial_id);
  const turno = texto(query.turno);
  const permutaId = texto(query.permuta_id);
  if (Boolean(inicio) !== Boolean(fim) || (data && (inicio || fim))) return respostaErro(res, 400, "Informe uma data ou um intervalo completo.");
  const dataInicio = data || inicio;
  const dataFim = data || fim;
  if (dataInicio && (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim) || dataInicio > dataFim
    || (Date.parse(`${dataFim}T00:00:00Z`) - Date.parse(`${dataInicio}T00:00:00Z`)) / 86400000 > 44)) {
    return respostaErro(res, 400, "Período inválido. O intervalo máximo é de 45 dias.");
  }
  if (situacao && !["PENDENTE_NA_ESCALA", "APLICADA_NA_ESCALA", "REVISAO_NECESSARIA"].includes(situacao)) return respostaErro(res, 400, "Situação operacional inválida.");
  if (tipo && !["SUBSTITUICAO_SIMPLES", "TROCA_RECIPROCA"].includes(tipo)) return respostaErro(res, 400, "Tipo de permuta inválido.");
  if (policialId && !UUID_VALIDO.test(policialId)) return respostaErro(res, 400, "Filtro de policial inválido.");
  if (permutaId && !UUID_VALIDO.test(permutaId)) return respostaErro(res, 400, "Identificador da permuta inválido.");
  const escalas = await buscarTodasPaginas((de, ate) => {
    let consulta = db.from("permutas_servico_escala").select("*").order("atualizada_em", { ascending: false }).order("id").range(de, ate);
    if (situacao) consulta = consulta.eq("situacao", situacao);
    return consulta;
  });
  const escalaIds = escalas.map((item) => item.id);
  if (!escalaIds.length) return res.status(200).json({ servicos: [], indicadores: { pendentes: 0, aplicados: 0, revisao: 0, total: 0 } });
  const [manifestacoes, historicoResult] = await Promise.all([
    buscarPorIdsPaginados(db, "permutas_servico_manifestacoes", "id", escalas.map((item) => item.manifestacao_id)),
    buscarPorIdsPaginados(db, "permutas_servico_escala_historico", "escala_id", escalaIds),
  ]);
  const permutaIds = [...new Set((escalas || []).map((item) => item.permuta_id))];
  const [permutasData, confirmacoes, decisoes] = await Promise.all([
    buscarPorIdsPaginados(db, "permutas_servico", "id", permutaIds, "id,tipo,status,solicitante_id,destinatario_id"),
    buscarPorIdsPaginados(db, "permutas_servico_confirmacoes", "permuta_id", permutaIds, "permuta_id,policial_id,confirmada_em"),
    buscarDecisoesPermutaPaginadas(db, permutaIds),
  ]);
  const manifestacaoPorId = new Map(manifestacoes.map((item) => [item.id, item]));
  const permutaPorId = new Map(permutasData.map((item) => [item.id, item]));
  const confirmacoesPorPermuta = new Map();
  for (const item of confirmacoes) confirmacoesPorPermuta.set(item.permuta_id, [...(confirmacoesPorPermuta.get(item.permuta_id) || []), item]);
  const decisoesPorPermuta = new Map();
  for (const item of decisoes) decisoesPorPermuta.set(item.permuta_id, [...(decisoesPorPermuta.get(item.permuta_id) || []), item]);
  const policiais = await buscarPoliciaisRelacionados(db, [...new Set([
    ...(manifestacoes || []).flatMap((item) => [item.policial_id, item.substituto_id]),
    ...escalas.map((item) => item.responsavel_id),
    ...historicoResult.map((item) => item.ator_id),
    ...decisoes.map((item) => item.ator_id),
  ].filter(Boolean))]);
  const policialPorId = new Map(policiais.map((item) => [item.id, item]));
  const historicoPorEscala = new Map();
  for (const item of historicoResult) historicoPorEscala.set(item.escala_id, [...(historicoPorEscala.get(item.escala_id) || []), { ...item, ator: policialPorId.get(item.ator_id) || null }]);
  let servicos = escalas.flatMap((item) => {
    const manifestacao = manifestacaoPorId.get(item.manifestacao_id);
    const permuta = permutaPorId.get(item.permuta_id);
    if (!manifestacao || !permuta) return [];
    return [{ ...item, manifestacao,
      policial: policialPorId.get(manifestacao.policial_id) || null,
      substituto: policialPorId.get(manifestacao.substituto_id) || null,
      responsavel: policialPorId.get(item.responsavel_id) || null,
      historico: historicoPorEscala.get(item.id) || [],
      permuta: {
        ...permuta,
        solicitante: policialPorId.get(permuta.solicitante_id) || null,
        destinatario: policialPorId.get(permuta.destinatario_id) || null,
        confirmacoes: confirmacoesPorPermuta.get(permuta.id) || [],
        historico_decisao: (decisoesPorPermuta.get(permuta.id) || []).map((evento) => ({
          id: evento.id,
          tipo_evento: evento.tipo_evento,
          estado_novo: evento.estado_novo,
          ocorrido_em: evento.ocorrido_em,
          ator: policialPorId.get(evento.ator_id) || null,
          mensagem_escalante: evento.mensagem_escalante || null,
          ...(permissoes.decidir ? {
            mensagem_policial_1: evento.mensagem_policial_1 || null,
            mensagem_policial_2: evento.mensagem_policial_2 || null,
          } : {}),
        })),
      },
    }];
  });
  if (dataInicio) servicos = servicos.filter((item) => item.manifestacao.data_servico >= dataInicio && item.manifestacao.data_servico <= dataFim);
  if (policialId) servicos = servicos.filter((item) => [item.manifestacao.policial_id, item.manifestacao.substituto_id].includes(policialId));
  if (tipo) servicos = servicos.filter((item) => item.permuta.tipo === tipo);
  if (turno) servicos = servicos.filter((item) => item.manifestacao.turno === turno);
  if (permutaId) servicos = servicos.filter((item) => item.permuta_id === permutaId);
  // Pendências encerradas de permutas canceladas não entram nos indicadores normais;
  // revisões continuam visíveis até o P1 concluir a conferência.
  const ativos = servicos.filter((item) => !item.encerrada_em);
  const indicadores = {
    pendentes: ativos.filter((item) => item.situacao === "PENDENTE_NA_ESCALA" && item.permuta.status === "DEFERIDA").length,
    aplicados: ativos.filter((item) => item.situacao === "APLICADA_NA_ESCALA" && item.permuta.status === "DEFERIDA").length,
    revisao: servicos.filter((item) => item.situacao === "REVISAO_NECESSARIA" && !item.revisao_concluida_em).length,
    total: servicos.length,
  };
  return res.status(200).json({ servicos, indicadores });
}

async function listar(db, usuario, res, query = {}) {
  const permissoes = permissoesPermuta(usuario);
  const policialId = texto(usuario.id);
  const permutaIdAlvo = texto(query.permuta_id);
  if (permutaIdAlvo) {
    if (!UUID_VALIDO.test(permutaIdAlvo)) return respostaErro(res, 400, "Identificador da permuta inválido.");
    const { data: permutaAlvo, error } = await db.from("permutas_servico")
      .select("id,solicitante_id,destinatario_id").eq("id", permutaIdAlvo).maybeSingle();
    if (error) throw error;
    if (!permutaAlvo) return respostaErro(res, 404, "Permuta não encontrada.");
    if (!permissoes.consultar_geral
      && ![permutaAlvo.solicitante_id, permutaAlvo.destinatario_id].includes(policialId)) {
      return respostaErro(res, 404, "Permuta não encontrada.");
    }
  }
  const filtroPolicial = texto(query.policial_id);
  const calendarioIndividual = query.calendario === "individual";
  const policialCalendarioId = filtroPolicial || policialId;
  const filtroParticipacao = texto(query.participacao);
  if (filtroPolicial && !UUID_VALIDO.test(filtroPolicial)) return respostaErro(res, 400, "Filtro de policial inválido.");
  if (filtroPolicial && !permissoes.consultar_geral && filtroPolicial !== policialId) return respostaErro(res, 403, "Você só pode consultar suas próprias permutas.");
  if (query.calendario && !calendarioIndividual) return respostaErro(res, 400, "Modo de calendário inválido.");
  if (calendarioIndividual && !permissoes.consultar_proprias) return respostaErro(res, 403, "Seu perfil não pode consultar calendários de Permutas.");
  if (filtroParticipacao && !["foi_substituido", "substituiu"].includes(filtroParticipacao)) return respostaErro(res, 400, "Filtro de participação inválido.");
  if (filtroParticipacao && !calendarioIndividual) return respostaErro(res, 400, "O filtro de participação só pode ser usado no calendário individual.");
  const policialConsultado = calendarioIndividual ? policialCalendarioId : filtroPolicial || (permissoes.consultar_geral ? "" : policialId);
  const filtroTipo = texto(query.tipo);
  if (filtroTipo && !["SUBSTITUICAO_SIMPLES", "TROCA_RECIPROCA"].includes(filtroTipo)) return respostaErro(res, 400, "Filtro de tipo inválido.");
  const filtroStatus = texto(query.status);
  if (filtroStatus && !["AGUARDANDO_CONFIRMACAO", "AGUARDANDO_ANALISE", "DEFERIDA", "INDEFERIDA", "CANCELADA"].includes(filtroStatus)) return respostaErro(res, 400, "Filtro de situação inválido.");
  const dataInicio = texto(query.data_inicio);
  const dataFim = texto(query.data_fim);
  if (Boolean(dataInicio) !== Boolean(dataFim)) return respostaErro(res, 400, "Informe o início e o fim do período.");
  if (calendarioIndividual && !dataInicio) return respostaErro(res, 400, "Informe o período do calendário individual.");
  let idsNoPeriodo = null;
  if (dataInicio && dataFim) {
    if (!dataIsoValida(dataInicio) || !dataIsoValida(dataFim) || dataInicio > dataFim) return respostaErro(res, 400, "Período inválido.");
    const intervaloDias = (Date.parse(`${dataFim}T00:00:00Z`) - Date.parse(`${dataInicio}T00:00:00Z`)) / 86400000;
    if (intervaloDias > 44) return respostaErro(res, 400, "O período do calendário não pode exceder 45 dias.");
    if (calendarioIndividual) {
      const manifestacoesNoPeriodo = await buscarTodasPaginas((inicio, fim) => {
        let consulta = db.from("permutas_servico_manifestacoes")
          .select("permuta_id").gte("data_servico", dataInicio).lte("data_servico", dataFim);
        if (filtroParticipacao === "foi_substituido") consulta = consulta.eq("policial_id", policialCalendarioId);
        else if (filtroParticipacao === "substituiu") consulta = consulta.eq("substituto_id", policialCalendarioId);
        else consulta = consulta.or(`policial_id.eq.${policialCalendarioId},substituto_id.eq.${policialCalendarioId}`);
        return consulta.range(inicio, fim);
      });
      idsNoPeriodo = [...new Set(manifestacoesNoPeriodo.map((item) => item.permuta_id))];
    } else {
      let consultaPeriodo = db.from("permutas_servico_manifestacoes")
        .select("permuta_id").gte("data_servico", dataInicio).lte("data_servico", dataFim);
      if (filtroPolicial) consultaPeriodo = consultaPeriodo.or(`policial_id.eq.${filtroPolicial},substituto_id.eq.${filtroPolicial}`);
      const { data: manifestacoesNoPeriodo, error: erroPeriodo } = await consultaPeriodo.limit(1000);
      if (erroPeriodo) throw erroPeriodo;
      idsNoPeriodo = [...new Set((manifestacoesNoPeriodo || []).map((item) => item.permuta_id))];
    }
    if (!idsNoPeriodo.length) return res.status(200).json({ permutas: [], permissoes });
  }
  let permutas;
  if (calendarioIndividual) {
    permutas = [];
    for (let inicio = 0; inicio < idsNoPeriodo.length; inicio += TAMANHO_LOTE_IDS) {
      const lote = idsNoPeriodo.slice(inicio, inicio + TAMANHO_LOTE_IDS);
      let consulta = db.from("permutas_servico").select("*").in("id", lote).order("criada_em", { ascending: false });
      if (filtroTipo) consulta = consulta.eq("tipo", filtroTipo);
      if (filtroStatus) consulta = consulta.eq("status", filtroStatus);
      const { data, error } = await consulta;
      if (error) throw error;
      permutas.push(...(data || []));
    }
  } else {
    let consulta = db.from("permutas_servico").select("*").order("criada_em", { ascending: false }).limit(1000);
    if (permutaIdAlvo) consulta = consulta.eq("id", permutaIdAlvo);
    if (policialConsultado) consulta = consulta.or(`solicitante_id.eq.${policialConsultado},destinatario_id.eq.${policialConsultado}`);
    if (idsNoPeriodo) consulta = consulta.in("id", idsNoPeriodo);
    if (filtroTipo) consulta = consulta.eq("tipo", filtroTipo);
    if (filtroStatus) consulta = consulta.eq("status", filtroStatus);
    const resultado = await consulta;
    if (resultado.error) throw resultado.error;
    permutas = resultado.data || [];
  }
  const ids = permutas.map((item) => item.id);
  if (!ids.length) return res.status(200).json({ permutas: [], permissoes });
  let manifestacoesData;
  let confirmacoesData;
  let historicoData;
  let escalaData = [];
  let escalaHistoricoData = [];
  if (calendarioIndividual) {
    [manifestacoesData, confirmacoesData, historicoData] = await Promise.all([
      buscarRelacionadosPaginados(db, "permutas_servico_manifestacoes", ids, "criada_em"),
      buscarRelacionadosPaginados(db, "permutas_servico_confirmacoes", ids, "confirmada_em"),
      buscarRelacionadosPaginados(db, "permutas_servico_historico", ids, "ocorrido_em"),
    ]);
  } else {
    const [manifestacoesResult, confirmacoesResult, historicoResult] = await Promise.all([
      db.from("permutas_servico_manifestacoes").select("*").in("permuta_id", ids).order("criada_em"),
      db.from("permutas_servico_confirmacoes").select("*").in("permuta_id", ids).order("confirmada_em"),
      db.from("permutas_servico_historico").select("*").in("permuta_id", ids).order("ocorrido_em").order("id"),
    ]);
    if (manifestacoesResult.error) throw manifestacoesResult.error;
    if (confirmacoesResult.error) throw confirmacoesResult.error;
    if (historicoResult.error) throw historicoResult.error;
    manifestacoesData = manifestacoesResult.data;
    confirmacoesData = confirmacoesResult.data;
    historicoData = historicoResult.data;
  }
  [escalaData, escalaHistoricoData] = await Promise.all([
    buscarRelacionadosPaginados(db, "permutas_servico_escala", ids, "atualizada_em"),
    buscarRelacionadosPaginados(db, "permutas_servico_escala_historico", ids, "ocorrido_em"),
  ]);
  const agrupar = (itens) => {
    const mapa = new Map();
    for (const item of itens || []) mapa.set(item.permuta_id, [...(mapa.get(item.permuta_id) || []), item]);
    return mapa;
  };
  const manifestacoes = agrupar(manifestacoesData);
  const confirmacoes = agrupar(confirmacoesData);
  const historico = agrupar(historicoData);
  const idsPoliciais = [...new Set([
    ...permutas.flatMap((item) => [item.solicitante_id, item.destinatario_id]),
    ...(historicoData || []).map((evento) => evento.ator_id),
    ...escalaData.map((item) => item.responsavel_id),
    ...escalaHistoricoData.map((evento) => evento.ator_id),
  ].filter((id) => UUID_VALIDO.test(String(id || ""))))];
  const policiais = await buscarPoliciaisRelacionados(db, idsPoliciais);
  const policialPorId = new Map(policiais.map((item) => [item.id, item]));
  const escalaHistorico = agrupar(escalaHistoricoData);
  const resultado = permutas.map((item) => ({
    ...item,
    solicitante: policialPorId.get(item.solicitante_id) || null,
    destinatario: policialPorId.get(item.destinatario_id) || null,
    manifestacoes: manifestacoes.get(item.id) || [],
    controle_escala: escalaData.filter((escala) => escala.permuta_id === item.id).map((escala) => ({
      ...escala,
      responsavel: policialPorId.get(escala.responsavel_id) || null,
      historico: (escalaHistorico.get(escala.id) || []).map((evento) => ({ ...evento, ator: policialPorId.get(evento.ator_id) || null })),
    })),
    confirmacoes: confirmacoes.get(item.id) || [],
    historico: (historico.get(item.id) || []).map((evento) =>
      sanitizarEventoHistorico(evento, item, usuario, permissoes, policialPorId)),
  }));
  return res.status(200).json({ permutas: resultado, permissoes });
}

async function executarAcao(db, usuario, body, res) {
  const acao = texto(body?.acao);
  const permissoes = permissoesPermuta(usuario);
  if (acao === "controle_escala") {
    const role = String(usuario.role || "").trim().toLowerCase();
    const master = role === "master" || usuario.is_master === true;
    const p1 = ["p1", "p1_escalante_servico_ordinario"].includes(role);
    if (!master && !p1) return respostaErro(res, 403, "Somente P1 ou Master pode atualizar o Controle de Escala.");
    const escalaId = texto(body.escala_id);
    const operacao = texto(body.operacao);
    if (!UUID_VALIDO.test(escalaId) || !["APLICAR", "REABRIR", "CONCLUIR_REVISAO"].includes(operacao)) return respostaErro(res, 400, "Ação do Controle de Escala inválida.");
    const { data, error } = await db.rpc("permutas_servico_escala_atualizar_v1", {
      p_escala_id: escalaId, p_ator_id: usuario.id, p_acao: operacao,
    });
    if (error) throw error;
    return res.status(200).json({ id: escalaId, situacao: data });
  }
  if (acao === "criar") {
    if (!permissoes.criar) return respostaErro(res, 403, "Seu perfil não pode criar permutas.");
    const destinatarioId = texto(body.destinatario_id);
    const tipo = texto(body.tipo);
    const servico = body.servico;
    const motivo = texto(body.motivo);
    if (!UUID_VALIDO.test(destinatarioId) || destinatarioId === usuario.id) return respostaErro(res, 400, "Policial destinatário inválido.");
    if (!["SUBSTITUICAO_SIMPLES", "TROCA_RECIPROCA"].includes(tipo)) return respostaErro(res, 400, "Tipo de permuta inválido.");
    if (!motivo || Array.from(motivo).length > LIMITE_MOTIVO_PERMUTA) return respostaErro(res, 400, "Informe o motivo da permuta (até 500 caracteres).");
    const erroServico = validarServicoInformado(servico);
    if (erroServico) return respostaErro(res, 400, erroServico);
    const { data: destinatario, error: erroDestinatario } = await db.from("policiais")
      .select("id,status,posto_graduacao").eq("id", destinatarioId).maybeSingle();
    if (erroDestinatario) throw erroDestinatario;
    if (!destinatario || destinatario.status !== "EM ATIVIDADE" || ehPostoOficial(destinatario.posto_graduacao)) {
      return respostaErro(res, 400, "O substituto precisa ser outro policial em atividade e não pode ocupar posto de oficial.");
    }
    const { data, error } = await db.rpc("permutas_servico_criar_v1", {
      p_tipo: tipo,
      p_solicitante_id: usuario.id,
      p_destinatario_id: destinatarioId,
      p_data: servico.data,
      p_turno: servico.turno.trim(),
      p_inicio: servico.horario_inicio,
      p_fim: servico.horario_fim,
      p_descricao: servico.descricao.trim(),
      p_motivo: motivo,
    });
    if (error) throw error;
    return res.status(201).json({ id: data, status: "AGUARDANDO_CONFIRMACAO", confirmacoes_pendentes: [destinatarioId] });
  }

  if (acao === "editar") {
    if (!permissoes.criar) return respostaErro(res, 403, "Seu perfil não pode editar permutas.");
    const permutaId = texto(body?.permuta_id);
    const destinatarioId = texto(body?.destinatario_id);
    const versaoEsperada = texto(body?.atualizada_em);
    const motivo = texto(body?.motivo);
    const servico = body?.servico;
    if (!UUID_VALIDO.test(permutaId)) return respostaErro(res, 400, "Identificador da permuta inválido.");
    if (!versaoEsperada || Number.isNaN(Date.parse(versaoEsperada))) return respostaErro(res, 400, "Atualize a solicitação antes de editar.");
    if (!UUID_VALIDO.test(destinatarioId) || destinatarioId === usuario.id) return respostaErro(res, 400, "Policial substituto inválido.");
    if (!motivo || Array.from(motivo).length > LIMITE_MOTIVO_PERMUTA) return respostaErro(res, 400, "Informe o motivo da permuta (até 500 caracteres).");
    const erroServico = validarServicoInformado(servico);
    if (erroServico) return respostaErro(res, 400, erroServico);
    const { data: destinatario, error: erroDestinatario } = await db.from("policiais")
      .select("id,status,posto_graduacao").eq("id", destinatarioId).maybeSingle();
    if (erroDestinatario) throw erroDestinatario;
    if (!destinatario || destinatario.status !== "EM ATIVIDADE" || ehPostoOficial(destinatario.posto_graduacao)) {
      return respostaErro(res, 400, "O substituto precisa ser outro policial em atividade e não pode ocupar posto de oficial.");
    }
    const { data, error } = await db.rpc("permutas_servico_editar_v1", {
      p_permuta_id: permutaId,
      p_ator_id: usuario.id,
      p_versao_esperada: versaoEsperada,
      p_destinatario_id: destinatarioId,
      p_motivo: motivo,
      p_data: servico.data,
      p_turno: servico.turno.trim(),
      p_inicio: servico.horario_inicio,
      p_fim: servico.horario_fim,
      p_descricao: servico.descricao.trim(),
    });
    if (error) throw error;
    return res.status(200).json({ id: permutaId, status: data, confirmacao_pendente: destinatarioId });
  }

  const permutaId = texto(body?.permuta_id);
  if (!UUID_VALIDO.test(permutaId)) return respostaErro(res, 400, "Identificador da permuta inválido.");
  if (acao === "confirmar") {
    if (!permissoes.confirmar) return respostaErro(res, 403, "Seu perfil não pode confirmar permutas.");
    const { data: permuta, error: erroPermuta } = await db.from("permutas_servico")
      .select("id,tipo,solicitante_id,destinatario_id,status").eq("id", permutaId).maybeSingle();
    if (erroPermuta) throw erroPermuta;
    if (!permuta) return respostaErro(res, 404, "Permuta não encontrada.");
    if (![permuta.solicitante_id, permuta.destinatario_id].includes(usuario.id)) return respostaErro(res, 403, "Somente os policiais envolvidos podem confirmar esta permuta.");
    const servico = body.servico || {};
    const registraServicoReciproco = permuta.tipo === "TROCA_RECIPROCA" && usuario.id === permuta.destinatario_id;
    if (registraServicoReciproco) {
      const erroServico = validarServicoInformado(servico);
      if (erroServico) return respostaErro(res, 400, erroServico);
    }
    const { data, error } = await db.rpc("permutas_servico_confirmar_v1", {
      p_permuta_id: permutaId,
      p_ator_id: usuario.id,
      p_data: registraServicoReciproco ? servico.data : null,
      p_turno: registraServicoReciproco ? servico.turno.trim() : null,
      p_inicio: registraServicoReciproco ? servico.horario_inicio : null,
      p_fim: registraServicoReciproco ? servico.horario_fim : null,
      p_descricao: registraServicoReciproco ? servico.descricao.trim() : null,
    });
    if (error) throw error;
    return res.status(200).json({ id: permutaId, status: data });
  }

  if (acao === "decidir") {
    if (!permissoes.decidir) return respostaErro(res, 403, "Somente Oficial ou Master pode decidir permutas.");
    if (typeof body.deferir !== "boolean") return respostaErro(res, 400, "Informe se a decisão é deferimento ou indeferimento.");
    if (body.servicos_conferidos !== true) return respostaErro(res, 400, "Confirme que os serviços informados foram conferidos antes da decisão.");
    const mensagens = {
      mensagem_escalante: texto(body.mensagem_escalante),
      mensagem_policial_1: texto(body.mensagem_policial_1),
      mensagem_policial_2: texto(body.mensagem_policial_2),
    };
    if (Object.values(mensagens).some((mensagem) => Array.from(mensagem).length > 3000)) {
      return respostaErro(res, 400, "Cada mensagem pode ter até 3000 caracteres.");
    }
    const { data, error } = await db.rpc("permutas_servico_decidir_v2", {
      p_permuta_id: permutaId, p_ator_id: usuario.id,
      p_servicos_conferidos: body.servicos_conferidos,
      p_deferir: body.deferir,
      p_mensagem_escalante: mensagens.mensagem_escalante || null,
      p_mensagem_policial_1: mensagens.mensagem_policial_1 || null,
      p_mensagem_policial_2: mensagens.mensagem_policial_2 || null,
    });
    if (error) throw error;
    return res.status(200).json({ id: permutaId, status: data });
  }

  if (acao === "cancelar") {
    const justificativa = texto(body.justificativa);
    if (justificativa.length > 3000) return respostaErro(res, 400, "O motivo pode ter até 3000 caracteres.");
    const { data: permuta, error: erroPermuta } = await db.from("permutas_servico")
      .select("id,solicitante_id,status").eq("id", permutaId).maybeSingle();
    if (erroPermuta) throw erroPermuta;
    if (!permuta) return respostaErro(res, 404, "Permuta não encontrada.");
    const cancelamentoSolicitante = usuario.id === permuta.solicitante_id
      && ["AGUARDANDO_CONFIRMACAO", "AGUARDANDO_ANALISE"].includes(permuta.status);
    const cancelamentoAdministrativo = permissoes.cancelar_deferida && permuta.status === "DEFERIDA";
    if (!cancelamentoSolicitante && !cancelamentoAdministrativo) {
      return respostaErro(res, 403, "Você não pode cancelar esta permuta ou situação.");
    }
    if (cancelamentoAdministrativo && !justificativa) {
      return respostaErro(res, 400, "Informe justificativa de cancelamento de até 3000 caracteres.");
    }
    const { data, error } = await db.rpc("permutas_servico_cancelar_v1", {
      p_permuta_id: permutaId, p_ator_id: usuario.id, p_justificativa: justificativa,
    });
    if (error) throw error;
    return res.status(200).json({ id: permutaId, status: data });
  }
  return respostaErro(res, 400, "Ação de permuta inválida.");
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (!permissoesPermuta(usuario).criar) return respostaErro(res, 403, "Seu perfil não tem acesso ao módulo de Permutas.");
    const db = supabaseAdmin();
    if (req.method === "GET") {
      if (req.query?.controle_escala === "1") return await listarControleEscala(db, usuario, res, req.query);
      if (req.query?.calendario === "mini") return await listarCalendariosMini(db, usuario, res, req.query);
      return await listar(db, usuario, res, req.query);
    }
    if (req.method === "POST") return await executarAcao(db, usuario, req.body, res);
    res.setHeader("Allow", "GET, POST");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    const status = statusDoErro(error);
    if (status === 500) console.error("Erro na API de permutas:", error?.code || "erro interno");
    return respostaErro(res, status, mensagemDoErro(error));
  }
}
