export function filtrarPresencas(usuarios, filtros = {}) {
  const busca = String(filtros.busca || "").trim().toLocaleLowerCase("pt-BR");
  return (usuarios || []).filter((usuario) => {
    const texto = `${usuario.nome || ""} ${usuario.numeral || ""} ${usuario.matricula || ""}`.toLocaleLowerCase("pt-BR");
    return (!busca || texto.includes(busca))
      && (!filtros.situacao || usuario.situacao === filtros.situacao)
      && (!filtros.perfil || usuario.perfil === filtros.perfil)
      && (!filtros.unidade || usuario.unidade === filtros.unidade);
  });
}
