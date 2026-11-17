import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { criarMiddlewareApiLocal } from "../server/api/vite.js";

function criarRequisicao({ url, method = "GET", headers = {}, body } = {}) {
  const bytes = body === undefined
    ? []
    : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(bytes);
  req.url = url;
  req.method = method;
  req.headers = headers;
  return req;
}

function criarResposta() {
  return {
    headers: {},
    statusCode: 200,
    writableEnded: false,
    setHeader(nome, valor) { this.headers[nome.toLowerCase()] = valor; },
    end(body) { this.body = body; this.writableEnded = true; },
  };
}

test("local API dispatcher preserves URL, query, body, cookies, and response", async () => {
  const req = criarRequisicao({
    url: "/api/auth/login?return=%2Fhome&tag=a&tag=b",
    method: "POST",
    headers: { "content-type": "application/json", cookie: "session=opaque" },
    body: { matricula: "123", senha: "not-logged" },
  });
  const res = criarResposta();
  let foiDespachado = false;
  const middleware = criarMiddlewareApiLocal(async (reqApi, resApi) => {
    foiDespachado = true;
    assert.equal(reqApi.url, "/api/auth/login?return=%2Fhome&tag=a&tag=b");
    assert.equal(reqApi.method, "POST");
    assert.equal(reqApi.headers.cookie, "session=opaque");
    assert.deepEqual(reqApi.body, { matricula: "123", senha: "not-logged" });
    assert.deepEqual(reqApi.query, {
      return: "/home",
      tag: ["a", "b"],
      __dispatch: "auth/login",
    });
    resApi.setHeader("Set-Cookie", "session=refreshed; HttpOnly");
    resApi.status(202).json({ received: true });
  });

  await middleware(req, res, () => assert.fail("API request should be handled"));
  assert.equal(foiDespachado, true);
  assert.equal(res.statusCode, 202);
  assert.equal(res.headers["set-cookie"], "session=refreshed; HttpOnly");
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(res.body), { received: true });
});

test("local /api/auth/me and /api/auth/login reach the existing auth handlers", async () => {
  const middleware = criarMiddlewareApiLocal();

  const respostaSessao = criarResposta();
  await middleware(
    criarRequisicao({ url: "/api/auth/me", method: "GET" }),
    respostaSessao,
    () => assert.fail("/api/auth/me should be handled"),
  );
  assert.equal(respostaSessao.statusCode, 401);
  assert.deepEqual(JSON.parse(respostaSessao.body), {
    error: "Sessão inválida ou expirada.",
  });

  const respostaLogin = criarResposta();
  await middleware(
    criarRequisicao({
      url: "/api/auth/login",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { matricula: "", senha: "" },
    }),
    respostaLogin,
    () => assert.fail("/api/auth/login should be handled"),
  );
  assert.equal(respostaLogin.statusCode, 400);
  assert.deepEqual(JSON.parse(respostaLogin.body), {
    error: "Informe matrícula e senha válidas.",
  });
});

test("local protected inventory and personnel APIs reject missing or invalid sessions", async () => {
  const middleware = criarMiddlewareApiLocal();
  for (const url of [
    "/api/equipamentos",
    "/api/policiais",
    "/api/dashboard",
    "/api/cautelas?uso=lista",
    "/api/equipamentos?acao=imagem",
    "/api/radios?acao=imagem",
  ]) {
    for (const cookie of [undefined, "log2cia_session=invalid"]) {
      const headers = cookie ? { cookie } : {};
      const res = criarResposta();
      await middleware(criarRequisicao({ url, headers }), res, () => assert.fail(`${url} should be handled`));
      assert.equal(res.statusCode, 401, `${url} with ${cookie || "no cookie"}`);
    }
  }
});
