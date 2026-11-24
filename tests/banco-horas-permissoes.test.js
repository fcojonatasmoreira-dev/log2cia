import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/banco-horas/index.js";
import { criarSessao } from "../server/api/auth/_session.js";

function resposta() {
  return {
    statusCode: 200,
    status(codigo) { this.statusCode = codigo; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function executar({ role, method, body = {}, query = {}, actorId = "ator-1" }) {
  const anterior = {
    fetch: globalThis.fetch,
    sessionSecret: process.env.SESSION_SECRET,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const chamadas = [];
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const metodo = (init.method || "GET").toUpperCase();
    chamadas.push({ path: url.pathname, metodo, search: url.searchParams });

    if (url.pathname === "/rest/v1/policiais") {
      return Response.json({
        id: actorId,
        auth_version: 0,
        role,
        credencial_provisionada: true,
        primeiro_acesso: false,
      });
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return Response.json({ id: "resultado-1" });
    }

    if (url.pathname === "/rest/v1/banco_horas_movimentacoes") {
      return Response.json({ id: "movimentacao-1" });
    }

    if (url.pathname === "/rest/v1/banco_horas_solicitacoes") {
      return Response.json([{ id: "dispensa-1", tipo: "dispensa", status: "deferida" }]);
    }

    return Response.json({ message: "Requisição inesperada no teste." }, { status: 404 });
  };

  const req = {
    method,
    query,
    body,
    headers: {
      cookie: `log2cia_session=${criarSessao({ id: actorId, auth_version: 0 })}`,
    },
  };
  const res = resposta();

  try {
    await handler(req, res);
    return { status: res.statusCode, body: res.body, chamadas };
  } finally {
    globalThis.fetch = anterior.fetch;
    for (const [nome, valor] of [
      ["SESSION_SECRET", anterior.sessionSecret],
      ["SUPABASE_URL", anterior.supabaseUrl],
      ["SUPABASE_SERVICE_ROLE_KEY", anterior.serviceRoleKey],
    ]) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
}

const acoesGestao = [
  {
    nome: "crédito de horas",
    method: "POST",
    body: { acao: "movimentar", policial_id: "policial-2", tipo: "credito", horas: 4, descricao: "Registro de teste", turno: "A" },
    escrita: "/rest/v1/banco_horas_movimentacoes",
  },
  {
    nome: "utilização de horas por débito",
    method: "POST",
    body: { acao: "movimentar", policial_id: "policial-2", tipo: "debito", horas: 4, descricao: "Registro de teste", turno: "A" },
    escrita: "/rest/v1/banco_horas_movimentacoes",
  },
  {
    nome: "concessão de folga",
    method: "POST",
    body: { acao: "conceder_folga", policial_id: "policial-2", quantidade_folgas: 1, descricao: "Registro de teste" },
    escrita: "/rest/v1/banco_horas_movimentacoes",
  },
  {
    nome: "utilização de folga",
    method: "POST",
    body: { acao: "utilizar_folga", policial_id: "policial-2", data_referencia: "2026-11-15", turno: "A", descricao: "Registro de teste" },
    escrita: "/rest/v1/rpc/registrar_utilizacao_folga_banco_horas_v2",
  },
  {
    nome: "edição de movimentação",
    method: "PATCH",
    body: { acao: "editar_movimentacao", movimentacao_id: "movimentacao-1", tipo: "credito", horas: 4, descricao: "Editado", turno: "A" },
    escrita: "/rest/v1/banco_horas_movimentacoes",
  },
  {
    nome: "exclusão de movimentação",
    method: "DELETE",
    body: { movimentacao_id: "movimentacao-1" },
    escrita: "/rest/v1/banco_horas_movimentacoes",
  },
  {
    nome: "análise de solicitação",
    method: "PATCH",
    body: { solicitacao_id: "solicitacao-1", status: "deferida", parecer: "Aprovada" },
    escrita: "/rest/v1/rpc/analisar_solicitacao_banco_horas_v3",
  },
];

test("P1 executa as operações de gestão de Banco de Horas previstas no handler", async () => {
  for (const acao of acoesGestao) {
    const resultado = await executar({ role: "p1", ...acao });
    assert.ok([200, 201].includes(resultado.status), `${acao.nome}: ${resultado.body?.error}`);
    assert.ok(resultado.chamadas.some(({ path }) => path === acao.escrita), acao.nome);
  }
});

test("Master e Oficial preservam os limites de escrita existentes", async () => {
  for (const acao of acoesGestao) {
    const master = await executar({ role: "master", ...acao });
    assert.ok([200, 201].includes(master.status), `Master / ${acao.nome}`);

    const oficial = await executar({ role: "oficial", ...acao });
    const oficialPodeExecutar = ["exclusão de movimentação", "análise de solicitação"].includes(acao.nome);
    assert.equal(oficial.status === 200 || oficial.status === 201, oficialPodeExecutar, `Oficial / ${acao.nome}`);
    if (!oficialPodeExecutar) {
      assert.equal(oficial.chamadas.some(({ path }) => path === acao.escrita), false, acao.nome);
    }
  }
});

test("P4 não recebe permissões de gestão de Banco de Horas", async () => {
  for (const acao of acoesGestao) {
    const resultado = await executar({ role: "p4", ...acao });
    assert.equal(resultado.status, 403, acao.nome);
    assert.equal(resultado.chamadas.some(({ path }) => path === acao.escrita), false, acao.nome);
  }
});

test("validação inválida continua distinta de autorização negada", async () => {
  const body = { acao: "movimentar", policial_id: "policial-2", tipo: "credito", horas: 0, descricao: "Registro de teste", turno: "A" };
  const p1 = await executar({ role: "p1", method: "POST", body });
  assert.equal(p1.status, 400);
  assert.equal(p1.chamadas.some(({ path }) => path === "/rest/v1/banco_horas_movimentacoes"), false);

  const p4 = await executar({ role: "p4", method: "POST", body });
  assert.equal(p4.status, 403);
  assert.equal(p4.chamadas.some(({ path }) => path === "/rest/v1/banco_horas_movimentacoes"), false);
});

test("consulta do calendário devolve somente dispensas deferidas e campos operacionais mínimos", async () => {
  const ator = "11111111-1111-4111-8111-111111111111";
  const resultado = await executar({
    role: "policial",
    actorId: ator,
    method: "GET",
    query: { uso: "permutas-calendario", policiais_ids: ator, data_inicio: "2026-11-01", data_fim: "2026-11-30" },
  });
  assert.equal(resultado.status, 200);
  const consulta = resultado.chamadas.find(({ path }) => path === "/rest/v1/banco_horas_solicitacoes");
  assert.ok(consulta);
  assert.equal(consulta.search.get("select"), "id,policial_id,data_servico,turno,turno_descricao,horas_solicitadas,origem_dispensa,status");
  assert.deepEqual(consulta.search.getAll("tipo"), ["eq.dispensa"]);
  assert.deepEqual(consulta.search.getAll("status"), ["eq.deferida"]);
  assert.equal(consulta.search.get("policial_id"), `in.(${ator})`);
  assert.equal(resultado.chamadas.some(({ path }) => path === "/rest/v1/banco_horas_movimentacoes"), false);
});

test("policial comum não consulta dispensas de outro policial", async () => {
  const ator = "11111111-1111-4111-8111-111111111111";
  const outro = "22222222-2222-4222-8222-222222222222";
  const resultado = await executar({
    role: "policial",
    actorId: ator,
    method: "GET",
    query: { uso: "permutas-calendario", policiais_ids: outro, data_inicio: "2026-11-01", data_fim: "2026-11-30" },
  });
  assert.equal(resultado.status, 403);
  assert.equal(resultado.chamadas.some(({ path }) => path === "/rest/v1/banco_horas_solicitacoes"), false);
});

test("P1, escalante P1, Oficial e Master consultam dispensas do calendário autorizado", async () => {
  const ator = "11111111-1111-4111-8111-111111111111";
  const alvo = "22222222-2222-4222-8222-222222222222";
  for (const role of ["p1", "p1_escalante_servico_ordinario", "oficial", "master"]) {
    const resultado = await executar({
      role,
      actorId: ator,
      method: "GET",
      query: { uso: "permutas-calendario", policiais_ids: alvo, data_inicio: "2026-11-01", data_fim: "2026-11-30" },
    });
    assert.equal(resultado.status, 200, role);
    assert.ok(resultado.chamadas.some(({ path }) => path === "/rest/v1/banco_horas_solicitacoes"), role);
  }
});
