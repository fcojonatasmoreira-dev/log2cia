const API = "/api/oficios";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao acessar os Ofícios.");
  return body;
}

export async function getOficios({ busca = "", data = "", ano = "", estante_id = "", coluna_id = "", pasta_id = "" } = {}) {
  const params = new URLSearchParams();
  if (busca) params.set("busca", busca);
  if (data) params.set("data", data);
  if (ano) params.set("ano", ano);
  if (estante_id) params.set("estante_id", estante_id);
  if (coluna_id) params.set("coluna_id", coluna_id);
  if (pasta_id) params.set("pasta_id", pasta_id);
  const query = params.toString();
  return request(`${API}${query ? `?${query}` : ""}`);
}

export async function createOficio(dados) {
  const { oficio } = await request(API, {
    method: "POST",
    body: JSON.stringify(dados),
  });
  return oficio;
}

export async function updateOficio(id, dados) {
  const { oficio } = await request(`${API}?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(dados),
  });
  return oficio;
}

export async function deleteOficio(id) {
  await request(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
