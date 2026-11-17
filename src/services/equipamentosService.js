const API = "/api/equipamentos";

async function request(url = API, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao acessar equipamentos.");
  return body;
}

export async function getEquipamentos({ disponiveis = false } = {}) {
  const query = disponiveis ? "?disponiveis=true" : "";
  const { equipamentos } = await request(`${API}${query}`);
  return equipamentos;
}

export async function buscarEquipamento(id) {
  const query = new URLSearchParams({ id });
  const { equipamento } = await request(`${API}?${query}`);
  return equipamento;
}

export async function pesquisarEquipamentos(termo) {
  const query = new URLSearchParams({ q: termo });
  const { equipamento } = await request(`${API}?${query}`);
  return equipamento;
}

export async function createEquipamento(equipamentoData) {
  const { equipamento } = await request(API, {
    method: "POST",
    body: JSON.stringify(equipamentoData),
  });
  return equipamento;
}

export async function updateEquipamento(id, equipamentoData) {
  const query = new URLSearchParams({ id });
  const { equipamento } = await request(`${API}?${query}`, {
    method: "PATCH",
    body: JSON.stringify(equipamentoData),
  });
  return equipamento;
}

export async function deleteEquipamento(id) {
  const query = new URLSearchParams({ id });
  return request(`${API}?${query}`, { method: "DELETE" });
}

// Envia a imagem pelo servidor: o bucket é privado e o navegador não possui
// credencial de escrita. O retorno traz o caminho interno e a URL assinada.
export async function enviarImagemEquipamento(arquivo, prefixo) {
  const conteudo = await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ""));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });

  const { path, url } = await request(`${API}?acao=imagem`, {
    method: "POST",
    body: JSON.stringify({ prefixo, conteudo }),
  });

  return { path, url };
}
