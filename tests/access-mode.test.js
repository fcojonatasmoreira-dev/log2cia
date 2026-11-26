import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  criarSessao,
  lerSessao,
  trocarModoSessao,
} from "../server/api/auth/_session.js";
import {
  modosDisponiveis,
  usuarioDaSessao,
} from "../server/api/auth/_accessMode.js";
import { usuarioAutenticado } from "../server/api/_server.js";
import changeModeHandler from "../server/api/auth/_change-mode.js";
import presenceHandler from "../server/api/presenca/index.js";
import { permissoesPermuta } from "../server/api/permutas/rules.js";
import { autorizarLeituraPoliciais } from "../server/api/policiais/index.js";
import { podeGerenciarTipoEquipamento, podeLerInventario } from "../server/api/equipamentos/index.js";
import drsoHandler from "../server/api/drso/index.js";
import dashboardHandler from "../server/api/dashboard.js";
import radiosHandler from "../server/api/radios/index.js";
import equipamentosHandler from "../server/api/equipamentos/index.js";
import viaturasHandler from "../server/api/viaturas/index.js";
import policiaisHandler from "../server/api/policiais/index.js";

const SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";
const ENV_ANTIGO = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const FETCH_ANTIGO = globalThis.fetch;

function resposta() {
  return {
    statusCode: 200,
    headers: {},
    status(codigo) { this.statusCode = codigo; return this; },
    setHeader(nome, valor) { this.headers[nome] = valor; return this; },
    json(body) { this.body = body; return this; },
  };
}

function cookie(token) {
  return `log2cia_session=${token}`;
}

function tokenForjado(payload) {
  const codificado = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const assinatura = createHmac("sha256", SESSION_SECRET).update(codificado).digest("base64url");
  return `${codificado}.${assinatura}`;
}

function fakeDb(usuario) {
  return {
    from(tabela) { assert.equal(tabela, "policiais"); return this; },
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: usuario, error: null }; },
  };
}

afterEach(() => {
  globalThis.fetch = FETCH_ANTIGO;
  for (const [nome, valor] of Object.entries(ENV_ANTIGO)) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

test("perfis alternáveis, Policial e Oficial recebem apenas os modos autorizados", () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  for (const role of ["master", "p1", "p1_escalante_servico_ordinario", "p4", "armeiro", "permanente", "permanente da guarda"]) {
    assert.deepEqual(modosDisponiveis({ role }), ["administrativo", "policial"], role);
  }
  assert.deepEqual(modosDisponiveis({ role: "policial" }), ["policial"]);
  assert.deepEqual(modosDisponiveis({ role: "policial", is_master: true }), ["administrativo", "policial"]);
  assert.deepEqual(modosDisponiveis({ role: "oficial" }), ["administrativo"]);
  assert.deepEqual(modosDisponiveis({ role: "drso_externo", tipo_acesso: "drso_externo" }), []);
});

test("sessões novas iniciam no modo correspondente ao perfil sem alterar a identidade", () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const master = lerSessao({ headers: { cookie: cookie(criarSessao({ id: "id-master", auth_version: 4, role: "master" })) } });
  const policial = lerSessao({ headers: { cookie: cookie(criarSessao({ id: "id-policial", auth_version: 2, role: "policial" })) } });
  assert.equal(master.modo, "administrativo");
  assert.equal(policial.modo, "policial");
  assert.equal(master.sub, "id-master");
  assert.equal(master.ver, 4);
});

test("sessões simultâneas do mesmo policial mantêm modos independentes sem duplicar identidade", () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const adminCookie = criarSessao({ id: "p1-id", role: "p1", auth_version: 2 });
  const sessaoAdmin = lerSessao({ headers: { cookie: cookie(adminCookie) } });
  const policialCookie = trocarModoSessao(sessaoAdmin, "policial");
  const sessaoPolicial = lerSessao({ headers: { cookie: cookie(policialCookie) } });
  assert.equal(sessaoAdmin.sub, sessaoPolicial.sub);
  assert.equal(sessaoAdmin.ver, sessaoPolicial.ver);
  assert.equal(sessaoAdmin.modo, "administrativo");
  assert.equal(sessaoPolicial.modo, "policial");
});

test("modo Policial transforma perfil admin em permissões de policial e remove flags privilegiadas", () => {
  const sessao = { modo: "policial" };
  const efetivo = usuarioDaSessao({
    id: "master-id", role: "master", is_master: true,
    drso_escalante: true, permissoes: { gerenciar_drso: true },
  }, sessao);
  assert.equal(efetivo.role, "policial");
  assert.equal(efetivo.is_master, false);
  assert.equal(efetivo.drso_escalante, false);
  assert.equal(efetivo.permissoes, undefined);
  assert.equal(efetivo.id, "master-id");
  assert.equal(efetivo.modo_acesso, "policial");
  assert.deepEqual(permissoesPermuta(efetivo), {
    criar: true, confirmar: true, consultar_proprias: true,
    consultar_geral: false, decidir: false, cancelar_deferida: false,
  });
  assert.equal(autorizarLeituraPoliciais(efetivo, "gestao"), false);
  assert.equal(podeLerInventario(efetivo), false);
  assert.equal(podeGerenciarTipoEquipamento(efetivo, "armamento"), false);
});

test("modo incompatível com o perfil atualizado é negado pelo middleware", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const tokenBase = criarSessao({ id: "oficial-id", role: "oficial", auth_version: 1 });
  const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
  const res = resposta();
  const user = await usuarioAutenticado({ headers: { cookie: cookie(token) } }, res, {
    supabaseAdmin: () => fakeDb({ id: "oficial-id", role: "oficial", auth_version: 1 }),
  });
  assert.equal(user, null);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /perfil foi alterado.*Entre novamente/i);
});

test("sessões antigas sem claim mantêm acesso administrativo ou policial conforme o perfil atual", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const antiga = criarSessao({ id: "p4-id", auth_version: 1 });
  const adminRes = resposta();
  const admin = await usuarioAutenticado({ headers: { cookie: cookie(antiga) } }, adminRes, {
    supabaseAdmin: () => fakeDb({ id: "p4-id", role: "p4", auth_version: 1 }),
  });
  assert.equal(admin.role, "p4");
  assert.equal(admin.modo_acesso, "administrativo");

  const policialRes = resposta();
  const policial = await usuarioAutenticado({ headers: { cookie: cookie(antiga) } }, policialRes, {
    supabaseAdmin: () => fakeDb({ id: "p4-id", role: "policial", auth_version: 1 }),
  });
  assert.equal(policial.role, "policial");
  assert.equal(policial.modo_acesso, "policial");
});

test("mudança de perfil é reavaliada no banco e o papel administrativo novo substitui o anterior", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const token = criarSessao({ id: "p4-id", role: "p4", auth_version: 1 });
  const res = resposta();
  const user = await usuarioAutenticado({ headers: { cookie: cookie(token) } }, res, {
    supabaseAdmin: () => fakeDb({ id: "p4-id", role: "p1", auth_version: 1 }),
  });
  assert.equal(user.role, "p1");
  assert.equal(user.modo_acesso, "administrativo");
});

test("assinatura adulterada e valor de modo inválido são recusados", () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const token = criarSessao({ id: "p1-id", role: "p1", auth_version: 1 });
  const [payload, assinatura] = token.split(".");
  assert.equal(lerSessao({ headers: { cookie: cookie(`${payload}.x${assinatura.slice(1)}`) } }), null);
  const agora = Math.floor(Date.now() / 1000);
  const invalido = tokenForjado({ sub: "p1-id", ver: 1, iat: agora, exp: agora + 3600, modo: "root" });
  assert.equal(lerSessao({ headers: { cookie: cookie(invalido) } }), null);
});

test("alternar modo preserva iat, exp e auth_version e só emite modo autorizado", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  globalThis.fetch = async () => Response.json({
    id: "p1-id", role: "p1", auth_version: 8,
    credencial_provisionada: true, primeiro_acesso: false,
  });
  const original = criarSessao({ id: "p1-id", role: "p1", auth_version: 8 });
  const sessaoOriginal = lerSessao({ headers: { cookie: cookie(original) } });
  const res = resposta();
  await changeModeHandler({
    method: "POST", headers: { cookie: cookie(original) },
    body: { modo: "policial", role: "master", is_master: true },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.modo_acesso, "policial");
  const novoCookie = res.headers["Set-Cookie"].split(";")[0].split("=")[1];
  const sessaoNova = lerSessao({ headers: { cookie: cookie(novoCookie) } });
  assert.equal(sessaoNova.modo, "policial");
  assert.equal(sessaoNova.sub, sessaoOriginal.sub);
  assert.equal(sessaoNova.ver, sessaoOriginal.ver);
  assert.equal(sessaoNova.iat, sessaoOriginal.iat);
  assert.equal(sessaoNova.exp, sessaoOriginal.exp);

  const resVolta = resposta();
  await changeModeHandler({
    method: "POST", headers: { cookie: cookie(novoCookie) },
    body: { modo: "administrativo" },
  }, resVolta);
  assert.equal(resVolta.statusCode, 200);
  const cookieAdministrativo = resVolta.headers["Set-Cookie"].split(";")[0].split("=")[1];
  const sessaoAdministrativa = lerSessao({ headers: { cookie: cookie(cookieAdministrativo) } });
  assert.equal(sessaoAdministrativa.modo, "administrativo");
  assert.equal(sessaoAdministrativa.iat, sessaoOriginal.iat);
  assert.equal(sessaoAdministrativa.exp, sessaoOriginal.exp);
});

test("Policial não pode pedir modo Administrativo e Oficial não pode pedir modo Policial", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  for (const [role, modo] of [["policial", "administrativo"], ["oficial", "policial"]]) {
    globalThis.fetch = async () => Response.json({
      id: "usuario-id", role, auth_version: 0,
      credencial_provisionada: true, primeiro_acesso: false,
    });
    const token = criarSessao({ id: "usuario-id", role, auth_version: 0 });
    const res = resposta();
    await changeModeHandler({ method: "POST", headers: { cookie: cookie(token) }, body: { modo } }, res);
    assert.equal(res.statusCode, 403, `${role} -> ${modo}`);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("origem externa não consegue alternar o cookie privilegiado", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  const res = resposta();
  await changeModeHandler({
    method: "POST", headers: { origin: "https://attacker.invalid", host: "log2cia.example" },
    body: { modo: "administrativo" },
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("chamada direta à API de presença não conserva permissão Master no modo Policial", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url.pathname);
    return Response.json({
      id: "master-id", role: "master", is_master: true, auth_version: 3,
      credencial_provisionada: true, primeiro_acesso: false,
    });
  };
  const tokenBase = criarSessao({ id: "master-id", role: "master", is_master: true, auth_version: 3 });
  const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
  const res = resposta();
  await presenceHandler({ method: "GET", headers: { cookie: cookie(token) }, query: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(calledPresence(chamadas), false);
});

test("API DRSO aplica modo efetivo a ações administrativas fora do middleware comum", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url.pathname);
    return Response.json({
      id: "master-id", role: "master", auth_version: 3,
      credencial_provisionada: true, primeiro_acesso: false,
    });
  };
  const tokenBase = criarSessao({ id: "master-id", role: "master", auth_version: 3 });
  const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
  const res = resposta();
  await drsoHandler({
    method: "POST", headers: { cookie: cookie(token) },
    body: { acao: "criar_policial_externo" }, query: {},
  }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(chamadas.length, 1, "a API nega após carregar a identidade e não consulta tabelas de administração");
});

test("modo Policial mantém Dashboard pessoal e bloqueia inventário e frota administrativa", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const perfis = ["master", "p1", "p1_escalante_servico_ordinario", "p4", "armeiro", "permanente", "permanente da guarda", "policial"];
  for (const [indice, role] of perfis.entries()) {
    const chamadas = [];
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      chamadas.push(url.pathname);
      if (url.pathname === "/rest/v1/policiais") return Response.json({
        id: `usuario-${indice}`, role, is_master: role === "master", auth_version: 3,
        credencial_provisionada: true, primeiro_acesso: false,
      });
      return Response.json([]);
    };
    const tokenBase = criarSessao({ id: `usuario-${indice}`, role, is_master: role === "master", auth_version: 3 });
    const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
    const req = { method: "GET", headers: { cookie: cookie(token) }, query: {} };
    const painel = resposta();
    await dashboardHandler(req, painel);
    assert.equal(painel.statusCode, 200, `${role} pode consultar seu Dashboard pessoal`);
    assert.equal(painel.body.metrics.modo, "policial");
    assert.equal("efetivoAtivoCadastrado" in painel.body.metrics, false);
    assert.equal("situacaoViaturas" in painel.body.metrics, false);
    for (const handler of [equipamentosHandler, radiosHandler, viaturasHandler]) {
      const res = resposta();
      await handler(req, res);
      assert.equal(res.statusCode, 403, `${role} não pode consultar ${handler.name || "recurso"} no modo Policial`);
    }
    assert.equal(chamadas.filter((path) => path === "/rest/v1/policiais").length, 4);
    assert.equal(chamadas.some((path) => ["/rest/v1/cautelas", "/rest/v1/equipamentos", "/rest/v1/radios", "/rest/v1/viaturas"].includes(path)), false);
  }
});

test("modo Policial também bloqueia URLs de imagem do inventário e de rádios", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url.pathname);
    return Response.json({ id: "p4-id", role: "p4", auth_version: 3,
      credencial_provisionada: true, primeiro_acesso: false });
  };
  const tokenBase = criarSessao({ id: "p4-id", role: "p4", auth_version: 3 });
  const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
  for (const [handler, query] of [
    [equipamentosHandler, { acao: "imagem" }],
    [radiosHandler, { acao: "imagem" }],
  ]) {
    const res = resposta();
    await handler({ method: "POST", headers: { cookie: cookie(token) }, query,
      body: { prefixo: "arma", conteudo: "data:image/png;base64,AAAA" } }, res);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(chamadas.some((path) => path.startsWith("/storage/v1/object/")), false);
});

test("modo Policial mantém a consulta operacional mínima de check-ins de viaturas", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url.pathname);
    if (url.pathname === "/rest/v1/policiais") return Response.json({
      id: "p4-id", role: "p4", auth_version: 3,
      credencial_provisionada: true, primeiro_acesso: false,
    });
    return Response.json([]);
  };
  const tokenBase = criarSessao({ id: "p4-id", role: "p4", auth_version: 3 });
  const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
  const res = resposta();
  await viaturasHandler({ method: "GET", headers: { cookie: cookie(token) },
    query: { recurso: "checkins" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.viaturas, []);
  assert.ok(chamadas.includes("/rest/v1/viatura_checkins"));
});

test("DRSO não aceita voluntariado pessoal de perfil administrativo no modo Administrativo", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url.pathname);
    return Response.json({ id: "master-id", role: "master", auth_version: 3,
      credencial_provisionada: true, primeiro_acesso: false });
  };
  const token = criarSessao({ id: "master-id", role: "master", auth_version: 3 });
  const res = resposta();
  await drsoHandler({ method: "POST", headers: { cookie: cookie(token) }, query: {}, body: {
    acao: "voluntariar", escala_id: "escala-id",
  } }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(chamadas, ["/rest/v1/policiais"]);
});

test("seleção de substituto de Permutas não fica disponível no modo Administrativo", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const chamadas = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    chamadas.push(url.pathname);
    return Response.json({ id: "master-id", role: "master", auth_version: 3,
      credencial_provisionada: true, primeiro_acesso: false });
  };
  const token = criarSessao({ id: "master-id", role: "master", auth_version: 3 });
  const res = resposta();
  await policiaisHandler({ method: "GET", headers: { cookie: cookie(token) }, query: { uso: "permutas" } }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(chamadas, ["/rest/v1/policiais"]);
});

test("DRSO no modo Policial limita escalas fechadas e dados de participantes ao próprio usuário", async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  const usuarioId = "master-id";
  const outraPessoa = "outro-policial";
  const escalas = [
    { id: "escala-aberta", status: "aberta", data_servico: "2026-12-01" },
    { id: "escala-fechada-propria", status: "fechada", data_servico: "2026-12-02" },
    { id: "escala-fechada-alheia", status: "fechada", data_servico: "2026-12-03" },
  ];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") {
      if (url.searchParams.has("id")) return Response.json({ id: usuarioId, role: "master", auth_version: 3,
        credencial_provisionada: true, primeiro_acesso: false });
      return Response.json([
        { id: usuarioId, nome_guerra: "MASTER", posto_graduacao: "Capitão" },
        { id: outraPessoa, nome_guerra: "OUTRO", posto_graduacao: "Soldado" },
      ]);
    }
    if (url.pathname === "/rest/v1/drso_escalas") return Response.json(escalas);
    if (url.pathname === "/rest/v1/viaturas" || url.pathname === "/rest/v1/drso_policiais_externos"
      || url.pathname === "/rest/v1/drso_escalas_areas") return Response.json([]);
    if (url.pathname === "/rest/v1/drso_voluntarios") {
      if (url.searchParams.get("select") === "escala_id") return Response.json([{ escala_id: "escala-fechada-propria" }]);
      return Response.json([
        { id: "vinculo-proprio", escala_id: "escala-aberta", policial_id: usuarioId, status: "voluntario" },
        { id: "vinculo-alheio", escala_id: "escala-aberta", policial_id: outraPessoa, status: "voluntario" },
        { id: "vinculo-fechado", escala_id: "escala-fechada-propria", policial_id: usuarioId, status: "selecionado" },
      ]);
    }
    return Response.json({ message: `Chamada inesperada ${url.pathname}` }, { status: 404 });
  };
  const tokenBase = criarSessao({ id: usuarioId, role: "master", auth_version: 3 });
  const token = trocarModoSessao(lerSessao({ headers: { cookie: cookie(tokenBase) } }), "policial");
  const res = resposta();
  await drsoHandler({ method: "GET", headers: { cookie: cookie(token) }, query: { mes: "2026-12" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.escalas.map((item) => item.id), ["escala-aberta", "escala-fechada-propria"]);
  assert.deepEqual(res.body.voluntarios.map((item) => item.policial_id), [usuarioId, usuarioId]);
  assert.deepEqual(res.body.policiais.map((item) => item.id), [usuarioId]);
  assert.deepEqual(res.body.viaturas, []);
  assert.equal(res.body.permissoes.consultar_var, false);
});

function calledPresence(chamadas) {
  return chamadas.some((pathname) => pathname.includes("presenca_sessoes"));
}
