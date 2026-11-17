const API = "/api/cautelas";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || "Falha ao acessar as cautelas.");
  }

  return body;
}

// Buscar todas as cautelas com dados populados (Policiais + Itens + Equipamentos)
export async function getCautelas() {
  const { cautelas } = await request(`${API}?uso=lista`);
  return cautelas || [];
}

// Operações de escrita de cautelas. Toda a autorização é decidida no servidor,
// com a sessão e o papel do usuário; o navegador não acessa as tabelas.
export async function executarOperacaoCautela(operacao, dados = {}) {
  const { cautela, resultado } = await request(API, {
    method: "POST",
    body: JSON.stringify({ operacao, ...dados }),
  });
  return { cautela, resultado };
}
