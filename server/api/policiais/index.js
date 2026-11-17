import { supabaseAdmin, usuarioAutenticado, normalizarRole, respostaErro, semSenha } from "../_server.js";
import { gerarSenhaTemporaria, hashSenha } from "../auth/_password.js";
import { definirCredencialMaster } from "../_credentialAudit.js";

const CAMPOS = [
  "nome_completo", "nome_guerra", "matricula", "posto_graduacao",
  "numeral", "role", "unidade", "status", "primeiro_acesso", "drso_escalante",
];
const CAMPOS_LEITURA = "id, nome_completo, nome_guerra, matricula, posto_graduacao, numeral, role, unidade, status, drso_escalante";
const ROLES_VALIDOS = ["master", "p4", "armeiro", "oficial", "p1", "p1_escalante_servico_ordinario", "policial", "permanente da guarda"];
const PERFIS_SISTEMA = [...ROLES_VALIDOS, "user"];

export function autorizarLeituraPoliciais(usuario, uso) {
  const role = normalizarRole(usuario);
  if (usuario?.is_master === true || role === "master") return true;
  if (uso === "proprio") return Boolean(usuario?.id);
  const permitidos = {
    gestao: ["p4", "armeiro", "oficial"],
    cautelas: ["p4", "armeiro", "oficial"],
    "nova-cautela": ["p4", "armeiro"],
    livro: ["p1", "permanente", "permanente da guarda", "armeiro", "oficial", "p1_escalante_servico_ordinario"],
    "banco-horas": ["p1", "oficial"],
    ativos: PERFIS_SISTEMA.filter((perfil) => perfil !== "master"),
  };
  return (permitidos[uso] || []).includes(role);
}

function validarDados(body, permitirRole) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const dados = {};
  for (const campo of CAMPOS) {
    if (campo === "role" && !permitirRole) continue;
    if (Object.prototype.hasOwnProperty.call(body, campo)) dados[campo] = body[campo];
  }
  if (Object.prototype.hasOwnProperty.call(body, "senha")) return null;
  if (Object.prototype.hasOwnProperty.call(body, "primeiro_acesso") &&
      typeof body.primeiro_acesso !== "boolean") return null;
  if (Object.prototype.hasOwnProperty.call(body, "drso_escalante") &&
      typeof body.drso_escalante !== "boolean") return null;
  for (const campo of CAMPOS) {
    if (["primeiro_acesso", "drso_escalante"].includes(campo)) continue;
    if (Object.prototype.hasOwnProperty.call(dados, campo)) {
      if (typeof dados[campo] !== "string") return null;
      dados[campo] = dados[campo].trim();
    }
  }
  if (Object.prototype.hasOwnProperty.call(dados, "role") && !ROLES_VALIDOS.includes(String(dados.role).trim().toLowerCase())) return null;
  if (Object.prototype.hasOwnProperty.call(dados, "role")) dados.role = String(dados.role).trim().toLowerCase();
  return dados;
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const db = supabaseAdmin();
    const role = normalizarRole(usuario);
    const ehMaster = role === "master" || usuario.is_master === true;

    if (req.method === "GET") {
      const uso = String(req.query?.uso || "gestao");
      if (!autorizarLeituraPoliciais(usuario, uso)) {
        return respostaErro(res, 403, "Você não tem permissão para consultar estes dados do efetivo.");
      }
      if (uso === "proprio") {
        return res.status(200).json({ policiais: [{
          id: usuario.id,
          nome_completo: usuario.nome_completo,
          nome_guerra: usuario.nome_guerra,
          matricula: usuario.matricula,
          posto_graduacao: usuario.posto_graduacao,
          numeral: usuario.numeral,
          role,
          unidade: usuario.unidade,
          status: usuario.status,
        }] });
      }
      if (uso === "ativos") {
        const { count, error } = await db.from("policiais").select("id", { count: "exact", head: true }).eq("status", "EM ATIVIDADE");
        if (error) throw error;
        return res.status(200).json({ count: count || 0 });
      }
      const campos = uso === "gestao"
        ? CAMPOS_LEITURA
        : "id, nome_completo, nome_guerra, matricula, posto_graduacao, numeral, unidade, status";
      const { data, error } = await db.from("policiais").select(campos).order("nome_guerra", { ascending: true });
      if (error) throw error;
      const policiais = (data || []).map((policial) => {
        const seguro = semSenha(policial);
        if (role === "oficial") delete seguro.role;
        if (!ehMaster) delete seguro.drso_escalante;
        return seguro;
      });
      return res.status(200).json({ policiais });
    }

    if (req.method === "POST") {
      if (!ehMaster && role !== "p4") return respostaErro(res, 403, "Sem permissão para cadastrar policiais.");
      const dados = validarDados(req.body, ehMaster);
      if (dados && !ehMaster) delete dados.drso_escalante;
      if (!dados || !dados.nome_completo || !dados.nome_guerra || !dados.matricula) {
        return respostaErro(res, 400, "Informe nome completo, nome de guerra e matrícula.");
      }
      if (!ehMaster) dados.role = "policial";
      if (!dados.role) dados.role = "policial";
      const senhaTemporaria = ehMaster ? gerarSenhaTemporaria() : null;
      dados.senha = null;
      dados.primeiro_acesso = true;
      dados.auth_version = 0;
      dados.credencial_provisionada = false;
      const { data, error } = await db.from("policiais").insert([dados]).select(CAMPOS_LEITURA).single();
      if (error) throw error;
      if (senhaTemporaria) {
        const provisionada = await definirCredencialMaster(db, {
          origem: "policiais", usuarioId: data.id, atorId: usuario.id,
          senhaHash: await hashSenha(senhaTemporaria), evento: "senha_inicial",
        });
        if (!provisionada) return respostaErro(res, 409, "Não foi possível provisionar a credencial. O cadastro permanece sem acesso; tente redefinir pelo Painel Master.");
      }
      const policial = semSenha(data);
      if (!ehMaster) delete policial.drso_escalante;
      return res.status(201).json({ policial, ...(senhaTemporaria ? { senhaTemporaria } : { credencialPendente: true }) });
    }

    return res.setHeader("Allow", "GET, POST").status(405).json({ error: "Método não permitido." });
  } catch (error) {
    if (["42703", "PGRST202", "PGRST204", "42883"].includes(error?.code)) {
      return respostaErro(res, 503, "O cadastro com provisionamento separado depende da migração manual pendente.");
    }
    console.error("Erro na API de policiais:", error.message);
    return res.status(500).json({ error: "Não foi possível concluir a operação." });
  }
}
