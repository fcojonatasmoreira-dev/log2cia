const API = "/api/credenciais";

async function request(options = {}) {
  const response = await fetch(API, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao acessar a gestão de credenciais.");
  return body;
}

export function listarGestaoCredenciais() {
  return request({ method: "GET" });
}

export function resetarCredencial(usuario) {
  return request({
    method: "POST",
    body: JSON.stringify({ id: usuario.id, origem: usuario.origem }),
  });
}
