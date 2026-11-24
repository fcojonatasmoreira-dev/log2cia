import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/notificacoes/index.js";
import { criarSessao } from "../server/api/auth/_session.js";

const USUARIO_ID = "10000000-0000-4000-8000-000000000001";
const NOTIFICACAO_ID = "20000000-0000-4000-8000-000000000001";
const PERMUTA_ID = "30000000-0000-4000-8000-000000000001";

function resposta() {
  return { statusCode: 200, status(valor) { this.statusCode = valor; return this; }, setHeader() {}, json(body) { this.body = body; return this; } };
}

async function executar({ metodo = "GET", perfil = "p1", body, sessaoValida = true } = {}) {
  const anterior = {
    fetch: globalThis.fetch,
    segredo: process.env.SESSION_SECRET,
    url: process.env.SUPABASE_URL,
    chave: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const chamadas = [];
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    chamadas.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname === "/rest/v1/policiais") {
      return Response.json({ id: USUARIO_ID, role: perfil, auth_version: 0, credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/notificacoes_internas" && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "*/3" } });
    }
    if (url.pathname === "/rest/v1/notificacoes_internas" && method === "GET") {
      return Response.json([{
        id: NOTIFICACAO_ID, destinatario_id: "nao-deve-ser-retornado", permuta_id: PERMUTA_ID,
        tipo: "PERMUTA_DEFERIDA", mensagem_disponivel: true, criado_em: "2026-11-24T12:00:00Z", lida_em: null,
      }]);
    }
    if (url.pathname === "/rest/v1/notificacoes_internas" && method === "PATCH") {
      return Response.json([{ id: NOTIFICACAO_ID }]);
    }
    return Response.json({ message: `Chamada inesperada ${method} ${url.pathname}` }, { status: 404 });
  };
  const req = {
    method: metodo,
    query: {},
    body,
    headers: { cookie: sessaoValida ? `log2cia_session=${criarSessao({ id: USUARIO_ID, auth_version: 0 })}` : "log2cia_session=invalida" },
  };
  const res = resposta();
  try {
    await handler(req, res);
    return { status: res.statusCode, body: res.body, chamadas };
  } finally {
    globalThis.fetch = anterior.fetch;
    for (const [nome, valor] of [["SESSION_SECRET", anterior.segredo], ["SUPABASE_URL", anterior.url], ["SUPABASE_SERVICE_ROLE_KEY", anterior.chave]]) {
      if (valor === undefined) delete process.env[nome]; else process.env[nome] = valor;
    }
  }
}

test("listagem usa identidade da sessão, contagem exata e descrição sem corpo de mensagem", async () => {
  const resultado = await executar();
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.nao_lidas, 3);
  assert.deepEqual(resultado.body.notificacoes[0], {
    id: NOTIFICACAO_ID,
    permuta_id: PERMUTA_ID,
    tipo: "Permuta deferida",
    descricao: "Uma permuta foi deferida. O Oficial deixou uma mensagem reservada para você.",
    criado_em: "2026-11-24T12:00:00Z",
    lida_em: null,
  });
  const consultas = resultado.chamadas.filter((item) => item.url.pathname === "/rest/v1/notificacoes_internas");
  assert.equal(consultas.length, 2);
  assert.ok(consultas.every((item) => item.url.searchParams.get("destinatario_id") === `eq.${USUARIO_ID}`));
  assert.ok(consultas.some((item) => item.method === "HEAD" && item.url.searchParams.get("lida_em") === "is.null"));
  assert.ok(!JSON.stringify(resultado.body).includes("nao-deve-ser-retornado"));
});

test("marcar lida restringe a mutação ao destinatário da sessão", async () => {
  const resultado = await executar({ metodo: "PATCH", body: { acao: "marcar_lida", id: NOTIFICACAO_ID } });
  assert.equal(resultado.status, 200);
  const chamada = resultado.chamadas.find((item) => item.method === "PATCH");
  assert.equal(chamada.url.searchParams.get("destinatario_id"), `eq.${USUARIO_ID}`);
  assert.equal(chamada.url.searchParams.get("id"), `eq.${NOTIFICACAO_ID}`);
  assert.deepEqual(chamada.body, { lida_em: chamada.body.lida_em });
});

test("marcar todas altera somente avisos não lidos do destinatário autenticado", async () => {
  const resultado = await executar({ metodo: "PATCH", body: { acao: "marcar_todas_lidas" } });
  assert.equal(resultado.status, 200);
  const chamada = resultado.chamadas.find((item) => item.method === "PATCH");
  assert.equal(chamada.url.searchParams.get("destinatario_id"), `eq.${USUARIO_ID}`);
  assert.equal(chamada.url.searchParams.get("lida_em"), "is.null");
  assert.equal("id" in chamada.body, false);
});

test("não autenticados e perfis fora do módulo não consultam notificações", async () => {
  const semSessao = await executar({ sessaoValida: false });
  assert.equal(semSessao.status, 401);
  assert.equal(semSessao.chamadas.some((item) => item.url.pathname === "/rest/v1/notificacoes_internas"), false);
  const foraDoModulo = await executar({ perfil: "p4" });
  assert.equal(foraDoModulo.status, 403);
  assert.equal(foraDoModulo.chamadas.some((item) => item.url.pathname === "/rest/v1/notificacoes_internas"), false);
});

test("policiais participantes e perfis administrativos autorizados podem consultar sua própria central", async () => {
  for (const perfil of ["policial", "p1", "p1_escalante_servico_ordinario", "oficial", "master"]) {
    const resultado = await executar({ perfil });
    assert.equal(resultado.status, 200, `perfil ${perfil}`);
  }
});

test("marcação em nome de terceiro e ações inválidas são rejeitadas antes da escrita", async () => {
  const resultado = await executar({ metodo: "PATCH", body: { acao: "marcar_lida", id: "nao-e-uuid" } });
  assert.equal(resultado.status, 400);
  assert.equal(resultado.chamadas.some((item) => item.method === "PATCH"), false);
});
