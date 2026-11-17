export function numeroOficio(numero, ano, ehEvento = false) {
  const sequencial = String(numero).padStart(3, "0");
  return `${ehEvento ? "EVT-" : ""}${sequencial}/${ano}`;
}

export async function obterProximoNumero(db, ano, tipo = "interno") {
  let query = db.from("oficios").select("numero_sequencial").eq("ano", ano);
  query = tipo === "evento"
    ? query.not("solicitacao_evento_id", "is", null)
    : query.is("solicitacao_evento_id", null);
  const { data, error } = await query.order("numero_sequencial", { ascending: true });
  if (error) throw error;

  let esperado = 1;
  for (const item of data || []) {
    const numero = Number(item.numero_sequencial);
    if (numero < esperado) continue;
    if (numero > esperado) break;
    esperado += 1;
  }
  return esperado;
}

export function conflitoDeNumero(error) {
  if (error?.code !== "23505") return false;
  const identificacao = [error.constraint, error.message, error.details, error.detail]
    .filter(Boolean)
    .join(" ");
  return /numero_sequencial|numero.{0,20}ano|ano.{0,20}numero/i.test(identificacao);
}
