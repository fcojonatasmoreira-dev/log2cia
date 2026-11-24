import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/permutas/index.js";
import { criarSessao } from "../server/api/auth/_session.js";

const USUARIO_ID = "70000000-0000-4000-8000-000000000001";
const PARTICIPANTE_1 = "10000000-0000-4000-8000-000000000001";
const PARTICIPANTE_2 = "10000000-0000-4000-8000-000000000002";
const PERMUTA_ID = "30000000-0000-4000-8000-000000000001";
const PERMUTA = {
  id: PERMUTA_ID, tipo: "SUBSTITUICAO_SIMPLES", status: "DEFERIDA",
  solicitante_id: PARTICIPANTE_1, destinatario_id: PARTICIPANTE_2, criada_em: "2026-11-24T12:00:00Z",
};

async function consultar(role) {
  const anterior = {
    fetch: globalThis.fetch, segredo: process.env.SESSION_SECRET,
    url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const chamadas = [];
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") {
      return Response.json({ id: USUARIO_ID, role, auth_version: 0, credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/permutas_servico" && url.searchParams.get("select") === "id,solicitante_id,destinatario_id") {
      return Response.json(PERMUTA);
    }
    if (url.pathname === "/rest/v1/permutas_servico") return Response.json([PERMUTA]);
    if (["/rest/v1/permutas_servico_manifestacoes", "/rest/v1/permutas_servico_confirmacoes", "/rest/v1/permutas_servico_historico", "/rest/v1/policiais"].includes(url.pathname)) return Response.json([]);
    return Response.json({ message: `Chamada inesperada ${url.pathname}` }, { status: 404 });
  };
  const req = {
    method: "GET", query: { permuta_id: PERMUTA_ID }, headers: {
      cookie: `log2cia_session=${criarSessao({ id: USUARIO_ID, auth_version: 0 })}`,
    },
  };
  const res = { statusCode: 200, status(valor) { this.statusCode = valor; return this; }, setHeader() {}, json(body) { this.body = body; return this; } };
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

test("destino da notificação permite P1 consultar permuta pelo ID e retorna os detalhes", async () => {
  const resultado = await consultar("p1");
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.permutas.length, 1);
  assert.ok(resultado.chamadas.some((url) => url.pathname === "/rest/v1/permutas_servico"
    && url.searchParams.get("id") === `eq.${PERMUTA_ID}`));
});

test("policial que não participa não descobre registro usando ID de destino", async () => {
  const resultado = await consultar("policial");
  assert.equal(resultado.status, 404);
  assert.equal(resultado.body.error, "Permuta não encontrada.");
  assert.equal(resultado.chamadas.filter((url) => url.pathname === "/rest/v1/permutas_servico").length, 1);
});
