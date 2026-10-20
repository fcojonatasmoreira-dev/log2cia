const API = "/api/oficios?recurso=eventos";

async function request(options = {}) {
  const response = await fetch(API, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Não foi possível concluir a operação de eventos.");
    error.camposInvalidos = Array.isArray(data.campos_invalidos) ? data.campos_invalidos : [];
    throw error;
  }
  return data;
}

export async function solicitarEvento(dados) {
  return request({ method: "POST", body: JSON.stringify({ ...dados, acao: "solicitar" }) });
}

export async function pesquisarEnderecoEvento(endereco, { signal, autocomplete = false } = {}) {
  return request({ method: "POST", signal, body: JSON.stringify({ acao: "pesquisar_endereco", endereco, autocomplete }) });
}

export async function obterConfiguracaoGeocodificacaoEvento() {
  return request({ method: "POST", body: JSON.stringify({ acao: "configurar_geocodificacao" }) });
}

export async function listarSolicitacoesEventos() {
  return request({ method: "GET" });
}

export async function atualizarEvento(acao, dados) {
  return request({ method: "PATCH", body: JSON.stringify({ ...dados, acao }) });
}

export async function comentarEvento(dados) {
  return request({ method: "POST", body: JSON.stringify({ ...dados, acao: "comentar" }) });
}

export async function registrarOficioExternoEvento(dados) {
  return request({ method: "POST", body: JSON.stringify({ ...dados, acao: "registrar_oficio_externo" }) });
}

export async function excluirEvento(dados) {
  return request({ method: "POST", body: JSON.stringify({ ...dados, acao: "excluir" }) });
}
