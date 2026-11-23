function dataUtc(chave) {
  const [ano, mes, dia] = String(chave || "").slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data;
}

function chaveData(data) {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(data.getUTCDate()).padStart(2, "0")}`;
}

export function dataLocalHoje(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

export function deslocarData(data, quantidade) {
  const valor = dataUtc(data);
  if (!valor) return "";
  valor.setUTCDate(valor.getUTCDate() + quantidade);
  return chaveData(valor);
}

export function obterDiasCalendario(referencia, modo) {
  const data = dataUtc(referencia);
  if (!data) return [];
  if (modo === "semana") {
    const inicio = new Date(data);
    const diaSemana = (inicio.getUTCDay() + 6) % 7;
    inicio.setUTCDate(inicio.getUTCDate() - diaSemana);
    return Array.from({ length: 7 }, (_, indice) => {
      const dia = new Date(inicio);
      dia.setUTCDate(dia.getUTCDate() + indice);
      return chaveData(dia);
    });
  }

  const inicioMes = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
  const primeiroDia = new Date(inicioMes);
  primeiroDia.setUTCDate(primeiroDia.getUTCDate() - ((primeiroDia.getUTCDay() + 6) % 7));
  const fimMes = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0));
  const quantidadeDias = ((fimMes - primeiroDia) / 86400000) + 1;
  const quantidadeCelulas = Math.ceil(quantidadeDias / 7) * 7;
  return Array.from({ length: quantidadeCelulas }, (_, indice) => {
    const dia = new Date(primeiroDia);
    dia.setUTCDate(dia.getUTCDate() + indice);
    return chaveData(dia);
  });
}

export function deslocarReferenciaCalendario(referencia, modo, direcao) {
  const data = dataUtc(referencia);
  if (!data) return "";
  if (modo === "semana") {
    data.setUTCDate(data.getUTCDate() + (direcao * 7));
    return chaveData(data);
  }
  return chaveData(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + direcao, 1)));
}

export function criarEventosCalendario(permutas, filtros = {}) {
  const eventos = [];
  for (const permuta of permutas || []) {
    if (filtros.status && permuta.status !== filtros.status) continue;
    if (filtros.tipo && permuta.tipo !== filtros.tipo) continue;
    for (const manifestacao of permuta.manifestacoes || []) {
      const dataServico = String(manifestacao.data_servico || "").slice(0, 10);
      if (!dataUtc(dataServico)) continue;
      const classificacaoPolicial = classificarParticipacao(manifestacao, filtros.policialId);
      if (filtros.policialId && !classificacaoPolicial) continue;
      if (filtros.participacao && classificacaoPolicial !== filtros.participacao) continue;
      if (filtros.dataInicio && dataServico < filtros.dataInicio) continue;
      if (filtros.dataFim && dataServico > filtros.dataFim) continue;
      const eventoBase = {
        permuta,
        manifestacao,
        dataServico,
        autorizado: permuta.status === "DEFERIDA",
        classificacaoPolicial: classificacaoPolicial === "foi_substituido" ? "Foi substituído"
          : classificacaoPolicial === "substituiu" ? "Substituiu alguém" : "",
        chaveParticipacao: classificacaoPolicial,
      };
      eventos.push({ ...eventoBase, dataMarcacao: dataServico, continuidade: false });
    }
  }
  return eventos.sort((a, b) => a.dataMarcacao.localeCompare(b.dataMarcacao)
    || String(a.manifestacao.horario_inicio || "").localeCompare(String(b.manifestacao.horario_inicio || ""))
    || a.permuta.id.localeCompare(b.permuta.id));
}

export function filtrarServicosDeferidosPassados(permutas, agora = new Date()) {
  const hoje = dataLocalHoje(agora);
  const horaAtual = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}:${String(agora.getSeconds()).padStart(2, "0")}`;
  return (permutas || []).flatMap((permuta) => {
    if (permuta.status !== "DEFERIDA") return [];
    const manifestacoes = (permuta.manifestacoes || []).filter((manifestacao) => {
      const dataServico = String(manifestacao.data_servico || "").slice(0, 10);
      const inicio = String(manifestacao.horario_inicio || "").slice(0, 8).padEnd(8, ":00");
      const fim = String(manifestacao.horario_fim || "").slice(0, 8).padEnd(8, ":00");
      if (!dataUtc(dataServico) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(inicio) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(fim)) return false;
      const dataFim = fim <= inicio ? deslocarData(dataServico, 1) : dataServico;
      return dataFim < hoje || (dataFim === hoje && fim < horaAtual);
    });
    return manifestacoes.length ? [{ ...permuta, manifestacoes }] : [];
  });
}

function classificarParticipacao(manifestacao, policialId) {
  if (!policialId) return "";
  if (manifestacao.policial_id === policialId) return "foi_substituido";
  if (manifestacao.substituto_id === policialId) return "substituiu";
  return "";
}

export function calcularIndicadoresCalendario(permutas, filtros = {}) {
  const solicitacoes = new Map();
  let foiSubstituido = 0;
  let substituiu = 0;
  for (const permuta of permutas || []) {
    if (filtros.status && permuta.status !== filtros.status) continue;
    if (filtros.tipo && permuta.tipo !== filtros.tipo) continue;
    const servicos = (permuta.manifestacoes || []).filter((manifestacao) => {
      const data = String(manifestacao.data_servico || "").slice(0, 10);
      if (filtros.dataInicio && data < filtros.dataInicio) return false;
      if (filtros.dataFim && data > filtros.dataFim) return false;
      const papel = classificarParticipacao(manifestacao, filtros.policialId);
      return papel && (!filtros.participacao || papel === filtros.participacao);
    });
    if (!servicos.length) continue;
    solicitacoes.set(permuta.id, permuta.tipo);
    for (const manifestacao of servicos) {
      if (manifestacao.policial_id === filtros.policialId) foiSubstituido++;
      else if (manifestacao.substituto_id === filtros.policialId) substituiu++;
    }
  }
  const simples = [...solicitacoes.values()].filter((tipo) => tipo === "SUBSTITUICAO_SIMPLES").length;
  const reciprocas = [...solicitacoes.values()].filter((tipo) => tipo === "TROCA_RECIPROCA").length;
  return {
    foiSubstituido,
    substituiu,
    simples,
    reciprocas,
    solicitacoes: solicitacoes.size,
  };
}
