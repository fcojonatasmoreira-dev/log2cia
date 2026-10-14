const API = "/api/viaturas?recurso=areas-operacao";

async function request(url = API, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação com as áreas.");
  return data;
}

export async function listarAreasOperacao() {
  return request();
}

export async function criarAreaOperacao(dados) {
  return request(API, { method: "POST", body: JSON.stringify(dados) });
}

export async function atualizarAreaOperacao(id, dados) {
  return request(`${API}&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(dados),
  });
}
