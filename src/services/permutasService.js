const API = "/api/permutas";
const TAMANHO_LOTE_MINI_CALENDARIO = 25;

async function request(options = {}, url = API) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação de permuta.");
  return data;
}

export function listarPermutas({ policial_id, status, tipo, participacao, data_inicio, data_fim, calendario, permuta_id } = {}) {
  const query = new URLSearchParams();
  if (policial_id) query.set("policial_id", policial_id);
  if (status) query.set("status", status);
  if (tipo) query.set("tipo", tipo);
  if (participacao) query.set("participacao", participacao);
  if (data_inicio) query.set("data_inicio", data_inicio);
  if (data_fim) query.set("data_fim", data_fim);
  if (calendario) query.set("calendario", calendario);
  if (permuta_id) query.set("permuta_id", permuta_id);
  const parametros = query.toString();
  return request({}, parametros ? `${API}?${parametros}` : API);
}

export async function listarCalendariosMini(policialIds, data_inicio, data_fim) {
  const ids = [...new Set((policialIds || []).filter(Boolean))];
  const lotes = [];
  for (let inicio = 0; inicio < ids.length; inicio += TAMANHO_LOTE_MINI_CALENDARIO) {
    lotes.push(ids.slice(inicio, inicio + TAMANHO_LOTE_MINI_CALENDARIO));
  }
  const respostas = await Promise.all(lotes.map((lote) => {
    const query = new URLSearchParams({
      calendario: "mini",
      policiais_ids: lote.join(","),
      data_inicio,
      data_fim,
    });
    return request({}, `${API}?${query}`);
  }));
  return respostas.flatMap((resposta) => resposta.calendarios || []);
}

export function listarControleEscala(filtros = {}) {
  const query = new URLSearchParams({ controle_escala: "1" });
  for (const campo of ["data", "data_inicio", "data_fim", "situacao", "policial_id", "tipo", "turno", "permuta_id"]) {
    if (filtros[campo]) query.set(campo, filtros[campo]);
  }
  return request({}, `${API}?${query}`);
}

export function atualizarServicoEscala(escala_id, operacao) {
  return request({ method: "POST", body: JSON.stringify({ acao: "controle_escala", escala_id, operacao }) });
}

export function criarPermuta({ tipo, destinatario_id, motivo, servico }) {
  return request({ method: "POST", body: JSON.stringify({ acao: "criar", tipo, destinatario_id, motivo, servico }) });
}

export function editarPermuta({ permuta_id, atualizada_em, destinatario_id, motivo, servico }) {
  return request({ method: "POST", body: JSON.stringify({ acao: "editar", permuta_id, atualizada_em, destinatario_id, motivo, servico }) });
}

export function confirmarPermuta(permuta_id, servico) {
  return request({ method: "POST", body: JSON.stringify({ acao: "confirmar", permuta_id, servico }) });
}

export function decidirPermuta(permuta_id, deferir, servicos_conferidos, mensagens = {}) {
  return request({
    method: "POST",
    body: JSON.stringify({
      acao: "decidir", permuta_id, deferir, servicos_conferidos,
      mensagem_escalante: mensagens.mensagem_escalante || "",
      mensagem_policial_1: mensagens.mensagem_policial_1 || "",
      mensagem_policial_2: mensagens.mensagem_policial_2 || "",
    }),
  });
}

export function cancelarPermuta(permuta_id, justificativa = "") {
  return request({ method: "POST", body: JSON.stringify({ acao: "cancelar", permuta_id, justificativa }) });
}
