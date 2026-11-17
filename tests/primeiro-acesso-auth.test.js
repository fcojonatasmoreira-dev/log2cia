import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarSessao } from "../server/api/auth/_session.js";
import { hashSenha, verificarSenha } from "../server/api/auth/_password.js";
import { usuarioAutenticado } from "../server/api/_server.js";
import criarPolicialHandler from "../server/api/policiais/index.js";
import resetPolicialHandler from "../server/api/policiais/[id]/[action].js";
import loginHandler from "../server/api/auth/_login.js";
import meHandler from "../server/api/auth/_me.js";
import changePasswordHandler from "../server/api/auth/_change-password.js";
import logoutHandler from "../server/api/auth/_logout.js";
import drsoHandler from "../server/api/drso/index.js";

const ENV_ORIGINAL = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const FETCH_ORIGINAL = globalThis.fetch;
const SESSION_SECRET = "segredo-de-teste-com-comprimento-superior-a-32-caracteres";

function resposta() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(nome, valor) { this.headers[nome] = valor; return this; },
    json(value) { this.body = value; return this; },
  };
}

function cookie(id = "master-1", authVersion = 0) {
  return `log2cia_session=${criarSessao({ id, auth_version: authVersion })}`;
}

function req({ method = "POST", id, authVersion = 0, body = {}, query = {} } = {}) {
  return { method, headers: { cookie: cookie(id, authVersion) }, body, query };
}

function respostaPg(data, status = 200) {
  return Response.json(data, { status });
}

beforeEach(() => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
});

afterEach(() => {
  globalThis.fetch = FETCH_ORIGINAL;
  for (const [nome, valor] of Object.entries(ENV_ORIGINAL)) {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
  }
});

test("Master cadastra policial com senha temporária hashada e primeiro acesso obrigatório", async () => {
  let cadastro;
  let rpc;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais" && method === "GET") return respostaPg([{ id: "master-1", auth_version: 0, role: "master", status: "INATIVO" }]);
    if (url.pathname === "/rest/v1/policiais" && method === "POST") {
      cadastro = JSON.parse(init.body)[0];
      return respostaPg({ ...cadastro, id: "policial-novo" });
    }
    if (url.pathname === "/rest/v1/rpc/master_set_credential") {
      rpc = JSON.parse(init.body);
      return respostaPg([{ id: "policial-novo", auth_version: 1 }]);
    }
    return respostaPg({ message: "rota inesperada" }, 404);
  };

  const res = resposta();
  await criarPolicialHandler(req({ body: {
    nome_completo: "Policial Novo",
    nome_guerra: "Novo",
    matricula: "12345",
    role: "policial",
    primeiro_acesso: false,
  } }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(cadastro.primeiro_acesso, true);
  assert.equal(cadastro.auth_version, 0);
  assert.equal(cadastro.senha, null);
  assert.equal(cadastro.credencial_provisionada, false);
  assert.match(rpc.p_senha_hash, /^scrypt\$/);
  assert.equal(rpc.p_ator_id, "master-1");
  assert.equal(await verificarSenha(res.body.senhaTemporaria, rpc.p_senha_hash), true);
  assert.equal(res.body.policial.senha, undefined);
  assert.equal(typeof res.body.senhaTemporaria, "string");
});

test("cadastro administrativo continua negado para policial comum", async () => {
  let inserido = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais" && (init.method || "GET") === "GET") {
      return respostaPg([{ id: "master-1", auth_version: 0, role: "policial" }]);
    }
    inserido = true;
    return respostaPg([]);
  };

  const res = resposta();
  await criarPolicialHandler(req({ body: { nome_completo: "A", nome_guerra: "B", matricula: "3" } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(inserido, false);
  assert.equal(res.body.senhaTemporaria, undefined);
});

test("reset administrativo grava hash, força troca e incrementa auth_version", async () => {
  let rpc;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("id") === "eq.master-1") {
      return respostaPg([{ id: "master-1", auth_version: 0, role: "master" }]);
    }
    if (url.pathname === "/rest/v1/rpc/master_set_credential") {
      rpc = JSON.parse(init.body);
      return respostaPg([{ id: "policial-alvo", auth_version: 5 }]);
    }
    return respostaPg({ message: "rota inesperada" }, 404);
  };

  const res = resposta();
  await resetPolicialHandler(req({ id: "master-1", query: { id: "policial-alvo", action: "reset-senha" } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(rpc.p_evento, "reset_admin");
  assert.equal(rpc.p_ator_id, "master-1");
  assert.match(rpc.p_senha_hash, /^scrypt\$/);
  assert.equal(await verificarSenha(res.body.senhaTemporaria, rpc.p_senha_hash), true);
});

test("P4 não pode resetar senha de conta Master", async () => {
  let atualizou = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname !== "/rest/v1/policiais") return respostaPg([]);
    if ((init.method || "GET") === "PATCH") atualizou = true;
    const id = url.searchParams.get("id");
    if (id === "eq.master-1") return respostaPg([{ id: "master-1", auth_version: 0, role: "p4" }]);
    return respostaPg([{ id: "alvo-master", role: "master", auth_version: 2 }]);
  };

  const res = resposta();
  await resetPolicialHandler(req({ id: "master-1", query: { id: "alvo-master", action: "reset-senha" } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(atualizou, false);
});

test("primeiro acesso é negado nas APIs protegidas, mas status permanece informativo", async () => {
  const firstAccess = resposta();
  const blockedDb = {
    from() { return this; }, select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { id: "policial-1", auth_version: 0, primeiro_acesso: true }, error: null }; },
  };
  const pending = await usuarioAutenticado({ headers: { cookie: cookie("policial-1") } }, firstAccess, { supabaseAdmin: () => blockedDb });
  assert.equal(pending, null);
  assert.equal(firstAccess.statusCode, 403);
  assert.equal(firstAccess.body.code, "PASSWORD_CHANGE_REQUIRED");

  const inactiveButChanged = resposta();
  const normalDb = {
    from() { return this; }, select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { id: "policial-1", auth_version: 0, primeiro_acesso: false, status: "INATIVO", role: "policial" }, error: null }; },
  };
  const user = await usuarioAutenticado({ headers: { cookie: cookie("policial-1") } }, inactiveButChanged, { supabaseAdmin: () => normalDb });
  assert.equal(user.id, "policial-1");
  assert.equal(user.status, "INATIVO");

  const semCredencial = resposta();
  const semCredencialDb = {
    from() { return this; }, select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { id: "policial-1", auth_version: 0, primeiro_acesso: false, credencial_provisionada: false }, error: null }; },
  };
  assert.equal(await usuarioAutenticado({ headers: { cookie: cookie("policial-1") } }, semCredencial, { supabaseAdmin: () => semCredencialDb }), null);
  assert.equal(semCredencial.statusCode, 403);
});

test("/me não restaura sessão para conta não provisionada", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return respostaPg([{
      id: "policial-pendente", auth_version: 0, primeiro_acesso: false,
      credencial_provisionada: false, status: "INATIVO",
    }]);
    return respostaPg([]);
  };
  const res = resposta();
  await meHandler({ method: "GET", headers: { cookie: cookie("policial-pendente") } }, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /provisionada pelo Master/i);
});

test("migração de senha legada usa compare-and-set e não sobrescreve reset concorrente", async () => {
  let filtroAtualizacao;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname !== "/rest/v1/policiais") return respostaPg([]);
    if (method === "GET") return respostaPg([{ id: "policial-1", matricula: "123", senha: "senha-legada", auth_version: 7, primeiro_acesso: false, status: "INATIVO" }]);
    filtroAtualizacao = url.searchParams;
    return respostaPg([]);
  };

  const res = resposta();
  await loginHandler({ method: "POST", headers: {}, body: { matricula: "123", senha: "senha-legada" } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.headers["Set-Cookie"], undefined);
  assert.equal(filtroAtualizacao.get("senha"), "eq.senha-legada");
  assert.equal(filtroAtualizacao.get("auth_version"), "eq.7");
});

test("login legado válido migra para hash e mantém matrícula e senha", async () => {
  let hashGravado;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname !== "/rest/v1/policiais") return respostaPg([]);
    if (method === "GET") return respostaPg([{ id: "policial-1", matricula: "123", senha: "senha-legada", auth_version: 7, primeiro_acesso: false, role: "policial", status: "INATIVO" }]);
    hashGravado = JSON.parse(init.body).senha;
    return respostaPg([{ auth_version: 7, primeiro_acesso: false }]);
  };

  const res = resposta();
  await loginHandler({ method: "POST", headers: {}, body: { matricula: "123", senha: "senha-legada" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(hashGravado, /^scrypt\$/);
  assert.equal(await verificarSenha("senha-legada", hashGravado), true);
  assert.equal(res.body.user.senha, undefined);
  assert.ok(res.headers["Set-Cookie"]);
});

test("troca de senha grava hash, revoga a sessão usada e o logout continua permitido", async () => {
  let version = 3;
  let senhaHash;
  let marcadorFiltrado;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname !== "/rest/v1/policiais") return respostaPg([]);
    if (method === "PATCH") {
      const dados = JSON.parse(init.body);
      senhaHash = dados.senha;
      marcadorFiltrado = url.searchParams.get("credencial_provisionada");
      version = dados.auth_version;
      return respostaPg([{ id: "policial-1" }]);
    }
    if (url.searchParams.has("select") && url.searchParams.get("select") === "id,auth_version") {
      return respostaPg([{ id: "policial-1", auth_version: version }]);
    }
    return respostaPg([{ id: "policial-1", auth_version: version, primeiro_acesso: false, role: "policial" }]);
  };

  const resTroca = resposta();
  await changePasswordHandler({ method: "POST", headers: { cookie: cookie("policial-1", 3) }, body: { novaSenha: "Senha!Nova9 " } }, resTroca);
  assert.equal(resTroca.statusCode, 200);
  assert.equal(version, 4);
  assert.equal(marcadorFiltrado, "eq.true");
  assert.equal(await verificarSenha("Senha!Nova9 ", senhaHash), true);

  const resSessaoAntiga = resposta();
  const db = {
    from() { return this; }, select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { id: "policial-1", auth_version: version, primeiro_acesso: false }, error: null }; },
  };
  assert.equal(await usuarioAutenticado({ headers: { cookie: cookie("policial-1", 3) } }, resSessaoAntiga, { supabaseAdmin: () => db }), null);
  assert.equal(resSessaoAntiga.statusCode, 401);

  const resNovaSessao = resposta();
  assert.equal((await usuarioAutenticado({ headers: { cookie: cookie("policial-1", 4) } }, resNovaSessao, { supabaseAdmin: () => db })).id, "policial-1");

  const logout = resposta();
  await logoutHandler({ method: "POST", headers: { cookie: cookie("policial-1", 4) } }, logout);
  assert.equal(logout.statusCode, 200);
  assert.match(logout.headers["Set-Cookie"], /Max-Age=0/);
});

test("conta sem credencial provisionada não pode alterar o próprio marcador pela troca de senha", async () => {
  const filtros = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if ((init.method || "GET").toUpperCase() === "PATCH") {
      filtros.push(url.searchParams.get("credencial_provisionada"));
    }
    return respostaPg([]);
  };
  const res = resposta();
  await changePasswordHandler({
    method: "POST",
    headers: { cookie: cookie("pendente", 0) },
    body: { novaSenha: "Senha!Nova9" },
  }, res);
  assert.equal(res.statusCode, 401);
  assert.ok(filtros.length > 0);
  assert.ok(filtros.every((filtro) => filtro === "eq.true"));
});

test("conta DRSO em primeiro acesso também fica limitada ao fluxo de troca", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return respostaPg([]);
    if (url.pathname === "/rest/v1/drso_policiais_externos") {
      return respostaPg([{ id: "externo-1", auth_version: 0, ativo: true, primeiro_acesso: true }]);
    }
    return respostaPg([]);
  };

  const res = resposta();
  await drsoHandler({ method: "GET", headers: { cookie: cookie("externo-1") }, query: {} }, res);
  assert.equal(res.statusCode, 403);

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return respostaPg([]);
    if (url.pathname === "/rest/v1/drso_policiais_externos") {
      return respostaPg([{ id: "externo-1", auth_version: 0, ativo: true, primeiro_acesso: false, credencial_provisionada: false }]);
    }
    return respostaPg([]);
  };
  const semCredencial = resposta();
  await drsoHandler({ method: "GET", headers: { cookie: cookie("externo-1") }, query: {} }, semCredencial);
  assert.equal(semCredencial.statusCode, 403);
  assert.match(semCredencial.body.error, /provisionada pelo Master/i);
});
