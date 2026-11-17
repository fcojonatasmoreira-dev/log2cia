import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/cautelas.js";
import { criarSessao } from "../server/api/auth/_session.js";

function resposta() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(nome, valor) { this.headers[nome] = valor; return this; },
    status(codigo) { this.statusCode = codigo; return this; },
    json(body) { this.body = body; return this; },
  };
}

function ambiente({ role = "master" } = {}) {
  const chamadas = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const metodo = (init.method || "GET").toUpperCase();
    chamadas.push({ path: url.pathname, metodo });
    if (url.pathname === "/rest/v1/policiais") {
      return Response.json({ id: "master-1", auth_version: 0, role });
    }
    if (url.pathname === "/rest/v1/cautelas" && metodo === "GET") {
      return Response.json([{ id: "c-1", tipo_cautela: "temporaria", cautela_itens: [{ equipamento_id: "e-1" }] }]);
    }
    return Response.json({ message: "unexpected request" }, { status: 404 });
  };
  return chamadas;
}

function requisicao(method, query = {}, autenticada = true) {
  const cookie = autenticada
    ? `log2cia_session=${criarSessao({ id: "master-1", auth_version: 0 })}`
    : "";
  return { method, query, headers: { cookie }, body: { operacao: "emitir" } };
}

test("todas as escritas de Cautelas são bloqueadas antes de acessar tabelas", async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const chamadas = ambiente();
    const res = resposta();
    await handler(requisicao(method), res);
    assert.equal(res.statusCode, 503, method);
    assert.deepEqual(chamadas.map((item) => item.path), [], "nenhuma consulta ou escrita deve ocorrer");
  }
});

test("leituras próprias de Cautelas ficam suspensas, mantendo só a consulta autenticada mínima do Inventário", async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";

  const chamadas = ambiente({ role: "p4" });
  const bloqueada = resposta();
  await handler(requisicao("GET", { uso: "lista" }), bloqueada);
  assert.equal(bloqueada.statusCode, 503);
  assert.deepEqual(chamadas.map((item) => item.path), ["/rest/v1/policiais"]);

  const permitida = resposta();
  await handler(requisicao("GET", { uso: "ativas" }), permitida);
  assert.equal(permitida.statusCode, 200);
  assert.equal(permitida.body.cautelas[0].cautela_itens[0].equipamento_id, "e-1");
  assert.deepEqual(chamadas.map((item) => item.path), [
    "/rest/v1/policiais",
    "/rest/v1/policiais",
    "/rest/v1/cautelas",
  ]);
});

test("a leitura mínima continua exigindo sessão válida", async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = ambiente();
  const res = resposta();
  await handler(requisicao("GET", { uso: "ativas" }, false), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(chamadas, []);
});
