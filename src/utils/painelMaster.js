export function situacaoCredencialUsuario(usuario = {}) {
  if (!usuario.credencialProvisionada) return "nao_provisionada";
  if (!usuario.temSenha) return "sem_senha";
  if (usuario.primeiroAcesso) return "primeiro_acesso";
  return "ativa";
}

export function filtrarUsuariosMaster(usuarios, filtros = {}) {
  const termo = String(filtros.busca || "").trim().toLocaleLowerCase("pt-BR");
  return (usuarios || []).filter((usuario) => {
    const texto = `${usuario.nome_completo || ""} ${usuario.nome_guerra || ""} ${usuario.numeral || ""} ${usuario.matricula || ""}`.toLocaleLowerCase("pt-BR");
    return (!termo || texto.includes(termo))
      && (!filtros.perfil || usuario.role === filtros.perfil)
      && (!filtros.conta || (usuario.contaSuspensa ? "suspensa" : "ativa") === filtros.conta)
      && (!filtros.credencial || situacaoCredencialUsuario(usuario) === filtros.credencial);
  });
}
