import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/dashboard.js";
import { criarSessao, lerSessao, trocarModoSessao } from "../server/api/auth/_session.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";

function resposta() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, setHeader() {}, json(body) { this.body = body; return this; } };
}

async function executar({ role = "master", modo = "administrativo", actorId = USER_ID } = {}) {
  const anterior = { fetch: globalThis.fetch, secret: process.env.SESSION_SECRET, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const chamadas = [];
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    chamadas.push({ url, method });
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.has("id")) {
      return Response.json({ id: actorId, role, is_master: role === "master", auth_version: 0, credencial_provisionada: true, primeiro_acesso: false, conta_suspensa: false });
    }
    if (["/rest/v1/policiais", "/rest/v1/banco_horas_solicitacoes", "/rest/v1/permutas_servico", "/rest/v1/permutas_servico_escala", "/rest/v1/viaturas"].includes(url.pathname) && method === "HEAD") {
      let count = 0;
      if (url.pathname.endsWith("/policiais")) count = 27;
      if (url.pathname.endsWith("/banco_horas_solicitacoes")) count = url.searchParams.get("policial_id") ? 2 : 5;
      if (url.pathname.endsWith("/permutas_servico")) count = url.searchParams.get("status")?.includes("AGUARDANDO_ANALISE") ? 3 : 1;
      if (url.pathname.endsWith("/permutas_servico_escala")) count = 4;
      if (url.pathname.endsWith("/viaturas")) count = url.searchParams.get("situacao")?.includes("baixada") ? 1 : url.searchParams.get("situacao")?.includes("operando") ? 1 : url.searchParams.get("situacao")?.includes("manutencao") ? 1 : 4;
      return new Response(null, { status: 200, headers: { "content-range": `*/${count}` } });
    }
    if (["/rest/v1/cautelas", "/rest/v1/equipamentos"].includes(url.pathname)) return Response.json([]);
    return Response.json({ message: `Requisição inesperada: ${method} ${url.pathname}` }, { status: 404 });
  };

  const sessaoInicial = criarSessao({ id: actorId, role, is_master: role === "master", auth_version: 0 });
  const sessaoLida = lerSessao({ headers: { cookie: `log2cia_session=${sessaoInicial}` } });
  const token = modo === "administrativo" && role === "policial" ? trocarModoSessao(sessaoLida, modo)
    : modo === "policial" ? trocarModoSessao(sessaoLida, modo) : sessaoInicial;
  const req = { method: "GET", query: {}, headers: { cookie: `log2cia_session=${token}` } };
  const res = resposta();
  try {
    await handler(req, res);
    return { status: res.statusCode, body: res.body, chamadas };
  } finally {
    globalThis.fetch = anterior.fetch;
    for (const [name, value] of [["SESSION_SECRET", anterior.secret], ["SUPABASE_URL", anterior.url], ["SUPABASE_SERVICE_ROLE_KEY", anterior.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test("Master em modo Administrativo recebe somente os indicadores com fonte autorizada", async () => {
  const resultado = await executar();
  assert.equal(resultado.status, 200);
  assert.deepEqual(resultado.body.metrics.situacaoViaturas, { baixadas: 1, operacionais: 1, manutencao: 1, total: 4 });
  assert.equal(resultado.body.metrics.efetivoAtivoCadastrado, 27);
  assert.equal(resultado.body.metrics.solicitacoesBancoHorasPendentes, 5);
  assert.equal(resultado.body.metrics.permutasAguardandoAnalise, 3);
  assert.equal(resultado.body.metrics.permutasAguardandoAplicacao, 4);
  assert.equal("efetivoPresente" in resultado.body.metrics, false);
});

test("modo Policial retorna apenas contagens pessoais e filtra com a identidade da sessão", async () => {
  const resultado = await executar({ role: "master", modo: "policial" });
  assert.equal(resultado.status, 200);
  assert.deepEqual(resultado.body.metrics, { modo: "policial", solicitacoesBancoHorasPessoais: 2, permutasPessoaisPendentes: 3 });
  const banco = resultado.chamadas.find(({ url }) => url.pathname.endsWith("/banco_horas_solicitacoes"));
  const permutas = resultado.chamadas.find(({ url }) => url.pathname.endsWith("/permutas_servico"));
  assert.equal(banco.url.searchParams.get("policial_id"), `eq.${USER_ID}`);
  assert.ok(permutas.url.searchParams.get("or").includes(`solicitante_id.eq.${USER_ID}`));
  assert.equal(resultado.chamadas.some(({ url }) => ["/rest/v1/viaturas", "/rest/v1/equipamentos", "/rest/v1/cautelas"].includes(url.pathname)), false);
  assert.equal(resultado.chamadas.filter(({ url }) => url.pathname.endsWith("/policiais")).length, 1, "apenas a validação da sessão consulta policiais");
});

test("P1 recebe Banco de Horas e Controle de Escala, sem dados de frota ou inventário", async () => {
  const resultado = await executar({ role: "p1" });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.metrics.solicitacoesBancoHorasPendentes, 5);
  assert.equal(resultado.body.metrics.permutasAguardandoAplicacao, 4);
  assert.equal("situacaoViaturas" in resultado.body.metrics, false);
  assert.equal("inventario" in resultado.body.metrics, false);
  assert.equal("permutasAguardandoAnalise" in resultado.body.metrics, false);
});

test("Oficial comum não pode abrir Dashboard no modo Policial", async () => {
  const resultado = await executar({ role: "oficial", modo: "policial" });
  assert.equal(resultado.status, 403);
  assert.equal(resultado.chamadas.some(({ url }) => url.pathname !== "/rest/v1/policiais"), false);
});
