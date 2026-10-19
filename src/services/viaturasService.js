const API = "/api/viaturas";

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação com a viatura.");
  }
  return data;
}

export async function listarViaturas() {
  return request(API);
}

export async function listarHistoricoOperacionalViaturas(filtros = {}) {
  const parametros = new URLSearchParams({ recurso: "historico-operacional-viaturas" });
  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor !== null && valor !== undefined && valor !== "") parametros.set(chave, String(valor));
  });
  return request(`${API}?${parametros.toString()}`);
}

export async function criarLinkChecklistViatura(checkinId) {
  const parametros = new URLSearchParams({ recurso: "checklist-link" });
  return request(`${API}?${parametros.toString()}`, {
    method: "POST",
    body: JSON.stringify({ checkin_id: checkinId, etapa: "completo" }),
  });
}

export async function excluirRegistroHistoricoViaturas(tipo, id, etapa = null) {
  const parametros = new URLSearchParams({ recurso: "historico-operacional-viaturas" });
  return request(`${API}?${parametros.toString()}`, {
    method: "DELETE",
    body: JSON.stringify({ tipo, id, ...(etapa ? { etapa } : {}) }),
  });
}

export async function listarAcompanhamentosOcorrencia(ocorrenciaId) {
  const parametros = new URLSearchParams({ recurso: "ocorrencia-acompanhamentos", ocorrencia_id: ocorrenciaId });
  return request(`${API}?${parametros.toString()}`);
}

export async function registrarAcompanhamentoOcorrencia(ocorrenciaId, dados) {
  const parametros = new URLSearchParams({ recurso: "ocorrencia-acompanhamentos", ocorrencia_id: ocorrenciaId });
  return request(`${API}?${parametros.toString()}`, { method: "POST", body: JSON.stringify(dados) });
}

export async function criarViatura(dados) {
  return request(API, {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

export async function atualizarViatura(id, dados) {
  return request(`${API}?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(dados),
  });
}

export async function excluirViatura(id) {
  return request(`${API}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
