const ADMINISTRADORES_BANCO_HORAS = new Set(["master", "p1", "oficial"]);

function normalizarRole(usuario) {
  return String(usuario?.role || "").trim().toLowerCase();
}

function ehMaster(usuario, role) {
  return role === "master" || usuario?.is_master === true;
}

export function telaBancoHoras(usuario) {
  const role = normalizarRole(usuario);
  const master = ehMaster(usuario, role);
  const modosDisponiveis = usuario?.modos_disponiveis;

  if (usuario?.modo_acesso === "policial") {
    if (role === "oficial" || (Array.isArray(modosDisponiveis) && !modosDisponiveis.includes("policial"))) {
      return "indisponivel";
    }
    return "pessoal";
  }

  if (usuario?.modo_acesso === "administrativo") {
    if (Array.isArray(modosDisponiveis) && !modosDisponiveis.includes("administrativo")) {
      return "indisponivel";
    }
    return master || ADMINISTRADORES_BANCO_HORAS.has(role) ? "gestao" : "indisponivel";
  }

  // Compatibilidade com objetos de sessão antigos, sem modo explícito.
  return master || ADMINISTRADORES_BANCO_HORAS.has(role) ? "gestao" : "pessoal";
}

export function podeAcessarNovaInsercaoBancoHoras(usuario) {
  const role = normalizarRole(usuario);
  const noModoAdministrativo = usuario?.modo_acesso === "administrativo";
  const semModoLegado = !usuario?.modo_acesso;
  return (noModoAdministrativo || semModoLegado)
    && (ehMaster(usuario, role) || role === "p1");
}
