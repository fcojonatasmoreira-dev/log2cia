import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelarPermuta,
  confirmarPermuta,
  criarPermuta,
  decidirPermuta,
  listarCalendariosMini,
  listarPermutas,
} from "../src/services/permutasService.js";

test("serviço frontend envia os payloads que o handler e as RPCs esperam", async () => {
  const fetchAnterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, options) => {
    chamadas.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return Response.json({ ok: true });
  };
  const servico = {
    data: "2027-01-01", turno: "A", horario_inicio: "08:00",
    horario_fim: "16:00", descricao: "Patrulhamento informado",
  };
  const motivo = "Necessidade de atendimento familiar";
  try {
    await criarPermuta({ tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: "destinatario", motivo, servico });
    await confirmarPermuta("permuta", servico);
    await decidirPermuta("permuta", true, "Serviços conferidos", true);
    await cancelarPermuta("permuta", "Motivo administrativo");
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  assert.deepEqual(chamadas.map(({ url, options, body }) => ({ url, method: options.method, credentials: options.credentials, body })), [
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: "destinatario", motivo, servico } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "confirmar", permuta_id: "permuta", servico } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "decidir", permuta_id: "permuta", deferir: true, justificativa: "Serviços conferidos", servicos_conferidos: true } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "cancelar", permuta_id: "permuta", justificativa: "Motivo administrativo" } },
  ]);
});

test("listagem da tela policial solicita apenas as permutas do usuário autenticado", async () => {
  const fetchAnterior = globalThis.fetch;
  let chamada;
  globalThis.fetch = async (url, options) => {
    chamada = { url, options };
    return Response.json({ permutas: [] });
  };
  try {
    await listarPermutas({ policial_id: "11111111-1111-4111-8111-111111111111" });
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  const url = new URL(chamada.url, "http://localhost");
  assert.equal(url.pathname, "/api/permutas");
  assert.equal(url.searchParams.get("policial_id"), "11111111-1111-4111-8111-111111111111");
  assert.equal(chamada.options.credentials, "include");
});

test("listagem administrativa encaminha filtros combinados à API existente", async () => {
  const fetchAnterior = globalThis.fetch;
  let url;
  globalThis.fetch = async (destino) => {
    url = destino;
    return Response.json({ permutas: [] });
  };
  try {
    await listarPermutas({
      policial_id: "11111111-1111-4111-8111-111111111111",
      status: "AGUARDANDO_ANALISE",
      tipo: "TROCA_RECIPROCA",
      data_inicio: "2026-11-01",
      data_fim: "2026-11-30",
    });
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  const query = new URL(url, "http://localhost").searchParams;
  assert.equal(query.get("policial_id"), "11111111-1111-4111-8111-111111111111");
  assert.equal(query.get("status"), "AGUARDANDO_ANALISE");
  assert.equal(query.get("tipo"), "TROCA_RECIPROCA");
  assert.equal(query.get("data_inicio"), "2026-11-01");
  assert.equal(query.get("data_fim"), "2026-11-30");
});

test("consulta do calendário encaminha tipo e intervalo de datas à mesma API", async () => {
  const fetchAnterior = globalThis.fetch;
  let url;
  globalThis.fetch = async (destino) => {
    url = destino;
    return Response.json({ permutas: [] });
  };
  try {
    await listarPermutas({
      policial_id: "11111111-1111-4111-8111-111111111111",
      status: "DEFERIDA",
      calendario: "individual",
      participacao: "substituiu",
      tipo: "TROCA_RECIPROCA",
      data_inicio: "2026-11-30",
      data_fim: "2027-01-10",
    });
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  const query = new URL(url, "http://localhost").searchParams;
  assert.equal(query.get("tipo"), "TROCA_RECIPROCA");
  assert.equal(query.get("data_inicio"), "2026-11-30");
  assert.equal(query.get("data_fim"), "2027-01-10");
  assert.equal(query.get("status"), "DEFERIDA");
  assert.equal(query.get("calendario"), "individual");
  assert.equal(query.get("participacao"), "substituiu");
  assert.equal(query.get("policial_id"), "11111111-1111-4111-8111-111111111111");
});

test("mini calendários reutilizam a API protegida e dividem consultas em lotes de 25 IDs únicos", async () => {
  const fetchAnterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, options) => {
    chamadas.push({ url, options });
    return Response.json({ calendarios: [] });
  };
  const ids = Array.from({ length: 26 }, (_, indice) => `policial-${indice}`);
  try {
    await listarCalendariosMini([...ids, ids[0]], "2026-11-01", "2026-12-06");
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  assert.equal(chamadas.length, 2);
  assert.ok(chamadas.every(({ options }) => options.credentials === "include"));
  const consultas = chamadas.map(({ url }) => new URL(url, "http://localhost").searchParams);
  assert.deepEqual(consultas.map((query) => query.get("policiais_ids").split(",").length), [25, 1]);
  assert.ok(consultas.every((query) => query.get("calendario") === "mini"
    && query.get("data_inicio") === "2026-11-01" && query.get("data_fim") === "2026-12-06"));
});
