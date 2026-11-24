const API = "/api/banco-horas";

async function request(options = {}) {
  const { url = API, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao acessar o Banco de Horas.");
  return body;
}

export async function listarBancoHoras() {
  return request();
}

export async function listarDispensasDeferidasCalendario(policialIds, dataInicio, dataFim) {
  const ids = [...new Set((policialIds || []).filter(Boolean))];
  if (!ids.length) return { dispensas: [] };
  const lotes = [];
  for (let inicio = 0; inicio < ids.length; inicio += 25) lotes.push(ids.slice(inicio, inicio + 25));
  const respostas = await Promise.all(lotes.map((lote) => {
    const parametros = new URLSearchParams({
      uso: "permutas-calendario",
      policiais_ids: lote.join(","),
      data_inicio: dataInicio,
      data_fim: dataFim,
    });
    return request({ method: "GET", url: `${API}?${parametros}` });
  }));
  return { dispensas: respostas.flatMap((resposta) => resposta.dispensas || []) };
}

export async function analisarSolicitacaoBancoHoras(solicitacaoId, status, parecer) {
  return request({
    method: "PATCH",
    body: JSON.stringify({ solicitacao_id: solicitacaoId, status, parecer }),
  });
}
