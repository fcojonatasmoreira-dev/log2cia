export function chaveContextoSessao(usuario) {
  if (!usuario?.id) return "anonimo";
  return JSON.stringify([
    usuario.id,
    usuario.role || "",
    usuario.modo_acesso || "",
    usuario.tipo_acesso || "",
    usuario.is_master === true,
    usuario.auth_version ?? "",
    usuario.permissoes || {},
    usuario.drso_escalante === true,
  ]);
}
