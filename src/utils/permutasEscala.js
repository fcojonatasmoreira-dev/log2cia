import { deslocarData } from "./permutasCalendar.js";

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(valor) {
  if (!DATA_VALIDA.test(String(valor || ""))) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function obterPeriodoControleEscala(opcao, hoje, dataInicio = "", dataFim = "") {
  const amanha = deslocarData(hoje, 1);
  if (opcao === "amanha") return { inicio: amanha, fim: amanha, erro: "" };
  if (opcao === "3_dias") return { inicio: amanha, fim: deslocarData(amanha, 2), erro: "" };
  if (opcao === "7_dias") return { inicio: amanha, fim: deslocarData(amanha, 6), erro: "" };
  if (!dataInicio || !dataFim) return { inicio: "", fim: "", erro: "Informe as datas inicial e final do período." };
  if (!dataValida(dataInicio) || !dataValida(dataFim) || dataInicio > dataFim) {
    return { inicio: "", fim: "", erro: "Informe um período válido, com a data inicial até a data final." };
  }
  const dias = (Date.parse(`${dataFim}T00:00:00Z`) - Date.parse(`${dataInicio}T00:00:00Z`)) / 86400000;
  if (dias > 44) return { inicio: "", fim: "", erro: "O período personalizado não pode exceder 45 dias." };
  return { inicio: dataInicio, fim: dataFim, erro: "" };
}

function ordenarServicos(servicos) {
  return [...(servicos || [])].sort((a, b) =>
    String(a.manifestacao?.data_servico || "").localeCompare(String(b.manifestacao?.data_servico || ""))
    || String(a.manifestacao?.turno || "").localeCompare(String(b.manifestacao?.turno || ""), "pt-BR", { numeric: true, sensitivity: "base" })
    || String(a.manifestacao?.horario_inicio || "").localeCompare(String(b.manifestacao?.horario_inicio || ""))
    || String(a.id || "").localeCompare(String(b.id || "")),
  );
}

export function agruparServicosControleEscala(servicos) {
  const grupos = new Map();
  for (const servico of ordenarServicos(servicos)) {
    const data = String(servico.manifestacao?.data_servico || "").slice(0, 10);
    if (!grupos.has(data)) grupos.set(data, []);
    grupos.get(data).push(servico);
  }
  return [...grupos].map(([data, itens]) => ({ data, servicos: itens }));
}

export function separarServicosControleEscala(servicos, periodo) {
  const dentroDoPeriodo = (item) => Boolean(periodo?.inicio && periodo?.fim)
    && item.manifestacao?.data_servico >= periodo.inicio
    && item.manifestacao?.data_servico <= periodo.fim;
  const pendenciaAtiva = (item) => !item.encerrada_em
    && item.situacao === "PENDENTE_NA_ESCALA"
    && item.permuta?.status === "DEFERIDA";
  const aplicados = [];
  const pendentesPeriodo = [];
  const anterioresERevisoes = [];
  const encerrados = [];
  const outros = [];

  for (const item of servicos || []) {
    if (item.situacao === "REVISAO_NECESSARIA") anterioresERevisoes.push(item);
    else if (item.encerrada_em) encerrados.push(item);
    else if (item.situacao === "APLICADA_NA_ESCALA") aplicados.push(item);
    else if (pendenciaAtiva(item) && dentroDoPeriodo(item)) pendentesPeriodo.push(item);
    else if (pendenciaAtiva(item)) anterioresERevisoes.push(item);
    else outros.push(item);
  }

  return {
    pendentesPeriodo: ordenarServicos(pendentesPeriodo),
    aplicados: ordenarServicos(aplicados),
    anterioresERevisoes: ordenarServicos(anterioresERevisoes),
    encerrados: ordenarServicos(encerrados),
    outros: ordenarServicos(outros),
  };
}
