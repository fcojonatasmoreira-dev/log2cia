import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "log2cia_session";
const MAX_AGE = 60 * 60 * 8;
const MIN_AGE = 60 * 60;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
  }
  return value;
}

export function criarSessao(usuario, manterConectado = false) {
  const agora = Math.floor(Date.now() / 1000);
  const maxAge = manterConectado ? MAX_AGE : MIN_AGE;

  const payload = Buffer.from(
    JSON.stringify({
      sub: usuario.id,
      ver: Number.isInteger(usuario.auth_version) ? usuario.auth_version : 0,
      iat: agora,
      exp: agora + maxAge,
    }),
  ).toString("base64url");

  const assinatura = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${assinatura}`;
}

export function lerSessao(req) {
  const cookie = req.headers.cookie || "";

  const token = cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (!token) return null;

  const partes = token.split(".");
  if (partes.length !== 2) return null;

  const [payload, assinatura] = partes;
  if (!payload || !assinatura) return null;

  let recebida;
  try {
    recebida = Buffer.from(assinatura, "base64url");
  } catch {
    return null;
  }

  const esperada = createHmac("sha256", secret()).update(payload).digest();
  if (
    recebida.length !== esperada.length ||
    !timingSafeEqual(recebida, esperada)
  ) {
    return null;
  }

  try {
    const dados = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    const agora = Math.floor(Date.now() / 1000);

    if (
      typeof dados.sub !== "string" ||
      !dados.sub ||
      !Number.isInteger(dados.ver) ||
      dados.ver < 0 ||
      !Number.isInteger(dados.iat) ||
      !Number.isInteger(dados.exp) ||
      dados.iat > agora + 60 ||
      dados.exp <= agora ||
      dados.exp <= dados.iat ||
      dados.exp - dados.iat < MIN_AGE ||
      dados.exp - dados.iat > MAX_AGE
    ) {
      return null;
    }

    return dados;
  } catch {
    return null;
  }
}

export function definirCookie(res, token, manterConectado = false) {
  const maxAge = manterConectado ? MAX_AGE : MIN_AGE;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  );
}

export function limparCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
}
