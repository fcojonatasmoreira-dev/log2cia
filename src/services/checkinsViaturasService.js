const API = "/api/viaturas?recurso=checkins";

async function request(options = {}) {
  const response = await fetch(API, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

export function carregarControleViaturas() { return request(); }
export function registrarMovimentacao(dados) { return request({ method: "POST", body: JSON.stringify(dados) }); }
