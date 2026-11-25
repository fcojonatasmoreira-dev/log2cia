import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelarPermuta,
  confirmarPermuta,
  criarPermuta,
  decidirPermuta,
  editarPermuta,
  atualizarServicoEscala,
  listarControleEscala,
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
    await editarPermuta({ permuta_id: "permuta", atualizada_em: "2026-11-24T15:00:00Z", destinatario_id: "destinatario-novo", motivo, servico });
    await confirmarPermuta("permuta", servico);
    await decidirPermuta("permuta", true, true, {
      mensagem_escalante: "Mensagem P1",
      mensagem_policial_1: "Mensagem P1 da permuta",
      mensagem_policial_2: "Mensagem P2 da permuta",
    });
    await cancelarPermuta("permuta", "Motivo administrativo");
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  assert.deepEqual(chamadas.map(({ url, options, body }) => ({ url, method: options.method, credentials: options.credentials, body })), [
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: "destinatario", motivo, servico } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "editar", permuta_id: "permuta", atualizada_em: "2026-11-24T15:00:00Z", destinatario_id: "destinatario-novo", motivo, servico } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "confirmar", permuta_id: "permuta", servico } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "decidir", permuta_id: "permuta", deferir: true, servicos_conferidos: true, mensagem_escalante: "Mensagem P1", mensagem_policial_1: "Mensagem P1 da permuta", mensagem_policial_2: "Mensagem P2 da permuta" } },
    { url: "/api/permutas", method: "POST", credentials: "include", body: { acao: "cancelar", permuta_id: "permuta", justificativa: "Motivo administrativo" } },
  ]);
});

test("serviço do Controle de Escala usa a API protegida com filtros e ações explícitas", async () => {
  const anterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, options = {}) => {
    chamadas.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return Response.json({ servicos: [], indicadores: {} });
  };
  try {
    await listarControleEscala({ data_inicio: "2026-11-01", data_fim: "2026-11-30", situacao: "PENDENTE_NA_ESCALA", tipo: "TROCA_RECIPROCA", policial_id: "policial", turno: "A" });
    await atualizarServicoEscala("escala-id", "APLICAR");
  } finally {
    globalThis.fetch = anterior;
  }
  const consulta = new URL(chamadas[0].url, "http://localhost");
  assert.equal(consulta.pathname, "/api/permutas");
  assert.equal(consulta.searchParams.get("controle_escala"), "1");
  assert.equal(consulta.searchParams.get("data_inicio"), "2026-11-01");
  assert.equal(consulta.searchParams.get("data_fim"), "2026-11-30");
  assert.equal(consulta.searchParams.get("situacao"), "PENDENTE_NA_ESCALA");
  assert.deepEqual(chamadas[1].body, { acao: "controle_escala", escala_id: "escala-id", operacao: "APLICAR" });
  assert.equal(chamadas[1].options.credentials, "include");
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

test("abertura de notificação navega para a permuta indicada pelo parâmetro protegido", async () => {
  const fetchAnterior = globalThis.fetch;
  let url;
  globalThis.fetch = async (destino) => { url = destino; return Response.json({ permutas: [] }); };
  const permutaId = "30000000-0000-4000-8000-000000000001";
  try {
    await listarPermutas({ permuta_id: permutaId });
  } finally {
    globalThis.fetch = fetchAnterior;
  }
  const query = new URL(url, "http://localhost").searchParams;
  assert.equal(query.get("permuta_id"), permutaId);
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
