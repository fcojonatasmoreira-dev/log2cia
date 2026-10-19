const API = "/api/viaturas?recurso=checkins";

async function request(options = {}, url = API) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

export function carregarControleViaturas() { return request(); }
export function carregarHistoricoOcorrenciasViatura(viaturaId, pagina = 1) {
  const parametros = new URLSearchParams({ historico_viatura_id: viaturaId, pagina: String(pagina) });
  return request({}, `${API}&${parametros.toString()}`);
}
export function registrarMovimentacao(dados) { return request({ method: "POST", body: JSON.stringify(dados) }); }
