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
