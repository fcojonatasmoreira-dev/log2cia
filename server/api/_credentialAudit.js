const EVENTOS_CREDENCIAIS = "credential_audit_events";

export async function definirCredencialMaster(db, { origem, usuarioId, atorId, senhaHash, evento }) {
  const { data, error } = await db.rpc("master_set_credential", {
    p_origem: origem,
    p_usuario_id: String(usuarioId),
    p_ator_id: String(atorId),
    p_senha_hash: senhaHash,
    p_evento: evento,
  });
  if (error) throw error;
  const atualizado = Array.isArray(data) ? data[0] : data;
  if (!atualizado?.id) return null;
  return atualizado;
}

export async function registrarEventoCredencial(db, { origem, usuarioId, evento }) {
  const { error } = await db.from(EVENTOS_CREDENCIAIS).insert({
    origem,
    usuario_id: String(usuarioId),
    evento,
  });
  if (error) throw error;
}

export async function carregarHistoricoCredenciais(db, usuarios) {
  const historico = new Map();
  const origens = ["policiais", "drso_policiais_externos"];
  for (const origem of origens) {
    const ids = usuarios.filter((usuario) => usuario.origem === origem).map((usuario) => String(usuario.id));
    if (!ids.length) continue;
    const { data, error } = await db.rpc("credential_audit_latest", {
      p_origem: origem,
      p_usuario_ids: ids,
    });
    if (error) throw error;
    for (const evento of data || []) {
      historico.set(`${origem}:${evento.usuario_id}`, {
        ultimoLogin: evento.ultimo_login || null,
        ultimaAlteracaoSenha: evento.ultima_alteracao_senha || null,
      });
    }
  }
  return historico;
}

export function tabelaCredenciaisIndisponivel(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
