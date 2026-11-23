import test from "node:test";
import assert from "node:assert/strict";
import { criarSessao } from "../server/api/auth/_session.js";
import { usuarioAutenticado } from "../server/api/_server.js";
import policiaisHandler, { autorizarLeituraPoliciais } from "../server/api/policiais/index.js";
import { podeGerenciarTipoEquipamento, podeLerInventario, validarNovoEquipamento } from "../server/api/equipamentos/index.js";
import { getPoliciaisBancoHoras, getPoliciaisPermutas, getPoliciaisPermutasCalendario } from "../src/services/policiaisService.js";

function resposta() {
  return { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}

test("a validação de sessão nega identidade ausente, assinatura inválida e sessão revogada", async () => {
  const antiga = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  try {
    let consultas = 0;
    const semSessao = resposta();
    assert.equal(await usuarioAutenticado({ headers: {} }, semSessao, { supabaseAdmin: () => { consultas++; } }), null);
    assert.equal(semSessao.statusCode, 401);

    const invalida = resposta();
    assert.equal(await usuarioAutenticado({ headers: { cookie: "log2cia_session=invalido" } }, invalida, { supabaseAdmin: () => { consultas++; } }), null);
    assert.equal(invalida.statusCode, 401);
    assert.equal(consultas, 0);

    const cookie = `log2cia_session=${criarSessao({ id: "policial-1", auth_version: 0 })}`;
    const revogada = resposta();
    const fakeDb = { from(tabela) { assert.equal(tabela, "policiais"); return this; }, select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: "policial-1", auth_version: 1 }, error: null }; } };
    assert.equal(await usuarioAutenticado({ headers: { cookie } }, revogada, { supabaseAdmin: () => fakeDb }), null);
    assert.equal(revogada.statusCode, 401);

    const aceita = resposta();
    const fakeDbValido = { from() { return this; }, select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: "policial-1", auth_version: 0, role: "p4" }, error: null }; } };
    const user = await usuarioAutenticado({ headers: { cookie } }, aceita, { supabaseAdmin: () => fakeDbValido });
    assert.equal(user.id, "policial-1");
    assert.equal(user.role, "p4");
  } finally {
    if (antiga === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = antiga;
  }
});

test("a listagem de policiais autoriza finalidade e perfil no servidor", () => {
  assert.equal(autorizarLeituraPoliciais({ id: "1", role: "master" }, "gestao"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "2", role: "oficial" }, "gestao"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "3", role: "policial" }, "gestao"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "3", role: "policial" }, "proprio"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "4", role: "p1" }, "nova-cautela"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "4", role: "p1" }, "livro"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "4", role: "p1" }, "banco-horas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "5", role: "oficial" }, "banco-horas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "6", role: "p4" }, "banco-horas"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "7", role: "policial" }, "banco-horas"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "8", role: "armeiro" }, "banco-horas"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "9", role: "master" }, "banco-horas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "5", role: "p4" }, "nova-cautela"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "6", role: "armeiro" }, "gestao"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "10", role: "policial" }, "permutas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "11", role: "p1" }, "permutas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "12", role: "p1_escalante_servico_ordinario" }, "permutas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "13", role: "oficial" }, "permutas"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "14", role: "p4" }, "permutas"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "15", role: "armeiro" }, "permutas"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "16", role: "p1" }, "permutas-calendario"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "17", role: "p1_escalante_servico_ordinario" }, "permutas-calendario"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "18", role: "oficial" }, "permutas-calendario"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "19", role: "policial" }, "permutas-calendario"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "20", role: "p4" }, "permutas-calendario"), false);
  assert.equal(autorizarLeituraPoliciais({ id: "21", role: "master" }, "permutas-calendario"), true);
});

test("Banco de Horas solicita efetivo pela finalidade que autoriza P1", async () => {
  const fetchOriginal = globalThis.fetch;
  let url;
  globalThis.fetch = async (destino) => {
    url = destino;
    return { ok: true, async json() { return { policiais: [{ id: "policial-1" }] }; } };
  };
  try {
    assert.deepEqual(await getPoliciaisBancoHoras(), [{ id: "policial-1" }]);
    assert.equal(new URL(url, "http://localhost").searchParams.get("uso"), "banco-horas");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("Permutas consulta somente os campos mínimos de policiais ativos pela finalidade própria", async () => {
  const fetchOriginal = globalThis.fetch;
  let url;
  globalThis.fetch = async (destino) => {
    url = destino;
    return { ok: true, async json() { return { policiais: [{ id: "policial-1" }] }; } };
  };
  try {
    assert.deepEqual(await getPoliciaisPermutas(), [{ id: "policial-1" }]);
    assert.equal(new URL(url, "http://localhost").searchParams.get("uso"), "permutas");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("calendário individual usa finalidade protegida e consulta apenas identidade mínima", async () => {
  const fetchOriginal = globalThis.fetch;
  let url;
  globalThis.fetch = async (destino) => {
    url = destino;
    return { ok: true, async json() { return { policiais: [{ id: "p1", nome_guerra: "ALFA" }] }; } };
  };
  try {
    assert.deepEqual(await getPoliciaisPermutasCalendario(), [{ id: "p1", nome_guerra: "ALFA" }]);
    const query = new URL(url, "http://localhost").searchParams;
    assert.equal(query.get("uso"), "permutas-calendario");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("finalidade permutas serve policiais ativos a perfis do módulo e nega perfis não autorizados", async () => {
  const anteriores = {
    fetch: globalThis.fetch,
    sessionSecret: process.env.SESSION_SECRET,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const requisicoes = [];
  globalThis.fetch = async (destino) => {
    const url = new URL(destino);
    requisicoes.push(url);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") {
      return Response.json({ id: "policial-1", auth_version: 0, role: "policial", credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/policiais") {
      return Response.json([
        { id: "policial-1", nome_guerra: "EU", posto_graduacao: "Soldado", numeral: "01", status: "EM ATIVIDADE" },
        { id: "oficial", nome_guerra: "MAJOR", posto_graduacao: "Major", status: "EM ATIVIDADE" },
        { id: "inativo", nome_guerra: "INATIVO", posto_graduacao: "Cabo", status: "INATIVO" },
        { id: "policial-2", nome_guerra: "ALFA", posto_graduacao: "Soldado", numeral: "12", status: "EM ATIVIDADE" },
        { id: "policial-3", nome_guerra: "BRAVO", posto_graduacao: "Cabo", numeral: "22", status: "EM ATIVIDADE" },
      ]);
    }
    return Response.json({ message: `Requisição inesperada: ${url.pathname}` }, { status: 404 });
  };
  try {
    const req = { method: "GET", query: { uso: "permutas" }, headers: { cookie: `log2cia_session=${criarSessao({ id: "policial-1", auth_version: 0 })}` } };
    const res = resposta();
    await policiaisHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.policiais, [
        { id: "policial-3", nome_guerra: "BRAVO", posto_graduacao: "Cabo", numeral: "22" },
        { id: "policial-2", nome_guerra: "ALFA", posto_graduacao: "Soldado", numeral: "12" },
    ]);
    const consultaAtivos = requisicoes.find((url) => url.searchParams.get("status") === "eq.EM ATIVIDADE");
    assert.ok(consultaAtivos);
    assert.equal(consultaAtivos.searchParams.get("select"), "id,nome_guerra,posto_graduacao,numeral,status");
    assert.equal(consultaAtivos.searchParams.get("id"), "neq.policial-1", "a consulta exclui o próprio usuário no backend");

    requisicoes.length = 0;
    const cookieP4 = `log2cia_session=${criarSessao({ id: "policial-1", auth_version: 0 })}`;
    globalThis.fetch = async (destino) => {
      const url = new URL(destino);
      requisicoes.push(url);
      return Response.json({ id: "policial-1", auth_version: 0, role: "p4", credencial_provisionada: true, primeiro_acesso: false });
    };
    const negado = resposta();
    await policiaisHandler({ ...req, headers: { cookie: cookieP4 } }, negado);
    assert.equal(negado.statusCode, 403);
    assert.equal(requisicoes.length, 1, "perfil sem finalidade não consulta a lista de policiais");
  } finally {
    globalThis.fetch = anteriores.fetch;
    for (const [nome, valor] of [["SESSION_SECRET", anteriores.sessionSecret], ["SUPABASE_URL", anteriores.supabaseUrl], ["SUPABASE_SERVICE_ROLE_KEY", anteriores.serviceRoleKey]]) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
});

test("calendário geral entrega identidade mínima apenas a perfis autorizados", async () => {
  const anteriores = {
    fetch: globalThis.fetch,
    sessionSecret: process.env.SESSION_SECRET,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const requisicoes = [];
  globalThis.fetch = async (destino) => {
    const url = new URL(destino);
    requisicoes.push(url);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") {
      return Response.json({ id: "p1-id", auth_version: 0, role: "p1", credencial_provisionada: true, primeiro_acesso: false });
    }
    if (url.pathname === "/rest/v1/policiais") {
      return Response.json([{ id: "policial-id", nome_guerra: "ALFA", posto_graduacao: "Cabo", numeral: "12" }]);
    }
    return Response.json({ message: `Requisição inesperada: ${url.pathname}` }, { status: 404 });
  };
  try {
    const req = { method: "GET", query: { uso: "permutas-calendario" }, headers: { cookie: `log2cia_session=${criarSessao({ id: "p1-id", auth_version: 0 })}` } };
    const res = resposta();
    await policiaisHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.policiais, [{ id: "policial-id", nome_guerra: "ALFA", posto_graduacao: "Cabo", numeral: "12" }]);
    const consulta = requisicoes.find((url) => url.searchParams.get("select") === "id,nome_guerra,posto_graduacao,numeral");
    assert.ok(consulta);
    assert.equal(consulta.searchParams.has("matricula"), false);

    requisicoes.length = 0;
    globalThis.fetch = async (destino) => {
      const url = new URL(destino);
      requisicoes.push(url);
      return Response.json({ id: "policial-id", auth_version: 0, role: "policial", credencial_provisionada: true, primeiro_acesso: false });
    };
    const negado = resposta();
    await policiaisHandler({ ...req, headers: { cookie: `log2cia_session=${criarSessao({ id: "policial-id", auth_version: 0 })}` } }, negado);
    assert.equal(negado.statusCode, 403);
    assert.equal(requisicoes.length, 1, "policial comum não consulta a lista geral");
  } finally {
    globalThis.fetch = anteriores.fetch;
    for (const [nome, valor] of [["SESSION_SECRET", anteriores.sessionSecret], ["SUPABASE_URL", anteriores.supabaseUrl], ["SUPABASE_SERVICE_ROLE_KEY", anteriores.serviceRoleKey]]) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
});

test("equipamentos aplica perfis por tipo e aceita apenas payload validado", () => {
  assert.equal(podeLerInventario({ role: "policial" }), false);
  assert.equal(podeLerInventario({ role: "oficial" }), true);
  assert.equal(podeGerenciarTipoEquipamento({ role: "armeiro" }, "armamento"), true);
  assert.equal(podeGerenciarTipoEquipamento({ role: "armeiro" }, "colete"), false);
  const dados = validarNovoEquipamento({ tipo: "armamento", modelo_descricao: "Pistola", num_serie: "ABC", status: "disponivel", detalhes: { calibre: ".40", senha: "ignorada" }, role: "master" });
  assert.deepEqual(dados.detalhes, { calibre: ".40" });
  assert.equal(validarNovoEquipamento({ tipo: "radio", modelo_descricao: "X", detalhes: {} }), null);
  assert.equal(validarNovoEquipamento({ tipo: "armamento", modelo_descricao: "X", status: "cautelado", detalhes: {} }), null);
});
