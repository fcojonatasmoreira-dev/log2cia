import { gerarSenhaTemporaria, hashSenha } from "./auth/_password.js";
import { carregarHistoricoCredenciais, definirCredencialMaster, tabelaCredenciaisIndisponivel } from "./_credentialAudit.js";
import { normalizarRole, respostaErro, supabaseAdmin, usuarioAutenticado } from "./_server.js";

const FONTES = {
  policiais: { tabela: "policiais", nome: "policiais" },
  drso_policiais_externos: { tabela: "drso_policiais_externos", nome: "drso_policiais_externos" },
};
const ehMaster = (usuario) => normalizarRole(usuario) === "master" || usuario?.is_master === true;
const camposPoliciais = "id,nome_completo,nome_guerra,matricula,posto_graduacao,role,status,senha,primeiro_acesso,credencial_provisionada,auth_version";
const camposDrso = "id,nome_completo,nome_guerra,matricula,posto_graduacao,tipo,unidade_origem,ativo,senha,primeiro_acesso,credencial_provisionada,auth_version";

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    if (!ehMaster(usuario)) return respostaErro(res, 403, "Somente o Master pode administrar credenciais.");

    const db = supabaseAdmin();
    if (req.method === "GET") return await listarCredenciais(db, res);
    if (req.method === "POST") return await resetarCredencial(db, req, res, usuario);
    res.setHeader("Allow", "GET, POST");
    return respostaErro(res, 405, "Método não permitido.");
  } catch (error) {
    if (["42703", "PGRST202", "PGRST204", "PGRST200", "42883"].includes(error?.code)) {
      return respostaErro(res, 503, "A gestão de credenciais depende da migração manual ainda não aplicada.");
    }
    console.error("Erro na API de gestão de credenciais:", error?.code || "erro interno");
    return respostaErro(res, 500, "Não foi possível consultar ou alterar as credenciais.");
  }
}

async function listarCredenciais(db, res) {
  const [policiaisResult, externosResult] = await Promise.all([
    db.from(FONTES.policiais.tabela).select(camposPoliciais).order("nome_guerra"),
    db.from(FONTES.drso_policiais_externos.tabela).select(camposDrso).order("nome_guerra"),
  ]);
  if (policiaisResult.error) throw policiaisResult.error;
  if (externosResult.error) throw externosResult.error;

  const usuarios = [
    ...(policiaisResult.data || []).map((row) => ({ ...row, origem: "policiais" })),
    ...(externosResult.data || []).map((row) => ({ ...row, origem: "drso_policiais_externos" })),
  ];
  let historico = new Map();
  let historicoDisponivel = true;
  try {
    historico = await carregarHistoricoCredenciais(db, usuarios);
  } catch (error) {
    if (!tabelaCredenciaisIndisponivel(error)) throw error;
    historicoDisponivel = false;
  }

  const usuariosSeguros = usuarios.map((row) => {
    const evento = historico.get(`${row.origem}:${row.id}`) || {};
    const temSenha = typeof row.senha === "string" && row.senha.trim().length > 0;
    return {
      id: row.id,
      origem: row.origem,
      nome_completo: row.nome_completo,
      nome_guerra: row.nome_guerra,
      matricula: row.matricula,
      posto_graduacao: row.posto_graduacao,
      role: row.role || (row.origem === "drso_policiais_externos" ? `DRSO externo · ${row.tipo || "policial"}` : "policial"),
      status: row.origem === "drso_policiais_externos"
        ? (row.ativo === false ? "INATIVO" : "ATIVO")
        : (row.status || "Não informado"),
      temSenha,
      credencialProvisionada: row.credencial_provisionada !== false,
      primeiroAcesso: row.primeiro_acesso === true,
      ultimoLogin: evento.ultimoLogin || null,
      ultimaAlteracaoSenha: evento.ultimaAlteracaoSenha || null,
    };
  }).sort((a, b) => String(a.nome_guerra || a.nome_completo || "").localeCompare(String(b.nome_guerra || b.nome_completo || ""), "pt-BR"));

  const resumo = {
    total: usuariosSeguros.length,
    porOrigem: {
      policiais: usuariosSeguros.filter((usuario) => usuario.origem === "policiais").length,
      drso_policiais_externos: usuariosSeguros.filter((usuario) => usuario.origem === "drso_policiais_externos").length,
    },
    semSenha: usuariosSeguros.filter((usuario) => !usuario.temSenha).length,
    primeiroAcessoPendente: usuariosSeguros.filter((usuario) => usuario.primeiroAcesso).length,
    credenciaisCadastradas: usuariosSeguros.filter((usuario) => usuario.temSenha).length,
  };
  return res.status(200).json({ usuarios: usuariosSeguros, resumo, historicoDisponivel });
}

async function resetarCredencial(db, req, res, usuario) {
  const origem = req.body?.origem;
  const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
  const fonte = FONTES[origem];
  if (!fonte || !id || id.length > 100) return respostaErro(res, 400, "Usuário ou origem inválidos.");

  const senhaTemporaria = gerarSenhaTemporaria();
  const atualizado = await definirCredencialMaster(db, {
    origem,
    usuarioId: id,
    atorId: usuario.id,
    senhaHash: await hashSenha(senhaTemporaria),
    evento: "reset_admin",
  });
  if (!atualizado) return respostaErro(res, 409, "As credenciais foram alteradas. Atualize a lista e tente novamente.");

  return res.status(200).json({ ok: true, senhaTemporaria });
}
