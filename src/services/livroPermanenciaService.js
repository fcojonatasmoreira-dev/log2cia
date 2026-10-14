const API = "/api/viaturas?recurso=livro-permanencia";

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
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação do Livro da Permanência.");
  }
  return data;
}

export async function listarLivrosPermanencia() {
  return request();
}

export async function carregarItensLivro(livroId) {
  return request(`${API}&acao=itens&livro_id=${encodeURIComponent(livroId)}`);
}

export async function criarLivroPermanencia(livro, viaturas, ocorrencias) {
  return request(API, {
    method: "POST",
    body: JSON.stringify({ livro, viaturas, ocorrencias }),
  });
}

export async function clonarLivroPermanencia(livro, viaturas, ocorrencias) {
  return request(API, {
    method: "POST",
    body: JSON.stringify({ acao: "clonar", livro, viaturas, ocorrencias }),
  });
}

export async function atualizarLivroPermanencia(id, livro, viaturas, ocorrencias) {
  return request(`${API}&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ livro, viaturas, ocorrencias }),
  });
}

export async function reabrirLivroPermanencia(id) {
  return request(`${API}&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ acao: "reabrir" }),
  });
}

export async function excluirLivroPermanencia(id) {
  return request(`${API}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
