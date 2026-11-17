import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarSessao } from "../server/api/auth/_session.js";
import handler from "../server/api/oficios.js";
import { getOficios } from "../src/services/oficiosService.js";

const fetchOriginal = globalThis.fetch;
const envOriginal = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const secret = "oficios-eventos-test-secret-mais-de-32-caracteres";

function resposta() {
  return {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

function json(data, status = 200) {
  return Response.json(data, { status });
}

function cookie() {
  const token = criarSessao({ id: "p1-1", auth_version: 0 });
  return `log2cia_session=${token}`;
}

beforeEach(() => {
  process.env.SESSION_SECRET = secret;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-only";
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  for (const [name, value] of Object.entries(envOriginal)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("GET filtra Eventos e consulta a próxima sequência EVT", async () => {
  const consultasOficios = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const tabela = url.pathname.split("/").at(-1);
    if (tabela === "policiais") return json([{
      id: "p1-1", auth_version: 0, role: "p1", primeiro_acesso: false,
      credencial_provisionada: true,
    }]);
    if (["arquivos_estantes", "arquivos_colunas", "arquivos_pastas"].includes(tabela)) return json([]);
    if (tabela === "solicitacoes_eventos") return json([]);
    if (tabela === "oficios") {
      consultasOficios.push(url);
      if (url.searchParams.get("select") === "numero_sequencial") {
        return json([{ numero_sequencial: 1 }, { numero_sequencial: 3 }]);
      }
      return json([{
        id: "oficio-evento-1", tipo_origem: "externo", solicitacao_evento_id: "evento-1",
        numero_sequencial: 3, ano: 2026, pasta_id: null,
      }]);
    }
    return json([], 404);
  };

  const res = resposta();
  await handler({
    method: "GET",
    headers: { cookie: cookie() },
    query: { tipo_origem: "evento", tipo_numero: "evento", ano: "2026" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.oficios[0].numero, "EVT-003/2026");
  assert.equal(res.body.proximo_numero, 2);
  assert.equal(res.body.proximo_numero_formatado, "EVT-002/2026");
  assert.ok(consultasOficios.every((url) => url.searchParams.get("solicitacao_evento_id") === "not.is.null"));
});

test("PATCH de Evento ao mudar de ano consulta vínculo e reserva na sequência de Eventos", async () => {
  const chamadas = [];
  let payloadAtualizacao;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const tabela = url.pathname.split("/").at(-1);
    const metodo = (init.method || "GET").toUpperCase();
    chamadas.push({ url, metodo });
    if (tabela === "policiais") return json([{
      id: "p1-1", auth_version: 0, role: "p1", primeiro_acesso: false,
      credencial_provisionada: true,
    }]);
    if (tabela === "arquivos_estantes") return json([{ id: "estante-1", nome: "Estante", ativo: true }]);
    if (tabela === "arquivos_colunas") return json([{ id: "coluna-1", nome: "A", estante_id: "estante-1", ativo: true }]);
    if (tabela === "arquivos_pastas") return json([{ id: "pasta-1", nome: "Pasta", coluna_id: "coluna-1", ativo: true }]);
    if (tabela === "oficios" && metodo === "PATCH") {
      payloadAtualizacao = JSON.parse(init.body);
      return json({
        id: "oficio-evento-1", criado_por: "p1-1", solicitacao_evento_id: "evento-1",
        numero_sequencial: payloadAtualizacao.numero_sequencial, ano: payloadAtualizacao.ano,
        pasta_id: "pasta-1", tipo_origem: "externo",
      });
    }
    if (tabela === "oficios" && url.searchParams.get("select") === "numero_sequencial") {
      return json([{ numero_sequencial: 1 }]);
    }
    if (tabela === "oficios") return json([{
      id: "oficio-evento-1", criado_por: "p1-1", solicitacao_evento_id: "evento-1",
      numero_sequencial: 5, ano: 2025, pasta_id: "pasta-1", tipo_origem: "externo",
    }]);
    return json([], 404);
  };

  const res = resposta();
  await handler({
    method: "PATCH",
    headers: { cookie: cookie() },
    query: { id: "oficio-evento-1" },
    body: {
      data_oficio: "2026-05-10", remetente: "Origem", destinatario: "Destino",
      assunto: "Assunto", pasta_id: "pasta-1",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(payloadAtualizacao.ano, 2026);
  assert.equal(payloadAtualizacao.numero_sequencial, 2);
  assert.equal(res.body.oficio.numero, "EVT-002/2026");
  const buscaExistente = chamadas.find(({ url, metodo }) => metodo === "GET"
    && url.pathname.endsWith("/oficios") && url.searchParams.get("id") === "eq.oficio-evento-1");
  assert.match(buscaExistente.url.searchParams.get("select"), /solicitacao_evento_id/);
  const buscaSequencia = chamadas.find(({ url, metodo }) => metodo === "GET"
    && url.pathname.endsWith("/oficios") && url.searchParams.get("select") === "numero_sequencial");
  assert.equal(buscaSequencia.url.searchParams.get("solicitacao_evento_id"), "not.is.null");
});

test("serviço envia o tipo de numeração e a tela oferece filtro de Eventos", async () => {
  let chamada;
  globalThis.fetch = async (input) => {
    chamada = new URL(typeof input === "string" ? input : input.url, "http://localhost");
    return json({ oficios: [] });
  };
  await getOficios({ tipo_origem: "evento", tipo_numero: "evento" });
  assert.equal(chamada.searchParams.get("tipo_origem"), "evento");
  assert.equal(chamada.searchParams.get("tipo_numero"), "evento");

  const page = readFileSync(new URL("../src/pages/Oficios.jsx", import.meta.url), "utf8");
  assert.match(page, /<option value="evento">Eventos<\/option>/);
});
