import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/presenca/index.js";
import { criarSessao } from "../server/api/auth/_session.js";

const MASTER_ID = "10000000-0000-4000-8000-000000000007";
const TAB_ID = "20000000-0000-4000-8000-000000000001";

function resposta() {
  return { statusCode: 200, status(valor) { this.statusCode = valor; return this; }, setHeader() {}, json(body) { this.body = body; return this; } };
}

async function executar({ metodo = "GET", perfil = "master", body, sessaoValida = true } = {}) {
  const anterior = { fetch: globalThis.fetch, segredo: process.env.SESSION_SECRET, url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const chamadas = [];
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    chamadas.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") {
      return Response.json({ id: MASTER_ID, role: perfil, is_master: perfil === "master", auth_version: 0, credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/rpc/presenca_registrar_v1") return Response.json("2026-11-24T15:00:00Z");
    if (url.pathname === "/rest/v1/presenca_sessoes") return Response.json([
      { policial_id: MASTER_ID, ultima_atividade: new Date(Date.now() - 50_000).toISOString() },
      { policial_id: MASTER_ID, ultima_atividade: new Date().toISOString() },
      { policial_id: "10000000-0000-4000-8000-000000000001", ultima_atividade: new Date(Date.now() - 180_000).toISOString() },
    ]);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select")?.includes("nome_guerra")) return Response.json([
      { id: MASTER_ID, nome_guerra: "MASTER", nome_completo: "Nome Master", matricula: "001", numeral: null, posto_graduacao: "Major", role: perfil, unidade: "2ª CIA", is_master: true, senha: "NAO_RETORNAR" },
      { id: "10000000-0000-4000-8000-000000000001", nome_guerra: "ALFA", nome_completo: "Nome Alfa", matricula: "002", numeral: "12", posto_graduacao: "Soldado", role: "policial", unidade: "2ª CIA", senha: "NAO_RETORNAR" },
    ]);
    return Response.json({ message: `Chamada inesperada ${method} ${url.pathname}` }, { status: 404 });
  };
  const req = {
    method: metodo, query: {}, body,
    headers: { cookie: sessaoValida ? `log2cia_session=${criarSessao({ id: MASTER_ID, auth_version: 0 })}` : "log2cia_session=invalida" },
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

test("heartbeat deriva policial da sessão e registra a instância enviada", async () => {
  const resultado = await executar({ metodo: "POST", perfil: "policial", body: { instancia_id: TAB_ID, policial_id: "forjado" } });
  assert.equal(resultado.status, 200);
  const chamada = resultado.chamadas.find((item) => item.url.pathname.endsWith("presenca_registrar_v1"));
  assert.deepEqual(chamada.body, { p_policial_id: MASTER_ID, p_instancia_id: TAB_ID });
});

test("heartbeat rejeita sessão inválida e identificador inválido", async () => {
  const semSessao = await executar({ metodo: "POST", sessaoValida: false, body: { instancia_id: TAB_ID } });
  assert.equal(semSessao.status, 401);
  assert.equal(semSessao.chamadas.some((item) => item.url.pathname.endsWith("presenca_registrar_v1")), false);
  const uuidInvalido = await executar({ metodo: "POST", body: { instancia_id: "aba" } });
  assert.equal(uuidInvalido.status, 400);
  assert.equal(uuidInvalido.chamadas.some((item) => item.url.pathname.endsWith("presenca_registrar_v1")), false);
});

test("somente Master consulta presença geral, com agregação por pessoa e sem campos privados", async () => {
  const resultado = await executar();
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.total_online, 1);
  assert.deepEqual(resultado.body.usuarios.map(({ nome, situacao }) => [nome, situacao]), [["ALFA", "OFFLINE"], ["MASTER", "ONLINE"]]);
  assert.equal(JSON.stringify(resultado.body).includes("NAO_RETORNAR"), false);
  for (const perfil of ["policial", "p1", "oficial"]) {
    const bloqueado = await executar({ perfil });
    assert.equal(bloqueado.status, 403, perfil);
    assert.equal(bloqueado.chamadas.some((item) => item.url.pathname === "/rest/v1/presenca_sessoes"), false);
  }
});
