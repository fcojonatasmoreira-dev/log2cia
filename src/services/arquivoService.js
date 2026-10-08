const API = "/api/arquivo";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao acessar o gerenciamento do arquivo.");
  return body;
}

export async function getEstruturaArquivo() {
  return request(API);
}

export async function criarItemArquivo(tipo, nome, parentId = null) {
  return request(API, {
    method: "POST",
    body: JSON.stringify({ tipo, nome, parent_id: parentId }),
  });
}

export async function atualizarItemArquivo(tipo, id, dados) {
  return request(API, {
    method: "PATCH",
    body: JSON.stringify({ tipo, id, ...dados }),
  });
}
