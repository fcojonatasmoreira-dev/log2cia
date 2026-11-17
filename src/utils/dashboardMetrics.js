import { LOCALIZACOES, STATUS_ACERVO, TIPOS_CAUTELA } from "./classificacaoAcervo.js";

const normalizar = (valor) => String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const obterLocalizacao = (item) => {
  const n = normalizar(item?.detalhes?.localizacao_atual || item?.localizacao_atual);
  if (n === normalizar(LOCALIZACOES.ACAUTELADA) || n === "acautelada com policial" || n === "acautelada (temporaria)" || n === "acautelada com policial (longo prazo)") return LOCALIZACOES.ACAUTELADA;
  if (n === normalizar(LOCALIZACOES.MANUTENCAO) || n === "manutencao") return LOCALIZACOES.MANUTENCAO;
  if (n === normalizar(LOCALIZACOES.PERICIA)) return LOCALIZACOES.PERICIA;
  if (n === normalizar(LOCALIZACOES.APREENDIDA)) return LOCALIZACOES.APREENDIDA;
  if (n === normalizar(LOCALIZACOES.BAIXA) || n === "baixado") return LOCALIZACOES.BAIXA;
  return LOCALIZACOES.RESERVA;
};

const formatValue = (val) => (val > 0 ? val : 0);

export function calcularDashboardMetrics(cautelas = [], equipamentos = [], efetivoAtivoCount = 0, hoje = new Date()) {
  const acervo = equipamentos || [];
  const cautelasAtivas = (cautelas || []).filter((c) => c.status === "ativa");
  const cautelasTemporariasAtivas = cautelasAtivas.filter((c) => c.tipo_cautela === TIPOS_CAUTELA.TEMPORARIA).length;
  const cautelasLongoPrazoAtivas = cautelasAtivas.filter((c) => c.tipo_cautela === TIPOS_CAUTELA.LONGO_PRAZO).length;
  const contar = (localizacao) => acervo.filter((e) => obterLocalizacao(e) === localizacao).length;
  const armamentosDisponiveis = acervo.filter((e) => e.tipo === "armamento" && normalizar(e.status) === STATUS_ACERVO.DISPONIVEL && obterLocalizacao(e) === LOCALIZACOES.RESERVA).length;
  const tipoCautelaPorEquipamento = {};
  cautelasAtivas.forEach((c) => (c.cautela_itens || []).forEach((ci) => {
    if (ci?.equipamento_id) tipoCautelaPorEquipamento[ci.equipamento_id] = c.tipo_cautela;
  }));
  const acauteladasTemporarias = acervo.filter((e) => obterLocalizacao(e) === LOCALIZACOES.ACAUTELADA && (e.detalhes?.tipo_cautela === TIPOS_CAUTELA.TEMPORARIA || tipoCautelaPorEquipamento[e.id] === TIPOS_CAUTELA.TEMPORARIA)).length;
  const acauteladasLongoPrazo = acervo.filter((e) => obterLocalizacao(e) === LOCALIZACOES.ACAUTELADA && (e.detalhes?.tipo_cautela === TIPOS_CAUTELA.LONGO_PRAZO || tipoCautelaPorEquipamento[e.id] === TIPOS_CAUTELA.LONGO_PRAZO)).length;
  const limite30Dias = new Date(hoje);
  limite30Dias.setDate(limite30Dias.getDate() + 30);
  const coletesAVencer = acervo.filter((e) => e.tipo === "colete" && e.detalhes?.data_validade && new Date(e.detalhes.data_validade) <= limite30Dias).length;
  return {
    cautelasAtivas: formatValue(cautelasTemporariasAtivas),
    cautelasTemporariasAtivas: formatValue(cautelasTemporariasAtivas),
    cautelasLongoPrazoAtivas: formatValue(cautelasLongoPrazoAtivas),
    armamentosDisponiveis: formatValue(armamentosDisponiveis),
    estoqueDaReserva: formatValue(contar(LOCALIZACOES.RESERVA)),
    acauteladasTemporarias: formatValue(acauteladasTemporarias),
    acauteladasLongoPrazo: formatValue(acauteladasLongoPrazo),
    emManutencao: formatValue(contar(LOCALIZACOES.MANUTENCAO)),
    emPericia: formatValue(contar(LOCALIZACOES.PERICIA)),
    apreendidas: formatValue(contar(LOCALIZACOES.APREENDIDA)),
    baixaDefinitiva: formatValue(contar(LOCALIZACOES.BAIXA)),
    coletesAVencer: formatValue(coletesAVencer),
    efetivoAtivo: formatValue(efetivoAtivoCount || 0),
  };
}
