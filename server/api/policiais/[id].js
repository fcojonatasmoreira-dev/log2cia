import { supabaseAdmin, usuarioAutenticado, normalizarRole, respostaErro, semSenha } from "../_server.js";

const CAMPOS = ["nome_completo", "nome_guerra", "matricula", "posto_graduacao", "numeral", "role", "unidade", "status", "drso_escalante"];
const ROLES_VALIDOS = ["master", "p4", "armeiro", "oficial", "p1", "p1_escalante_servico_ordinario", "policial", "permanente", "permanente da guarda"];

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const db = supabaseAdmin();
    const role = normalizarRole(usuario);
    const ehMaster = role === "master" || usuario.is_master === true;
    const id = String(req.query?.id || "").trim();
    if (!id) return respostaErro(res, 400, "Identificador do policial inválido.");

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!ehMaster && role !== "p4") return respostaErro(res, 403, "Sem permissão para editar policiais.");
      const { data: alvo, error: alvoError } = await db.from("policiais").select("id, role, drso_escalante").eq("id", id).maybeSingle();
      if (alvoError) throw alvoError;
      if (!alvo) return respostaErro(res, 404, "Policial não encontrado.");
      const roleAlvo = normalizarRole(alvo);
      if (!ehMaster && role === "p4" && ["master", "p4"].includes(roleAlvo)) return respostaErro(res, 403, "Usuários P4 não podem editar perfis Master ou P4.");
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || "senha" in body || "primeiro_acesso" in body) {
        return respostaErro(res, 400, "Dados de atualização inválidos.");
      }
      if (ehMaster && Object.prototype.hasOwnProperty.call(body, "role")
        && typeof body.role === "string" && body.role.trim().toLowerCase() !== roleAlvo) {
        return respostaErro(res, 409, "Alterações de perfil devem ser feitas pela gestão de usuários do Painel Master.");
      }
      if (Object.prototype.hasOwnProperty.call(body, "drso_escalante") && typeof body.drso_escalante !== "boolean") return respostaErro(res, 400, "Dados de atualização inválidos.");
      for (const campo of CAMPOS) {
        if (["drso_escalante"].includes(campo) || !Object.prototype.hasOwnProperty.call(body, campo)) continue;
        if (typeof body[campo] !== "string") return respostaErro(res, 400, "Dados de atualização inválidos.");
        if (campo === "role" && ehMaster && !ROLES_VALIDOS.includes(body[campo].trim().toLowerCase())) return respostaErro(res, 400, "Perfil inválido.");
      }
      const dados = {};
      for (const campo of CAMPOS) {
        if (Object.prototype.hasOwnProperty.call(body, campo)) {
          if (campo === "role") continue;
          if (campo === "drso_escalante" && !ehMaster) continue;
          dados[campo] = typeof body[campo] === "string" ? body[campo].trim() : body[campo];
        }
      }
      if (!ehMaster) delete dados.role;
      if (Object.keys(dados).length === 0) return respostaErro(res, 400, "Nenhum campo permitido para atualização.");
      const camposResposta = "id, nome_completo, nome_guerra, matricula, posto_graduacao, numeral, role, unidade, status" + (ehMaster ? ", drso_escalante" : "");
      const { data, error } = await db.from("policiais").update(dados).eq("id", id).select(camposResposta).single();
      if (error) throw error;
      return res.status(200).json({ policial: semSenha(data) });
    }

    if (req.method === "DELETE") {
      if (!ehMaster) return respostaErro(res, 403, "Somente o perfil Master pode excluir policiais.");
      const { error } = await db.from("policiais").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.setHeader("Allow", "PATCH, PUT, DELETE").status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Erro na API de policiais:", error.message);
    return res.status(500).json({ error: "Não foi possível concluir a operação." });
  }
}
