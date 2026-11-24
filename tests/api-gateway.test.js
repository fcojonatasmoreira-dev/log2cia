import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { despacharApi, identificarRota } from "../server/api/gateway.js";

test("mapeia todos os endpoints existentes e parâmetros dinâmicos", () => {
  const casos = [
    ["auth/login", "auth/[action]", { action: "login" }],
    ["arquivo", "arquivo", {}],
    ["banco-horas", "banco-horas/index", {}],
    ["cautelas", "cautelas", {}],
    ["credenciais", "credenciais", {}],
    ["dashboard", "dashboard", {}],
    ["drso", "drso/index", {}],
    ["equipamentos", "equipamentos/index", {}],
    ["oficios", "oficios", {}],
    ["notificacoes", "notificacoes/index", {}],
    ["permutas", "permutas/index", {}],
    ["policiais", "policiais/index", {}],
    ["policiais/p-123", "policiais/[id]", { id: "p-123" }],
    ["policiais/p-123/cautelas", "policiais/[id]/[action]", { id: "p-123", action: "cautelas" }],
    ["radios", "radios/index", {}],
    ["viaturas", "viaturas/index", {}],
  ];
  for (const [path, key, params] of casos) {
    assert.deepEqual(identificarRota(path), { chave: key, parametros: params }, path);
  }
  assert.equal(identificarRota("nao-existe"), null);
  assert.equal(identificarRota("solicitacoes-senha"), null);
  assert.equal(identificarRota("policiais/a/b/c"), null);
});

test("todos os handlers reais migrados podem ser carregados pelo runtime Node", async () => {
  const modulos = [
    "../server/api/auth/[action].js", "../server/api/arquivo.js",
    "../server/api/banco-horas/index.js", "../server/api/cautelas.js", "../server/api/credenciais.js", "../server/api/dashboard.js", "../server/api/drso/index.js",
    "../server/api/equipamentos/index.js",
    "../server/api/oficios.js", "../server/api/notificacoes/index.js", "../server/api/permutas/index.js", "../server/api/policiais/index.js",
    "../server/api/policiais/[id].js", "../server/api/policiais/[id]/[action].js",
    "../server/api/radios/index.js",
    "../server/api/viaturas/index.js",
  ];
  const handlers = await Promise.all(modulos.map((caminho) => import(caminho)));
  assert.equal(handlers.length, 16);
  assert.ok(handlers.every((modulo) => typeof modulo.default === "function"));
});

test("configuração mantém uma única função roteável e encaminha /api sem mudar URL pública", () => {
  const raiz = resolve(new URL("..", import.meta.url).pathname);
  const config = JSON.parse(readFileSync(resolve(raiz, "vercel.json"), "utf8"));
  const arquivosApi = readdirSync(resolve(raiz, "api"), { withFileTypes: true })
    .filter((item) => item.isFile() && /\.(?:js|mjs|cjs|ts)$/.test(item.name));
  assert.equal(arquivosApi.length, 1);
  assert.equal(arquivosApi[0].name, "gateway.js");
  assert.deepEqual(config.rewrites[0], {
    source: "/api/auth/:action",
    destination: "/api/gateway?__dispatch=auth/:action",
  });
  assert.deepEqual(config.rewrites[1], {
    source: "/api/:path*",
    destination: "/api/gateway?__dispatch=:path*",
  });
  assert.equal(config.rewrites[2].destination, "/index.html");
  assert.equal(identificarRota("equipes"), null, "módulo Equipes arquivado continua fora do gateway publicado");
});

test("repassa método, URL, corpo, cabeçalhos e resposta sem serialização", async () => {
  const body = { acao: "teste", valores: [1, 2] };
  const headers = { cookie: "sessao=valor", "content-type": "application/json", "x-request-id": "abc" };
  const req = {
    method: "PATCH",
    url: "/api/policiais/id-1?campo=x&campo=y",
    headers,
    body,
    query: { __dispatch: "policiais/id-1", campo: ["x", "y"], role: "preservado" },
  };
  const chamadas = [];
  let queryRecebida;
  const res = {
    headers: {},
    setHeader(nome, valor) { this.headers[nome] = valor; return this; },
    status(valor) { this.statusCode = valor; return this; },
    json(valor) { this.body = valor; return this; },
  };
  const resultado = await despacharApi(req, res, {
    carregarHandler: async () => ({ default: async (reqHandler, resHandler) => {
      chamadas.push({ reqHandler, resHandler });
      queryRecebida = { ...reqHandler.query };
      reqHandler.headers.cookie = "sessao=valor";
      resHandler.setHeader("Set-Cookie", "sessao=novo; HttpOnly");
      resHandler.setHeader("Retry-After", "2");
      return resHandler.status(202).json({ recebido: true, bytes: Buffer.from([1, 2, 3]) });
    } }),
  });

  assert.equal(resultado, res);
  assert.equal(chamadas[0].resHandler, res);
  assert.equal(chamadas[0].reqHandler, req);
  assert.equal(chamadas[0].reqHandler.method, req.method);
  assert.equal(chamadas[0].reqHandler.url, req.url);
  assert.equal(chamadas[0].reqHandler.body, body);
  assert.equal(chamadas[0].reqHandler.headers, headers);
  assert.deepEqual(queryRecebida, { campo: ["x", "y"], role: "preservado", id: "id-1" });
  assert.deepEqual(req.query, { __dispatch: "policiais/id-1", campo: ["x", "y"], role: "preservado" });
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.headers, { "Set-Cookie": "sessao=novo; HttpOnly", "Retry-After": "2" });
  assert.deepEqual(res.body, { recebido: true, bytes: Buffer.from([1, 2, 3]) });
});

test("preserva a precedência do parâmetro de caminho e rejeita rota não mapeada", async () => {
  let queryRecebida;
  const req = { method: "GET", query: { __dispatch: "policiais/id-do-caminho", id: "id-da-query" } };
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await despacharApi(req, res, {
    carregarHandler: async () => ({ default: async (reqHandler) => { queryRecebida = reqHandler.query; } }),
  });
  assert.equal(queryRecebida.id, "id-do-caminho");

  const erro = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await despacharApi({ query: { __dispatch: "desconhecida" } }, erro);
  assert.equal(erro.statusCode, 404);
});
