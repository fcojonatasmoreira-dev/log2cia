export function obterLocalizacaoGravada(item) {
  return item?.detalhes?.localizacao_atual ?? item?.localizacao_atual ?? "";
}

export const LOCALIZACOES = Object.freeze({
  RESERVA: "Estoque da Reserva",
  ACAUTELADA: "Acautelada",
  MANUTENCAO: "Em Manutenção",
  PERICIA: "Em Perícia",
  APREENDIDA: "Apreendida",
  BAIXA: "Baixa Definitiva",
});

export const TIPOS_CAUTELA = Object.freeze({
  TEMPORARIA: "temporaria",
  LONGO_PRAZO: "longo_prazo",
});

export const STATUS_ACERVO = Object.freeze({
  DISPONIVEL: "disponivel",
  INDISPONIVEL: "indisponivel",
});

const normalizar = (valor) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function obterStatusAcervo(item) {
  return normalizar(item?.status) === STATUS_ACERVO.DISPONIVEL
    ? STATUS_ACERVO.DISPONIVEL
    : STATUS_ACERVO.INDISPONIVEL;
}

export function obterLocalizacaoAcervo(item) {
  const valor = item?.detalhes?.localizacao_atual ?? item?.localizacao_atual;
  const n = normalizar(valor);

  if (!n) return LOCALIZACOES.RESERVA;
  if (n === normalizar(LOCALIZACOES.RESERVA)) return LOCALIZACOES.RESERVA;
  if (n === "acautelada com policial" || n === "acautelada")
    return LOCALIZACOES.ACAUTELADA;
  if (n === "acautelada (temporaria)" || n === "acautelada temporaria")
    return LOCALIZACOES.ACAUTELADA;
  if (
    n === "acautelada com policial (longo prazo)" ||
    n === "acautelada longo prazo"
  )
    return LOCALIZACOES.ACAUTELADA;
  if (n === "manutencao" || n === "em manutencao")
    return LOCALIZACOES.MANUTENCAO;
  if (n === "em pericia" || n === "pericia") return LOCALIZACOES.PERICIA;
  if (n === "apreendida") return LOCALIZACOES.APREENDIDA;
  if (n === "baixa definitiva" || n === "baixado") return LOCALIZACOES.BAIXA;
  return String(valor).trim();
}

export function obterTipoCautela(item, cautelasAtivasPorEquipamento = {}) {
  const direto = item?.detalhes?.tipo_cautela;
  if (
    direto === TIPOS_CAUTELA.TEMPORARIA ||
    direto === TIPOS_CAUTELA.LONGO_PRAZO
  )
    return direto;
  const vinculo = cautelasAtivasPorEquipamento?.[item?.id];
  return vinculo?.tipo_cautela || null;
}

export function classificarEquipamento(
  item,
  cautelasAtivasPorEquipamento = {},
) {
  const localizacao = obterLocalizacaoAcervo(item);
  const tipoCautela = obterTipoCautela(item, cautelasAtivasPorEquipamento);
  return {
    chave:
      localizacao === LOCALIZACOES.ACAUTELADA
        ? tipoCautela || "acautelada_sem_classificacao"
        : normalizar(localizacao),
    label: localizacao,
    filtro: localizacao,
    tipo_cautela: tipoCautela,
    status: obterStatusAcervo(item),
  };
}

export function normalizarLocalizacaoParaBanco(valor) {
  return obterLocalizacaoAcervo({ detalhes: { localizacao_atual: valor } });
}
