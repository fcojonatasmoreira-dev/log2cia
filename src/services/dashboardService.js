import { supabase } from "../lib/supabaseClient";
import { LOCALIZACOES, STATUS_ACERVO, TIPOS_CAUTELA } from "../utils/classificacaoAcervo";

const normalizar = (valor) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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

export async function getDashboardMetrics() {
  const [{ data: cautelas }, { data: equipamentos }, { count: efetivoAtivoCount }] = await Promise.all([
    supabase.from("cautelas").select("id, status, tipo_cautela, cautela_itens(equipamento_id)"),
    supabase.from("equipamentos").select("*"),
    supabase.from("policiais").select("*", { count: "exact", head: true }).eq("status", "EM ATIVIDADE"),
  ]);

  const acervo = equipamentos || [];
  const cautelasAtivas = (cautelas || []).filter((c) => c.status === "ativa");
  const cautelasTemporariasAtivas = cautelasAtivas.filter((c) => c.tipo_cautela === TIPOS_CAUTELA.TEMPORARIA).length;
  const cautelasLongoPrazoAtivas = cautelasAtivas.filter((c) => c.tipo_cautela === TIPOS_CAUTELA.LONGO_PRAZO).length;

  const contar = (localizacao) => acervo.filter((e) => obterLocalizacao(e) === localizacao).length;
  const armamentosDisponiveis = acervo.filter(
    (e) => e.tipo === "armamento" && normalizar(e.status) === STATUS_ACERVO.DISPONIVEL && obterLocalizacao(e) === LOCALIZACOES.RESERVA,
  ).length;

  const tipoCautelaPorEquipamento = {};
  cautelasAtivas.forEach((c) => {
    (c.cautela_itens || []).forEach((ci) => {
      if (ci?.equipamento_id) tipoCautelaPorEquipamento[ci.equipamento_id] = c.tipo_cautela;
    });
  });
  const acauteladasTemporarias = acervo.filter((e) =>
    obterLocalizacao(e) === LOCALIZACOES.ACAUTELADA &&
    (e.detalhes?.tipo_cautela === TIPOS_CAUTELA.TEMPORARIA || tipoCautelaPorEquipamento[e.id] === TIPOS_CAUTELA.TEMPORARIA),
  ).length;
  const acauteladasLongoPrazo = acervo.filter((e) =>
    obterLocalizacao(e) === LOCALIZACOES.ACAUTELADA &&
    (e.detalhes?.tipo_cautela === TIPOS_CAUTELA.LONGO_PRAZO || tipoCautelaPorEquipamento[e.id] === TIPOS_CAUTELA.LONGO_PRAZO),
  ).length;

  const hoje = new Date();
  const limite30Dias = new Date();
  limite30Dias.setDate(hoje.getDate() + 30);
  const coletesAVencer = acervo.filter((e) => {
    if (e.tipo !== "colete" || !e.detalhes?.data_validade) return false;
    return new Date(e.detalhes.data_validade) <= limite30Dias;
  }).length;

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
