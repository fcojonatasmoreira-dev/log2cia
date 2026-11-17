const API = "/api/policiais";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao acessar policiais.");
  return body;
}

export async function getPoliciais({ uso = "gestao" } = {}) {
  const query = new URLSearchParams({ uso });
  const { policiais } = await request(`${API}?${query}`);
  return policiais;
}

export function getPoliciaisBancoHoras() {
  return getPoliciais({ uso: "banco-horas" });
}

export async function getContagemPoliciaisAtivos() {
  const { count } = await request(`${API}?uso=ativos`);
  return count;
}

export async function createPolicial(policialData) {
  return request(API, { method: "POST", body: JSON.stringify(policialData) });
}

export async function updatePolicial(id, policialData) {
  const { policial } = await request(`${API}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(policialData),
  });
  return policial;
}

export async function deletePolicial(id) {
  await request(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function resetarSenhaPolicial(id) {
  return request(`${API}/${encodeURIComponent(id)}/reset-senha`, {
    method: "POST",
    body: "{}",
  });
}

export async function getCautelasPolicial(id) {
  const { cautelas } = await request(`${API}/${encodeURIComponent(id)}/cautelas`);
  return cautelas;
}
