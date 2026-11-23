export function normalizarTextoPolicial(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizarPosto(valor) {
  return normalizarTextoPolicial(valor).toUpperCase()
    .replace(/[º°]/g, "")
    .replace(/\bSGT\b/g, "SARGENTO")
    .replace(/\bTEN\b/g, "TENENTE")
    .replace(/\bST\b/g, "SUBTENENTE")
    .replace(/\bCB\b/g, "CABO")
    .replace(/\bSD\b/g, "SOLDADO")
    .replace(/\bASP\b/g, "ASPIRANTE")
    .replace(/\bCEL\b/g, "CORONEL")
    .replace(/\bMAJ\b/g, "MAJOR")
    .replace(/\bTC\b/g, "TENENTE CORONEL")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pesoHierarquiaPolicial(posto) {
  const valor = normalizarPosto(posto);
  if (valor.includes("CORONEL") && !valor.includes("TENENTE")) return 1;
  if (valor.includes("TENENTE CORONEL")) return 2;
  if (valor.includes("MAJOR")) return 3;
  if (valor.includes("CAPITAO") || valor === "CAP") return 4;
  if (valor.includes("1 TENENTE") || valor.includes("PRIMEIRO TENENTE")) return 5;
  if (valor.includes("2 TENENTE") || valor.includes("SEGUNDO TENENTE")) return 6;
  if (valor.includes("ASPIRANTE")) return 7;
  if (valor.includes("SUBTENENTE")) return 8;
  if (valor.includes("1 SARGENTO") || valor.includes("PRIMEIRO SARGENTO")) return 9;
  if (valor.includes("2 SARGENTO") || valor.includes("SEGUNDO SARGENTO")) return 10;
  if (valor.includes("3 SARGENTO") || valor.includes("TERCEIRO SARGENTO")) return 11;
  if (valor.includes("CABO")) return 12;
  if (valor.includes("SOLDADO")) return 13;
  return 99;
}

export function ehPostoOficial(posto) {
  return pesoHierarquiaPolicial(posto) <= 7;
}

function numeralPolicial(valor) {
  const numeral = String(valor ?? "").match(/\d+/)?.[0];
  return numeral == null ? Number.POSITIVE_INFINITY : Number(numeral);
}

export function ordenarPoliciaisHierarquicamente(policiais) {
  return [...(policiais || [])].sort((a, b) =>
    pesoHierarquiaPolicial(a?.posto_graduacao) - pesoHierarquiaPolicial(b?.posto_graduacao)
    || numeralPolicial(a?.numeral) - numeralPolicial(b?.numeral)
    || String(a?.nome_guerra || a?.nome_completo || "").localeCompare(String(b?.nome_guerra || b?.nome_completo || ""), "pt-BR"));
}

export function formatarIdentificacaoPolicial(policial) {
  if (!policial) return "Policial não localizado";
  const posto = String(policial.posto_graduacao || "").trim();
  const numeral = String(policial.numeral || "").trim();
  const nome = String(policial.nome_guerra || "").trim();
  const identificacao = [posto, numeral].filter(Boolean).join(" ");
  return `${identificacao ? `${identificacao} – ` : ""}${nome || "Nome de guerra não informado"}`;
}

export function filtrarPoliciaisPorBusca(policiais, { busca = "" } = {}) {
  const termo = normalizarTextoPolicial(busca);
  const filtrados = (policiais || []).filter((policial) => {
    if (!policial?.id) return false;
    if (!termo) return true;
    return [policial.nome_guerra, policial.numeral, policial.posto_graduacao]
      .some((valor) => normalizarTextoPolicial(valor).includes(termo));
  });
  return ordenarPoliciaisHierarquicamente(filtrados);
}

export function filtrarPoliciaisSubstitutos(policiais, { usuarioId, busca = "" } = {}) {
  return filtrarPoliciaisPorBusca(policiais, { busca }).filter((policial) =>
    policial.id !== usuarioId
    && !ehPostoOficial(policial.posto_graduacao)
    && (!policial.status || policial.status === "EM ATIVIDADE"));
}
