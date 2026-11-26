const ROLE_POLICIAL = "policial";
const ROLE_OFICIAL = "oficial";

export const MODOS_ACESSO = Object.freeze({
  ADMINISTRATIVO: "administrativo",
  POLICIAL: "policial",
});

const ROLES_DUAIS = new Set([
  "master",
  "p1",
  "p1_escalante_servico_ordinario",
  "p4",
  "armeiro",
  "permanente",
  "permanente da guarda",
]);

export function normalizarPerfil(usuario) {
  return String(usuario?.role || "").trim().toLowerCase();
}

export function modosDisponiveis(usuario) {
  const role = normalizarPerfil(usuario);
  if (usuario?.tipo_acesso === "drso_externo") return [];
  if (role === ROLE_OFICIAL) return [MODOS_ACESSO.ADMINISTRATIVO];
  if (role === "master" || usuario?.is_master === true) {
    return [MODOS_ACESSO.ADMINISTRATIVO, MODOS_ACESSO.POLICIAL];
  }
  if (role === ROLE_POLICIAL) return [MODOS_ACESSO.POLICIAL];
  if (ROLES_DUAIS.has(role)) {
    return [MODOS_ACESSO.ADMINISTRATIVO, MODOS_ACESSO.POLICIAL];
  }
  // Perfis legados/desconhecidos mantêm a autorização atual, sem ganhar a
  // possibilidade de alternar até serem classificados explicitamente.
  return [MODOS_ACESSO.ADMINISTRATIVO];
}

export function modoInicial(usuario) {
  return normalizarPerfil(usuario) === ROLE_POLICIAL && usuario?.is_master !== true
    ? MODOS_ACESSO.POLICIAL
    : MODOS_ACESSO.ADMINISTRATIVO;
}

export function modoEfetivo(usuario, sessao) {
  const modos = modosDisponiveis(usuario);
  const modo = sessao?.modo ?? modoInicial(usuario);
  if (!modos.includes(modo)) return null;
  return modo;
}

export function usuarioNoModo(usuario, modo) {
  const modos = modosDisponiveis(usuario);
  if (!modos.includes(modo)) return null;
  const policial = modo === MODOS_ACESSO.POLICIAL;
  return {
    ...usuario,
    role: policial ? ROLE_POLICIAL : usuario.role,
    ...(policial ? { is_master: false, drso_escalante: false, permissoes: undefined } : {}),
    modo_acesso: modo,
    modos_disponiveis: modos,
  };
}

export function usuarioDaSessao(usuario, sessao) {
  const modo = modoEfetivo(usuario, sessao);
  return modo ? usuarioNoModo(usuario, modo) : null;
}
