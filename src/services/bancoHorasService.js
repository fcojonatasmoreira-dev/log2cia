const API = "/api/banco-horas";

async function request(options = {}) {
  const response = await fetch(API, {
    ...options,
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

export async function analisarSolicitacaoBancoHoras(solicitacaoId, status, parecer) {
  return request({
    method: "PATCH",
    body: JSON.stringify({ solicitacao_id: solicitacaoId, status, parecer }),
  });
}
