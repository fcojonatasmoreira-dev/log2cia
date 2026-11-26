import { respostaErro, usuarioAutenticado } from "../_server.js";
import { MODOS_ACESSO } from "./_accessMode.js";
import { definirCookieComValidade, lerSessao, trocarModoSessao } from "./_session.js";

function mesmaOrigem(req) {
  const origem = req.headers?.origin;
  if (!origem) return true;
  const host = req.headers?.host;
  if (!host) return false;
  try {
    const urlOrigem = new URL(origem);
    const protocolo = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim()
      || (host.startsWith("localhost") ? "http" : "https");
    return urlOrigem.host === host && urlOrigem.protocol === `${protocolo}:`;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respostaErro(res, 405, "Método não permitido.");
  }
  if (!mesmaOrigem(req)) return respostaErro(res, 403, "Origem não autorizada.");

  try {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const modo = req.body?.modo;
    if (![MODOS_ACESSO.ADMINISTRATIVO, MODOS_ACESSO.POLICIAL].includes(modo)) {
      return respostaErro(res, 400, "Modo de acesso inválido.");
    }
    if (!usuario.modos_disponiveis.includes(modo)) {
      return respostaErro(res, 403, "Seu perfil não pode selecionar esse modo de acesso.");
    }

    const sessao = lerSessao(req);
    if (!sessao) return respostaErro(res, 401, "Sessão inválida ou expirada.");

    const maxAge = sessao.exp - Math.floor(Date.now() / 1000);
    if (maxAge <= 0) return respostaErro(res, 401, "Sessão inválida ou expirada.");

    definirCookieComValidade(res, trocarModoSessao(sessao, modo), maxAge);
    return res.status(200).json({ modo_acesso: modo });
  } catch (error) {
    console.error("Falha ao alternar modo de acesso:", error.message);
    return respostaErro(res, 500, "Não foi possível alternar o modo de acesso.");
  }
}
