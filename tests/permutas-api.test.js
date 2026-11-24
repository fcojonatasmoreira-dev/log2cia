import test from "node:test";
import assert from "node:assert/strict";
import handler from "../server/api/permutas/index.js";
import { criarSessao } from "../server/api/auth/_session.js";

const ATOR_ID = "11111111-1111-4111-8111-111111111111";
const OUTRO_ID = "22222222-2222-4222-8222-222222222222";
const TERCEIRO_ID = "44444444-4444-4444-8444-444444444444";
const PERMUTA_ID = "33333333-3333-4333-8333-333333333333";

function resposta() {
  return {
    statusCode: 200,
    status(codigo) { this.statusCode = codigo; return this; },
    setHeader() { return this; },
    json(body) { this.body = body; return this; },
  };
}

async function executar({ role, body, actorId = ATOR_ID, permutaInfo = {}, destinatarioInfo, sessaoValida = true }) {
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
    chamadas.push({ path: url.pathname, metodo, body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname === "/rest/v1/policiais") {
      if (url.searchParams.get("select") === "id,status,posto_graduacao") {
        return Response.json(destinatarioInfo || { id: OUTRO_ID, status: "EM ATIVIDADE", posto_graduacao: "Soldado" });
      }
      return Response.json({ id: actorId, auth_version: 0, role, credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/permutas_servico") {
      return Response.json({ id: PERMUTA_ID, tipo: "SUBSTITUICAO_SIMPLES", solicitante_id: OUTRO_ID, destinatario_id: ATOR_ID, status: "AGUARDANDO_CONFIRMACAO", ...permutaInfo });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      if (url.pathname.endsWith("permutas_servico_criar_v1")) return Response.json(PERMUTA_ID);
      const status = url.pathname.endsWith("decidir_v2")
        ? (JSON.parse(init.body).p_deferir ? "DEFERIDA" : "INDEFERIDA")
        : url.pathname.endsWith("editar_v1") ? "AGUARDANDO_CONFIRMACAO"
        : url.pathname.endsWith("confirmar_v1") ? "AGUARDANDO_ANALISE" : "CANCELADA";
      return Response.json(status);
    }
    return Response.json({ message: `Requisição inesperada: ${url.pathname}` }, { status: 404 });
  };
  const req = {
    method: "POST", query: {}, body,
      headers: { cookie: sessaoValida ? `log2cia_session=${criarSessao({ id: actorId, auth_version: 0 })}` : "log2cia_session=invalida" },
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

async function executarListagem({ role = "oficial", query = {}, calendarioGrande = false, actorId = ATOR_ID } = {}) {
  const anterior = {
    fetch: globalThis.fetch,
    sessionSecret: process.env.SESSION_SECRET,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const chamadas = [];
  const faixas = [];
  let paginasManifestacoesPeriodo = 0;
  const idsGrandes = calendarioGrande
    ? Array.from({ length: 1001 }, (_, indice) => `60000000-0000-4000-8000-${String(indice + 1).padStart(12, "0")}`)
    : [];
  const manifestsGrandes = idsGrandes.map((permutaId, indice) => ({
    id: `manifestacao-${indice}`, permuta_id: permutaId, policial_id: ATOR_ID, substituto_id: OUTRO_ID,
    data_servico: "2026-11-25", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Serviço",
  }));
  const permutasGrandes = idsGrandes.map((id) => ({
    id, tipo: "SUBSTITUICAO_SIMPLES", solicitante_id: ATOR_ID, destinatario_id: OUTRO_ID,
    status: "DEFERIDA", criada_em: "2026-11-20T10:00:00Z",
  }));
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url);
    const range = init.headers?.get?.("Range") || init.headers?.Range
      || Object.entries(init.headers || {}).find(([nome]) => nome.toLowerCase() === "range")?.[1]
      || input.headers?.get?.("Range") || "";
    if (range) faixas.push({ path: url.pathname, range });
    if (calendarioGrande) {
      if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") {
        return Response.json({ id: actorId, auth_version: 0, role, credencial_provisionada: true, primeiro_acesso: false });
      }
      if (url.pathname === "/rest/v1/permutas_servico_manifestacoes" && url.searchParams.get("select") === "permuta_id") {
        const inicio = paginasManifestacoesPeriodo++ * 1000;
        return Response.json(idsGrandes.slice(inicio, inicio + 1000).map((permuta_id) => ({ permuta_id })));
      }
      if (url.pathname === "/rest/v1/permutas_servico" && url.searchParams.has("id")) {
        const ids = (url.searchParams.get("id").match(/in\.\((.*)\)/)?.[1] || "").split(",").filter(Boolean);
        return Response.json(permutasGrandes.filter((permuta) => ids.includes(permuta.id)));
      }
      if (url.pathname === "/rest/v1/permutas_servico_manifestacoes") {
        const ids = (url.searchParams.get("permuta_id").match(/in\.\((.*)\)/)?.[1] || "").split(",").filter(Boolean);
        return Response.json(manifestsGrandes.filter((item) => ids.includes(item.permuta_id)));
      }
      if (["/rest/v1/permutas_servico_confirmacoes", "/rest/v1/permutas_servico_historico"].includes(url.pathname)) return Response.json([]);
      if (url.pathname === "/rest/v1/policiais") return Response.json([]);
      return Response.json({ message: `Requisição inesperada: ${url.pathname}` }, { status: 404 });
    }
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") {
      return Response.json({ id: actorId, auth_version: 0, role, credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/permutas_servico") {
      return Response.json([{
        id: PERMUTA_ID, tipo: "TROCA_RECIPROCA", solicitante_id: ATOR_ID, destinatario_id: OUTRO_ID,
        status: "DEFERIDA", motivo: "Motivo original", criada_em: "2026-11-20T10:00:00Z",
      }]);
    }
    if (url.pathname === "/rest/v1/permutas_servico_manifestacoes" && url.searchParams.get("select") === "permuta_id") {
      return Response.json([{ permuta_id: PERMUTA_ID }]);
    }
    if (url.pathname === "/rest/v1/permutas_servico_manifestacoes") {
      return Response.json([
        { id: "manifestacao-1", permuta_id: PERMUTA_ID, policial_id: ATOR_ID, substituto_id: OUTRO_ID, data_servico: "2026-11-25", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Serviço 1" },
        { id: "manifestacao-2", permuta_id: PERMUTA_ID, policial_id: OUTRO_ID, substituto_id: ATOR_ID, data_servico: "2026-11-28", turno: "B", horario_inicio: "18:00", horario_fim: "06:00", descricao: "Serviço 2" },
      ]);
    }
    if (url.pathname === "/rest/v1/permutas_servico_confirmacoes") return Response.json([]);
    if (url.pathname === "/rest/v1/permutas_servico_historico") {
      return Response.json([{
        id: 1, permuta_id: PERMUTA_ID, ator_id: TERCEIRO_ID, tipo_evento: "DEFERIDA",
        estado_novo: "DEFERIDA", ocorrido_em: "2026-11-21T12:00:00Z", justificativa: "Observação antiga privada",
        mensagem_escalante: "Orientação ao escalante", mensagem_policial_1: "Mensagem ao solicitante",
        mensagem_policial_2: "Mensagem ao destinatário",
      }]);
    }
    if (url.pathname === "/rest/v1/policiais") {
      return Response.json([
        { id: ATOR_ID, nome_completo: "Nome A", nome_guerra: "ALFA", posto_graduacao: "Soldado", numeral: "11" },
        { id: OUTRO_ID, nome_completo: "Nome B", nome_guerra: "BRAVO", posto_graduacao: "Cabo", numeral: "22" },
        { id: TERCEIRO_ID, nome_completo: "Nome C", nome_guerra: "CHARLIE", posto_graduacao: "Tenente", numeral: "33" },
      ]);
    }
    return Response.json({ message: `Requisição inesperada: ${url.pathname}` }, { status: 404 });
  };
  const req = {
    method: "GET", query,
    headers: { cookie: `log2cia_session=${criarSessao({ id: actorId, auth_version: 0 })}` },
  };
  const res = resposta();
  try {
    await handler(req, res);
    return { status: res.statusCode, body: res.body, chamadas, faixas };
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

test("policial não pode deferir, indeferir nem cancelar", async () => {
  for (const body of [
    { acao: "decidir", permuta_id: PERMUTA_ID, deferir: true, justificativa: "Deferida" },
    { acao: "decidir", permuta_id: PERMUTA_ID, deferir: false, justificativa: "Indeferida" },
    { acao: "cancelar", permuta_id: PERMUTA_ID, justificativa: "Cancelamento" },
  ]) {
    const resultado = await executar({ role: "policial", body });
    assert.equal(resultado.status, 403);
    assert.equal(resultado.chamadas.some((chamada) => chamada.path.startsWith("/rest/v1/rpc/")), false);
  }
});

test("P1 consulta geral, mas não pode deferir, indeferir nem cancelar", async () => {
  for (const body of [
    { acao: "decidir", permuta_id: PERMUTA_ID, deferir: true, justificativa: "Deferimento", servicos_conferidos: true },
    { acao: "decidir", permuta_id: PERMUTA_ID, deferir: false, justificativa: "Motivo", servicos_conferidos: true },
    { acao: "cancelar", permuta_id: PERMUTA_ID, justificativa: "Motivo" },
  ]) {
    const resultado = await executar({ role: "p1", body });
    assert.equal(resultado.status, 403);
    assert.equal(resultado.chamadas.some((chamada) => chamada.path.startsWith("/rest/v1/rpc/")), false);
  }
});

test("todas as operações protegidas exigem sessão válida antes de acessar o banco", async () => {
  for (const body of [
    { acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: OUTRO_ID, servico: {} },
    { acao: "editar", permuta_id: PERMUTA_ID, destinatario_id: OUTRO_ID, servico: {} },
    { acao: "confirmar", permuta_id: PERMUTA_ID },
    { acao: "decidir", permuta_id: PERMUTA_ID, deferir: true },
    { acao: "cancelar", permuta_id: PERMUTA_ID },
  ]) {
    const resultado = await executar({ role: "master", body, sessaoValida: false });
    assert.equal(resultado.status, 401);
    assert.deepEqual(resultado.chamadas, []);
  }
});

test("cada policial envolvido pode registrar somente a própria confirmação", async () => {
  for (const actorId of [ATOR_ID, OUTRO_ID]) {
    const resultado = await executar({
      role: "policial", actorId,
      permutaInfo: { solicitante_id: OUTRO_ID, destinatario_id: ATOR_ID },
      body: { acao: "confirmar", permuta_id: PERMUTA_ID, policial_id: "forjado" },
    });
    assert.equal(resultado.status, 200);
    const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_confirmar_v1"));
    assert.equal(chamada.body.p_ator_id, actorId);
  }
});

test("policial alheio à permuta não pode confirmar nem indicar outro ator", async () => {
  const resultado = await executar({
    role: "policial", actorId: TERCEIRO_ID,
    permutaInfo: { solicitante_id: OUTRO_ID, destinatario_id: ATOR_ID },
    body: { acao: "confirmar", permuta_id: PERMUTA_ID, policial_id: ATOR_ID },
  });
  assert.equal(resultado.status, 403);
  assert.equal(resultado.chamadas.some((item) => item.path.endsWith("permutas_servico_confirmar_v1")), false);
});

test("criação mapeia data, turno, horário e descrição para a assinatura SQL", async () => {
  const servico = { data: "2027-01-01", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Patrulhamento" };
  const motivo = "Necessidade de serviço";
  const resultado = await executar({
    role: "policial",
    body: { acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", solicitante_id: TERCEIRO_ID, destinatario_id: OUTRO_ID, ator_id: TERCEIRO_ID, motivo, servico },
  });
  assert.equal(resultado.status, 201);
  const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_criar_v1"));
  assert.deepEqual(chamada.body, {
    p_tipo: "SUBSTITUICAO_SIMPLES", p_solicitante_id: ATOR_ID, p_destinatario_id: OUTRO_ID,
    p_data: servico.data, p_turno: servico.turno, p_inicio: servico.horario_inicio,
    p_fim: servico.horario_fim, p_descricao: servico.descricao, p_motivo: motivo,
  });
  assert.deepEqual(resultado.body.confirmacoes_pendentes, [OUTRO_ID], "somente o destinatário permanece pendente");
});

test("edição usa identidade autenticada, valida participante e encaminha campos à RPC", async () => {
  const servico = { data: "2027-01-03", turno: " C ", horario_inicio: "20:00", horario_fim: "04:00", descricao: " Patrulhamento atualizado " };
  const atualizadaEm = "2026-11-24T15:00:00.000Z";
  const resultado = await executar({ role: "policial", body: {
    acao: "editar", permuta_id: PERMUTA_ID, atualizada_em: atualizadaEm, solicitante_id: TERCEIRO_ID, ator_id: TERCEIRO_ID,
    policial_id: TERCEIRO_ID, destinatario_id: OUTRO_ID, motivo: " Motivo revisado ", servico,
  } });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.status, "AGUARDANDO_CONFIRMACAO");
  const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_editar_v1"));
  assert.deepEqual(chamada.body, {
    p_permuta_id: PERMUTA_ID, p_ator_id: ATOR_ID, p_versao_esperada: atualizadaEm, p_destinatario_id: OUTRO_ID,
    p_motivo: "Motivo revisado", p_data: servico.data, p_turno: "C",
    p_inicio: servico.horario_inicio, p_fim: servico.horario_fim, p_descricao: "Patrulhamento atualizado",
  });
});

test("edição bloqueia destinatário inelegível e campos inválidos antes da RPC", async () => {
  const base = { role: "policial", body: {
    acao: "editar", permuta_id: PERMUTA_ID, atualizada_em: "2026-11-24T15:00:00.000Z", destinatario_id: OUTRO_ID,
    motivo: "Motivo", servico: { data: "2027-01-03", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Serviço" },
  } };
  const oficial = await executar({ ...base, destinatarioInfo: { id: OUTRO_ID, status: "EM ATIVIDADE", posto_graduacao: "Major" } });
  assert.equal(oficial.status, 400);
  assert.equal(oficial.chamadas.some((item) => item.path.endsWith("permutas_servico_editar_v1")), false);
  const invalido = await executar({ role: "policial", body: { ...base.body, motivo: "  " } });
  assert.equal(invalido.status, 400);
  assert.equal(invalido.chamadas.some((item) => item.path.endsWith("permutas_servico_editar_v1")), false);
});

test("criação exige motivo obrigatório com limite de 500 caracteres Unicode antes da RPC", async () => {
  for (const motivo of ["", "  ", "x".repeat(501), "😀".repeat(501)]) {
    const resultado = await executar({ role: "policial", body: {
      acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: OUTRO_ID, motivo,
      servico: { data: "2027-01-01", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Patrulhamento" },
    } });
    assert.equal(resultado.status, 400);
    assert.equal(resultado.chamadas.some((item) => item.path.endsWith("permutas_servico_criar_v1")), false);
  }
  const limite = await executar({ role: "policial", body: {
    acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: OUTRO_ID, motivo: "x".repeat(500),
    servico: { data: "2027-01-01", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Patrulhamento" },
  } });
  assert.equal(limite.status, 201);
  const limiteUnicode = await executar({ role: "policial", body: {
    acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: OUTRO_ID, motivo: "😀".repeat(500),
    servico: { data: "2027-01-01", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Patrulhamento" },
  } });
  assert.equal(limiteUnicode.status, 201);
});

test("backend rejeita destinatário inativo ou ocupante de posto de oficial", async () => {
  const base = { role: "policial", body: {
    acao: "criar", tipo: "SUBSTITUICAO_SIMPLES", destinatario_id: OUTRO_ID, motivo: "Necessidade de serviço",
    servico: { data: "2027-01-01", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Patrulhamento" },
  } };
  for (const destinatarioInfo of [
    { id: OUTRO_ID, status: "INATIVO", posto_graduacao: "Soldado" },
    { id: OUTRO_ID, status: "EM ATIVIDADE", posto_graduacao: "Major" },
  ]) {
    const resultado = await executar({ ...base, destinatarioInfo });
    assert.equal(resultado.status, 400);
    assert.equal(resultado.chamadas.some((item) => item.path.endsWith("permutas_servico_criar_v1")), false);
  }
});

test("confirmação recíproca envia o segundo serviço com os argumentos da RPC", async () => {
  const servico = { data: "2027-01-03", turno: "B", horario_inicio: "18:00", horario_fim: "06:00", descricao: "Permanência" };
  const resultado = await executar({
    role: "policial", actorId: ATOR_ID,
    permutaInfo: { tipo: "TROCA_RECIPROCA", solicitante_id: OUTRO_ID, destinatario_id: ATOR_ID },
    body: { acao: "confirmar", permuta_id: PERMUTA_ID, servico },
  });
  assert.equal(resultado.status, 200);
  const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_confirmar_v1"));
  assert.deepEqual(chamada.body, {
    p_permuta_id: PERMUTA_ID, p_ator_id: ATOR_ID, p_data: servico.data,
    p_turno: servico.turno, p_inicio: servico.horario_inicio,
    p_fim: servico.horario_fim, p_descricao: servico.descricao,
  });
});

test("Oficial registra deferimento e indeferimento como decisões autenticadas", async () => {
  for (const deferir of [true, false]) {
    const resultado = await executar({
      role: "oficial",
      body: { acao: "decidir", permuta_id: PERMUTA_ID, deferir, servicos_conferidos: true, ator_id: "forjado" },
    });
    assert.equal(resultado.status, 200);
    assert.equal(resultado.body.status, deferir ? "DEFERIDA" : "INDEFERIDA");
    const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_decidir_v2"));
    assert.equal(chamada.body.p_ator_id, ATOR_ID);
    assert.equal(chamada.body.p_deferir, deferir);
    assert.equal(chamada.body.p_servicos_conferidos, true);
    assert.equal(chamada.body.p_mensagem_escalante, null);
    assert.equal(chamada.body.p_mensagem_policial_1, null);
    assert.equal(chamada.body.p_mensagem_policial_2, null);
  }
});

test("decisão administrativa exige declaração de conferência dos serviços", async () => {
  const resultado = await executar({
    role: "oficial",
    body: { acao: "decidir", permuta_id: PERMUTA_ID, deferir: true, justificativa: "Deferimento" },
  });
  assert.equal(resultado.status, 400);
  assert.equal(resultado.chamadas.some((item) => item.path.endsWith("permutas_servico_decidir_v2")), false);
});

test("decisão administrativa aceita mensagens opcionais e encaminha mensagens diferentes", async () => {
  const resultado = await executar({
    role: "oficial",
    body: { acao: "decidir", permuta_id: PERMUTA_ID, deferir: true, servicos_conferidos: true,
      mensagem_escalante: "Escala ajustada", mensagem_policial_1: "Ciente, solicitante", mensagem_policial_2: "Ciente, destinatário" },
  });
  assert.equal(resultado.status, 200);
  const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_decidir_v2"));
  assert.deepEqual({
    escalante: chamada.body.p_mensagem_escalante,
    policial1: chamada.body.p_mensagem_policial_1,
    policial2: chamada.body.p_mensagem_policial_2,
  }, { escalante: "Escala ajustada", policial1: "Ciente, solicitante", policial2: "Ciente, destinatário" });
});

test("indeferimento aceita mensagem parcial, mas limita cada mensagem", async () => {
  const parcial = await executar({
    role: "oficial",
    body: { acao: "decidir", permuta_id: PERMUTA_ID, deferir: false, servicos_conferidos: true, mensagem_policial_2: "Destinatário" },
  });
  assert.equal(parcial.status, 200);
  const chamada = parcial.chamadas.find((item) => item.path.endsWith("permutas_servico_decidir_v2"));
  assert.equal(chamada.body.p_mensagem_escalante, null);
  assert.equal(chamada.body.p_mensagem_policial_1, null);
  assert.equal(chamada.body.p_mensagem_policial_2, "Destinatário");

  const longa = await executar({ role: "oficial", body: {
    acao: "decidir", permuta_id: PERMUTA_ID, deferir: false, servicos_conferidos: true,
    mensagem_escalante: "x".repeat(3001),
  } });
  assert.equal(longa.status, 400);
  assert.equal(longa.body.error, "Cada mensagem pode ter até 3000 caracteres.");
  assert.equal(longa.chamadas.some((item) => item.path.endsWith("permutas_servico_decidir_v2")), false);
});

test("cancelamento administrativo exige justificativa não vazia", async () => {
  const resultado = await executar({
    role: "oficial",
    body: { acao: "cancelar", permuta_id: PERMUTA_ID, justificativa: " " },
  });
  assert.equal(resultado.status, 400);
  assert.equal(resultado.chamadas.some((item) => item.path.endsWith("permutas_servico_cancelar_v1")), false);
});

test("Master pode cancelar permuta deferida e o endpoint envia sua identidade real", async () => {
  const resultado = await executar({
    role: "master",
    body: { acao: "cancelar", permuta_id: PERMUTA_ID, justificativa: "Necessidade administrativa", ator_id: "forjado" },
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.status, "CANCELADA");
  const chamada = resultado.chamadas.find((item) => item.path.endsWith("permutas_servico_cancelar_v1"));
  assert.equal(chamada.body.p_ator_id, ATOR_ID);
});

test("calendário filtra por período e resolve apenas nomes mínimos dos atores do histórico", async () => {
  const resultado = await executarListagem({
    role: "p1",
    query: {
      calendario: "individual", policial_id: OUTRO_ID, participacao: "foi_substituido",
      data_inicio: "2026-11-24", data_fim: "2026-12-06",
      tipo: "TROCA_RECIPROCA", status: "DEFERIDA",
    },
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.permutas[0].motivo, "Motivo original");
  assert.equal(resultado.body.permutas[0].historico[0].ator.nome_guerra, "CHARLIE");
  assert.equal(resultado.body.permutas[0].historico[0].ator.posto_graduacao, "Tenente");
  assert.equal(resultado.body.permutas[0].historico[0].ator.numeral, "33");
  const buscaPeriodo = resultado.chamadas.find((url) => url.pathname.endsWith("permutas_servico_manifestacoes") && url.searchParams.get("select") === "permuta_id");
  assert.equal(buscaPeriodo.searchParams.get("data_servico"), "gte.2026-11-24");
  const consultaPermutas = resultado.chamadas.find((url) => url.pathname.endsWith("permutas_servico"));
  assert.equal(consultaPermutas.searchParams.get("tipo"), "eq.TROCA_RECIPROCA");
  assert.equal(consultaPermutas.searchParams.get("status"), "eq.DEFERIDA");
  const consultaManifestacoesPeriodo = resultado.chamadas.find((url) => url.pathname.endsWith("permutas_servico_manifestacoes") && url.searchParams.get("select") === "permuta_id");
  assert.equal(consultaManifestacoesPeriodo.searchParams.get("policial_id"), `eq.${OUTRO_ID}`);
  const consultaIdentidades = resultado.chamadas.find((url) => url.pathname.endsWith("policiais") && url.searchParams.get("select") === "id,nome_completo,nome_guerra,posto_graduacao,numeral");
  assert.ok(consultaIdentidades.searchParams.get("id").includes(TERCEIRO_ID));
  assert.equal(consultaIdentidades.searchParams.has("matricula"), false);
  assert.equal(consultaIdentidades.searchParams.has("unidade"), false);
});

test("histórico filtra mensagens e justificativa antiga no backend por papel e participação", async () => {
  const eventoVisivel = (resultado) => resultado.body.permutas[0].historico[0];
  const p1 = await executarListagem({ role: "p1", actorId: TERCEIRO_ID });
  const eventoP1 = eventoVisivel(p1);
  assert.equal(eventoP1.mensagem_escalante, "Orientação ao escalante");
  assert.equal(Object.hasOwn(eventoP1, "mensagem_policial_1"), false);
  assert.equal(Object.hasOwn(eventoP1, "mensagem_policial_2"), false);
  assert.equal(Object.hasOwn(eventoP1, "justificativa"), false);

  const escalante = await executarListagem({ role: "p1_escalante_servico_ordinario", actorId: TERCEIRO_ID });
  const eventoEscalante = eventoVisivel(escalante);
  assert.equal(eventoEscalante.mensagem_escalante, "Orientação ao escalante");
  assert.equal(Object.hasOwn(eventoEscalante, "mensagem_policial_1"), false);
  assert.equal(Object.hasOwn(eventoEscalante, "mensagem_policial_2"), false);

  const solicitante = await executarListagem({ role: "policial", actorId: ATOR_ID });
  const eventoSolicitante = eventoVisivel(solicitante);
  assert.equal(eventoSolicitante.mensagem_policial_1, "Mensagem ao solicitante");
  assert.equal(Object.hasOwn(eventoSolicitante, "mensagem_escalante"), false);
  assert.equal(Object.hasOwn(eventoSolicitante, "mensagem_policial_2"), false);
  assert.equal(Object.hasOwn(eventoSolicitante, "justificativa"), false);

  const destinatario = await executarListagem({ role: "policial", actorId: OUTRO_ID });
  const eventoDestinatario = eventoVisivel(destinatario);
  assert.equal(eventoDestinatario.mensagem_policial_2, "Mensagem ao destinatário");
  assert.equal(Object.hasOwn(eventoDestinatario, "mensagem_policial_1"), false);
  assert.equal(Object.hasOwn(eventoDestinatario, "mensagem_escalante"), false);

  for (const role of ["oficial", "master"]) {
    const admin = await executarListagem({ role, actorId: TERCEIRO_ID });
    const eventoAdmin = eventoVisivel(admin);
    assert.equal(eventoAdmin.mensagem_escalante, "Orientação ao escalante");
    assert.equal(eventoAdmin.mensagem_policial_1, "Mensagem ao solicitante");
    assert.equal(eventoAdmin.mensagem_policial_2, "Mensagem ao destinatário");
    assert.equal(eventoAdmin.justificativa, "Observação antiga privada");
  }

  const p1Participante = await executarListagem({ role: "p1", actorId: ATOR_ID });
  const eventoUniao = eventoVisivel(p1Participante);
  assert.equal(eventoUniao.mensagem_escalante, "Orientação ao escalante");
  assert.equal(eventoUniao.mensagem_policial_1, "Mensagem ao solicitante");
  assert.equal(Object.hasOwn(eventoUniao, "mensagem_policial_2"), false);
});

test("calendário individual aplica a mesma filtragem das mensagens no backend", async () => {
  const resultado = await executarListagem({
    role: "p1", actorId: TERCEIRO_ID,
    query: { calendario: "individual", policial_id: OUTRO_ID, data_inicio: "2026-11-24", data_fim: "2026-12-06" },
  });
  const evento = resultado.body.permutas[0].historico[0];
  assert.equal(evento.mensagem_escalante, "Orientação ao escalante");
  assert.equal(Object.hasOwn(evento, "mensagem_policial_1"), false);
  assert.equal(Object.hasOwn(evento, "mensagem_policial_2"), false);
  assert.equal(Object.hasOwn(evento, "justificativa"), false);
});

test("listagem operacional combina data do serviço, situação, tipo e policial sem duplicar troca recíproca", async () => {
  const resultado = await executarListagem({ role: "p1", query: {
    policial_id: OUTRO_ID,
    data_inicio: "2026-11-24",
    data_fim: "2026-11-30",
    status: "DEFERIDA",
    tipo: "TROCA_RECIPROCA",
  } });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.permutas.length, 1);
  assert.equal(resultado.body.permutas[0].manifestacoes.length, 2);
  const buscaServicos = resultado.chamadas.find((url) => url.pathname.endsWith("permutas_servico_manifestacoes") && url.searchParams.get("select") === "permuta_id");
  assert.deepEqual(buscaServicos.searchParams.getAll("data_servico"), ["gte.2026-11-24", "lte.2026-11-30"]);
  assert.ok(buscaServicos.searchParams.get("or").includes(`policial_id.eq.${OUTRO_ID}`));
  assert.ok(buscaServicos.searchParams.get("or").includes(`substituto_id.eq.${OUTRO_ID}`));
  const consultaPermutas = resultado.chamadas.find((url) => url.pathname.endsWith("permutas_servico"));
  assert.equal(consultaPermutas.searchParams.get("status"), "eq.DEFERIDA");
  assert.equal(consultaPermutas.searchParams.get("tipo"), "eq.TROCA_RECIPROCA");
  assert.ok(consultaPermutas.searchParams.get("or").includes(OUTRO_ID));
});

test("policial comum pode consultar apenas o calendário derivado da própria sessão", async () => {
  const proprio = await executarListagem({ role: "policial", query: {
    calendario: "individual", data_inicio: "2026-11-01", data_fim: "2026-11-30",
  } });
  assert.equal(proprio.status, 200);
  const consultaPropria = proprio.chamadas.find((url) => url.pathname.endsWith("permutas_servico_manifestacoes") && url.searchParams.get("select") === "permuta_id");
  assert.ok(consultaPropria.searchParams.get("or").includes(`policial_id.eq.${ATOR_ID}`));

  const alheio = await executarListagem({ role: "policial", query: {
    calendario: "individual", policial_id: OUTRO_ID, data_inicio: "2026-11-01", data_fim: "2026-11-30",
  } });
  assert.equal(alheio.status, 403);
  assert.equal(alheio.chamadas.some((url) => url.pathname.endsWith("permutas_servico_manifestacoes")), false);
});

test("P1, escalante P1, Oficial e Master podem consultar o calendário de outro policial", async () => {
  for (const role of ["p1", "p1_escalante_servico_ordinario", "oficial", "master"]) {
    const resultado = await executarListagem({ role, query: {
      calendario: "individual", policial_id: OUTRO_ID, data_inicio: "2026-11-01", data_fim: "2026-11-30",
    } });
    assert.equal(resultado.status, 200, role);
    const consulta = resultado.chamadas.find((url) => url.pathname.endsWith("permutas_servico_manifestacoes") && url.searchParams.get("select") === "permuta_id");
    assert.ok(consulta.searchParams.get("or").includes(`policial_id.eq.${OUTRO_ID}`), role);
  }
});

test("mini calendário de policial comum contém só os próprios movimentos e não retorna histórico", async () => {
  const proprio = await executarListagem({ role: "policial", query: {
    calendario: "mini", policiais_ids: ATOR_ID,
    data_inicio: "2026-11-01", data_fim: "2026-11-30",
  } });
  assert.equal(proprio.status, 200);
  assert.equal(proprio.body.calendarios[0].policial_id, ATOR_ID);
  assert.equal(proprio.body.calendarios[0].permutas.length, 1);
  assert.equal(proprio.body.calendarios[0].permutas[0].historico, undefined);
  assert.equal(proprio.body.calendarios[0].permutas[0].confirmacoes, undefined);
  assert.equal(Object.hasOwn(proprio.body.calendarios[0].permutas[0], "mensagem_escalante"), false);
  assert.equal(Object.hasOwn(proprio.body.calendarios[0].permutas[0], "mensagem_policial_1"), false);
  assert.equal(Object.hasOwn(proprio.body.calendarios[0].permutas[0], "mensagem_policial_2"), false);
  assert.equal(proprio.chamadas.some((url) => url.pathname.endsWith("permutas_servico_historico") || url.pathname.endsWith("permutas_servico_confirmacoes")), false);

  const alheio = await executarListagem({ role: "policial", query: {
    calendario: "mini", policiais_ids: OUTRO_ID,
    data_inicio: "2026-11-01", data_fim: "2026-11-30",
  } });
  assert.equal(alheio.status, 403);
  assert.equal(alheio.chamadas.some((url) => url.pathname.endsWith("permutas_servico_manifestacoes")), false);
});

test("P1, Oficial e Master consultam mini calendários de vários policiais sem buscar histórico", async () => {
  for (const role of ["p1", "p1_escalante_servico_ordinario", "oficial", "master"]) {
    const resultado = await executarListagem({ role, query: {
      calendario: "mini", policiais_ids: `${ATOR_ID},${OUTRO_ID},${ATOR_ID}`,
      data_inicio: "2026-11-01", data_fim: "2026-11-30",
    } });
    assert.equal(resultado.status, 200, role);
    assert.deepEqual(resultado.body.calendarios.map((item) => item.policial_id), [ATOR_ID, OUTRO_ID]);
    assert.ok(resultado.body.calendarios.every((item) => item.permutas.length === 1), role);
    assert.equal(resultado.chamadas.some((url) => url.pathname.endsWith("permutas_servico_historico") || url.pathname.endsWith("permutas_servico_confirmacoes")), false);
  }
});

test("calendário individual pagina além de mil serviços e solicitações", async () => {
  const resultado = await executarListagem({
    role: "p1",
    calendarioGrande: true,
    query: {
      calendario: "individual", policial_id: ATOR_ID, participacao: "foi_substituido",
      data_inicio: "2026-11-01", data_fim: "2026-11-30", status: "DEFERIDA",
    },
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.permutas.length, 1001);
  const consultasPaginadas = resultado.chamadas.filter((url) => url.pathname.endsWith("permutas_servico_manifestacoes") && url.searchParams.get("select") === "permuta_id");
  assert.equal(consultasPaginadas.length, 2, "a busca de IDs consulta a segunda página após os primeiros mil serviços");
});

test("filtro de calendário rejeita datas inválidas antes da consulta de permutas", async () => {
  const resultado = await executarListagem({ role: "p1", query: { data_inicio: "2026-02-30", data_fim: "2026-03-05" } });
  assert.equal(resultado.status, 400);
  assert.equal(resultado.chamadas.some((url) => url.pathname.endsWith("permutas_servico")), false);
});
