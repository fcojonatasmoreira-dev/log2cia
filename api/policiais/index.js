import { supabaseAdmin, usuarioAutenticado, normalizarRole, respostaErro, semSenha } from "../_server.js";

const CAMPOS = [
  "nome_completo", "nome_guerra", "matricula", "posto_graduacao",
  "numeral", "role", "unidade", "status", "primeiro_acesso",
];

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
  return dados;
}

export default async function handler(req, res) {
  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;
    const db = supabaseAdmin();
    const role = normalizarRole(usuario);

    if (req.method === "GET") {
      const { data, error } = await db.from("policiais").select("*").order("nome_guerra", { ascending: true });
      if (error) throw error;
      const policiais = (data || []).map(semSenha);
      if (role === "oficial") {
        policiais.forEach((policial) => {
          delete policial.role;
        });
      }
      return res.status(200).json({ policiais });
    }

    if (req.method === "POST") {
      if (!["master", "p4"].includes(role)) return respostaErro(res, 403, "Sem permissão para cadastrar policiais.");
      const dados = validarDados(req.body, role === "master");
      if (!dados || !dados.nome_completo || !dados.nome_guerra || !dados.matricula) {
        return respostaErro(res, 400, "Informe nome completo, nome de guerra e matrícula.");
      }
      if (role === "p4") dados.role = "policial";
      if (!dados.role) dados.role = "policial";
      const { data, error } = await db.from("policiais").insert([dados]).select("*").single();
      if (error) throw error;
      return res.status(201).json({ policial: semSenha(data) });
    }

    return res.setHeader("Allow", "GET, POST").status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Erro na API de policiais:", error.message);
    return res.status(500).json({ error: "Não foi possível concluir a operação." });
  }
}
