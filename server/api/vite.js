import { despacharApi } from "./gateway.js";

function lerQuery(searchParams) {
  const query = {};
  for (const [nome, valor] of searchParams) {
    if (Object.hasOwn(query, nome)) {
      query[nome] = Array.isArray(query[nome])
        ? [...query[nome], valor]
        : [query[nome], valor];
    } else {
      query[nome] = valor;
    }
  }
  return query;
}

async function lerCorpo(req) {
  if (["GET", "HEAD"].includes(req.method)) return undefined;
  const partes = [];
  for await (const parte of req) partes.push(Buffer.from(parte));
  if (!partes.length) return undefined;

  const corpo = Buffer.concat(partes);
  const tipo = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (tipo === "application/json" || tipo.endsWith("+json")) {
    try {
      return JSON.parse(corpo.toString("utf8"));
    } catch {
      const erro = new Error("Corpo JSON inválido.");
      erro.statusCode = 400;
      throw erro;
    }
  }
  if (tipo === "application/x-www-form-urlencoded") {
    return Object.fromEntries(new URLSearchParams(corpo.toString("utf8")));
  }
  return corpo;
}

function criarResposta(res) {
  const cabecalhos = new Map();
  const resposta = {
    statusCode: 200,
    setHeader(nome, valor) {
      cabecalhos.set(String(nome).toLowerCase(), [String(nome), valor]);
      return this;
    },
    getHeader(nome) {
      return cabecalhos.get(String(nome).toLowerCase())?.[1];
    },
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(dados) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
      return this.end(JSON.stringify(dados));
    },
    send(dados) {
      return this.end(dados);
    },
    end(dados) {
      for (const [nome, valor] of cabecalhos.values()) res.setHeader(nome, valor);
      res.statusCode = this.statusCode;
      res.end(dados);
      return res;
    },
  };
  return resposta;
}

export function criarMiddlewareApiLocal(dispatch = despacharApi) {
  return async function middlewareApiLocal(req, res, next) {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      return next();
    }
    if (!url.pathname.startsWith("/api/")) return next();

    const query = lerQuery(url.searchParams);
    if (url.pathname === "/api/gateway") {
      query.__dispatch = query.__dispatch || "";
    } else {
      query.__dispatch = url.pathname.slice("/api/".length);
    }

    req.query = query;
    const resposta = criarResposta(res);
    try {
      req.body = await lerCorpo(req);
      await dispatch(req, resposta);
    } catch (erro) {
      if (res.writableEnded) return;
      resposta.status(erro.statusCode || 500).json({
        error: erro.statusCode === 400 ? erro.message : "Falha interna na API.",
      });
    }
  };
}

export function localApiPlugin() {
  return {
    name: "log2cia-local-api",
    configureServer(server) {
      server.middlewares.use(criarMiddlewareApiLocal());
    },
  };
}
