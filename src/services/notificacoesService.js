const API = "/api/notificacoes";

async function request(options = {}) {
  const response = await fetch(API, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar as notificações.");
  return data;
}

export async function listarNotificacoes() {
  const resultado = await request();
  return { notificacoes: resultado.notificacoes || [], nao_lidas: resultado.nao_lidas || 0 };
}

export function marcarNotificacaoLida(id) {
  return request({ method: "PATCH", body: JSON.stringify({ acao: "marcar_lida", id }) });
}

export function marcarTodasNotificacoesLidas() {
  return request({ method: "PATCH", body: JSON.stringify({ acao: "marcar_todas_lidas" }) });
}
