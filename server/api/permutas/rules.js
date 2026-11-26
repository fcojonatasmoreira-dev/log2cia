export const ESTADOS_PERMUTA = Object.freeze({
  AGUARDANDO_CONFIRMACAO: "AGUARDANDO_CONFIRMACAO",
  AGUARDANDO_ANALISE: "AGUARDANDO_ANALISE",
  DEFERIDA: "DEFERIDA",
  INDEFERIDA: "INDEFERIDA",
  CANCELADA: "CANCELADA",
});

const TRANSICOES_PERMITIDAS = new Map([
  [ESTADOS_PERMUTA.AGUARDANDO_CONFIRMACAO, new Set([ESTADOS_PERMUTA.AGUARDANDO_ANALISE])],
  [ESTADOS_PERMUTA.AGUARDANDO_ANALISE, new Set([ESTADOS_PERMUTA.DEFERIDA, ESTADOS_PERMUTA.INDEFERIDA])],
  [ESTADOS_PERMUTA.DEFERIDA, new Set([ESTADOS_PERMUTA.CANCELADA])],
  [ESTADOS_PERMUTA.INDEFERIDA, new Set()],
  [ESTADOS_PERMUTA.CANCELADA, new Set()],
]);

const PAPEL_POLICIAL = new Set(["policial", "p1", "p1_escalante_servico_ordinario", "oficial", "master"]);
const PAPEL_DECISOR = new Set(["oficial", "master"]);
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizarRole(usuario) {
  return String(usuario?.role || "").trim().toLowerCase();
}

export function permissoesPermuta(usuario) {
  const role = normalizarRole(usuario);
  // Sessões antigas recebem o modo inicial no middleware; o fallback mantém
  // chamadas unitárias compatíveis sem permitir privilégios a partir do cliente.
  const modo = usuario?.modo_acesso || (role === "policial" ? "policial" : "administrativo");
  const master = role === "master" || usuario?.is_master === true;
  const modoPolicial = modo === "policial";
  const modoAdministrativo = modo === "administrativo";
  const consultaGeral = modoAdministrativo && (master || role === "oficial" || role === "p1" || role === "p1_escalante_servico_ordinario");
  const policial = modoPolicial && (master || PAPEL_POLICIAL.has(role));
  return {
    criar: policial,
    confirmar: policial,
    consultar_proprias: policial || consultaGeral,
    consultar_geral: consultaGeral,
    decidir: modoAdministrativo && (master || PAPEL_DECISOR.has(role)),
    cancelar_deferida: modoAdministrativo && (master || PAPEL_DECISOR.has(role)),
  };
}

export function validarServicoInformado(servico) {
  if (!servico || typeof servico !== "object" || Array.isArray(servico)) return "Informe os dados do serviço.";
  if (typeof servico.data !== "string" || !DATA_ISO.test(servico.data)) return "Data do serviço inválida.";
  const [ano, mes, dia] = servico.data.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return "Data do serviço inválida.";
  if (typeof servico.turno !== "string" || !servico.turno.trim() || servico.turno.trim().length > 80) return "Turno inválido.";
  if (typeof servico.horario_inicio !== "string" || !HORA.test(servico.horario_inicio)
    || typeof servico.horario_fim !== "string" || !HORA.test(servico.horario_fim)
    || servico.horario_inicio === servico.horario_fim) return "Horário do serviço inválido.";
  if (typeof servico.descricao !== "string" || !servico.descricao.trim() || servico.descricao.trim().length > 500) return "Descrição do serviço inválida.";
  return null;
}

function intervaloServico(servico) {
  const [ano, mes, dia] = servico.data.split("-").map(Number);
  const [horaInicio, minutoInicio] = servico.horario_inicio.split(":").map(Number);
  const [horaFim, minutoFim] = servico.horario_fim.split(":").map(Number);
  const inicio = Date.UTC(ano, mes - 1, dia, horaInicio, minutoInicio);
  let fim = Date.UTC(ano, mes - 1, dia, horaFim, minutoFim);
  if (fim <= inicio) fim += 24 * 60 * 60 * 1000;
  return { inicio, fim };
}

export function servicosConflitam(primeiro, segundo) {
  if (validarServicoInformado(primeiro) || validarServicoInformado(segundo)) return false;
  const a = intervaloServico(primeiro);
  const b = intervaloServico(segundo);
  return a.inicio < b.fim && b.inicio < a.fim;
}

export function validarManifestacoes({ tipo, solicitanteId, destinatarioId, manifestacoes }) {
  if (!UUID_VALIDO.test(String(solicitanteId || "")) || !UUID_VALIDO.test(String(destinatarioId || "")) || solicitanteId === destinatarioId) {
    return "Participantes inválidos.";
  }
  if (!Array.isArray(manifestacoes) || manifestacoes.length !== (tipo === "TROCA_RECIPROCA" ? 2 : 1)) {
    return "As manifestações não correspondem ao tipo da permuta.";
  }
  const primeira = manifestacoes[0];
  if (primeira?.policial_id !== solicitanteId || primeira?.substituto_id !== destinatarioId) return "A primeira manifestação deve partir do solicitante e indicar o outro policial.";
  for (const item of manifestacoes) {
    if (!UUID_VALIDO.test(String(item?.policial_id || "")) || !UUID_VALIDO.test(String(item?.substituto_id || ""))) return "Participantes inválidos na manifestação.";
    if (item.policial_id === item.substituto_id) return "Um policial não pode indicar a si mesmo como substituto.";
    const erroServico = validarServicoInformado(item.servico);
    if (erroServico) return erroServico;
  }
  if (tipo === "TROCA_RECIPROCA") {
    const segunda = manifestacoes[1];
    if (segunda.policial_id !== destinatarioId || segunda.substituto_id !== solicitanteId) return "A troca recíproca deve conter a manifestação do outro policial indicando o solicitante.";
  } else if (tipo !== "SUBSTITUICAO_SIMPLES") {
    return "Tipo de permuta inválido.";
  }
  return null;
}

export function transicaoPermitida(atual, proximo) {
  return TRANSICOES_PERMITIDAS.get(atual)?.has(proximo) === true;
}

export function podeAvancarParaAnalise({ tipo, manifestacoes, confirmacoes }) {
  const quantidade = tipo === "TROCA_RECIPROCA" ? 2 : 1;
  if (!Array.isArray(manifestacoes) || manifestacoes.length !== quantidade) return false;
  if (!Array.isArray(confirmacoes) || confirmacoes.length !== 2) return false;
  const idsManifestacao = new Set(manifestacoes.flatMap((item) => [item.policial_id, item.substituto_id]));
  const idsConfirmacao = new Set(confirmacoes.map((item) => item.policial_id));
  return idsManifestacao.size === 2 && idsConfirmacao.size === 2
    && [...idsManifestacao].every((id) => idsConfirmacao.has(id));
}
