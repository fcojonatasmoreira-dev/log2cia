export function podeConsultarCalendario(usuario) {
  const role = String(usuario?.role || "").trim().toLowerCase();
  return role === "master" || usuario?.is_master === true
    || ["oficial", "p1", "p1_escalante_servico_ordinario"].includes(role);
}

export function podeConsultarCalendarioProprio(usuario) {
  const role = String(usuario?.role || "").trim().toLowerCase();
  return Boolean(usuario?.id) && (
    usuario?.is_master === true
    || ["policial", "p1", "p1_escalante_servico_ordinario", "oficial", "master"].includes(role)
  );
}

export function podeAtualizarControleEscala(usuario) {
  const role = String(usuario?.role || "").trim().toLowerCase();
  return usuario?.is_master === true || ["p1", "p1_escalante_servico_ordinario", "master"].includes(role);
}

export function obterIdsMiniCalendariosAbertos(permutas, calendariosAbertos, { usuarioId, podeConsultarGeral }) {
  const ids = new Set();
  for (const permuta of permutas || []) {
    for (const policialId of [permuta.solicitante_id, permuta.destinatario_id]) {
      if (!policialId || (!podeConsultarGeral && policialId !== usuarioId)) continue;
      if (calendariosAbertos?.[`${permuta.id}:${policialId}`]) ids.add(policialId);
    }
  }
  return [...ids].sort();
}

export function alternarEstadoLinhaPermuta(linhasAbertas, permutaId) {
  return { ...linhasAbertas, [permutaId]: !linhasAbertas?.[permutaId] };
}

export function podeDecidirPermuta(usuario, status) {
  const role = String(usuario?.role || "").trim().toLowerCase();
  const podeAdministrar = role === "oficial" || role === "master" || usuario?.is_master === true;
  return podeAdministrar && status === "AGUARDANDO_ANALISE";
}

export function podeCancelarPermuta(usuario, permuta) {
  const role = String(usuario?.role || "").trim().toLowerCase();
  const podeAdministrar = role === "oficial" || role === "master" || usuario?.is_master === true;
  if (podeAdministrar && permuta?.status === "DEFERIDA") return true;
  return usuario?.id === permuta?.solicitante_id
    && ["AGUARDANDO_CONFIRMACAO", "AGUARDANDO_ANALISE"].includes(permuta?.status);
}

export function atualizarStatusPermuta(permutas, permutaId, status) {
  return permutas.map((permuta) => permuta.id === permutaId ? { ...permuta, status } : permuta);
}
