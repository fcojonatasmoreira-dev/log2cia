import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarSessao } from "../server/api/auth/_session.js";
import criarPolicialHandler from "../server/api/policiais/index.js";
import credenciaisHandler from "../server/api/credenciais.js";
import loginHandler from "../server/api/auth/_login.js";
import drsoHandler from "../server/api/drso/index.js";
import policialDetalheHandler from "../server/api/policiais/[id].js";
import { hashSenha } from "../server/api/auth/_password.js";

const ENV = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const originalFetch = globalThis.fetch;
const secret = "teste-de-segredo-de-sessao-com-mais-de-32-caracteres";

function resposta() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

function requisicao({ id = "master-1", role = "master", method = "GET", body = {}, query = {} } = {}) {
  const token = criarSessao({ id, auth_version: 0 });
  return { method, headers: { cookie: `log2cia_session=${token}` }, body, query };
}

function pg(data, status = 200) {
  return Response.json(data, { status });
}

beforeEach(() => {
  process.env.SESSION_SECRET = secret;
  process.env.SUPABASE_URL = "https://supabase.mock.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-only";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("P4 cadastra policial sem gerar ou receber credencial", async () => {
  let inserido;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname !== "/rest/v1/policiais") return pg([], 404);
    if ((init.method || "GET") === "GET") return pg([{ id: "p4-1", auth_version: 0, role: "p4" }]);
    inserido = JSON.parse(init.body)[0];
    return pg({ ...inserido, id: "policial-novo", senha: undefined }, 201);
  };

  const res = resposta();
  await criarPolicialHandler(requisicao({ id: "p4-1", role: "p4", method: "POST", body: {
    nome_completo: "Novo Policial", nome_guerra: "Novo", matricula: "12345", role: "master",
  } }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(inserido.role, "policial");
  assert.equal(inserido.senha, null);
  assert.equal(inserido.credencial_provisionada, false);
  assert.equal(res.body.senhaTemporaria, undefined);
  assert.equal(res.body.credencialPendente, true);
});

test("P4 não pode consultar o painel administrativo de credenciais", async () => {
  let chamadasDepoisDaSessao = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([{ id: "p4-1", auth_version: 0, role: "p4" }]);
    chamadasDepoisDaSessao += 1;
    return pg([]);
  };

  const res = resposta();
  await credenciaisHandler(requisicao({ id: "p4-1", method: "GET" }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(chamadasDepoisDaSessao, 0);
});

test("provisionamento inicial Master registra ator na RPC e não persiste a senha temporária", async () => {
  let inserido;
  let rpc;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais" && method === "GET") return pg([{ id: "master-1", auth_version: 0, role: "master" }]);
    if (url.pathname === "/rest/v1/policiais" && method === "POST") {
      inserido = JSON.parse(init.body)[0];
      return pg({ ...inserido, id: "novo-1" }, 201);
    }
    if (url.pathname === "/rest/v1/rpc/master_set_credential") {
      rpc = JSON.parse(init.body);
      return pg([{ id: "novo-1", auth_version: 1 }]);
    }
    return pg([], 404);
  };
  const res = resposta();
  await criarPolicialHandler(requisicao({ method: "POST", body: {
    nome_completo: "Novo Policial", nome_guerra: "Novo", matricula: "7788", role: "policial",
  } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(inserido.senha, null);
  assert.equal(inserido.credencial_provisionada, false);
  assert.equal(rpc.p_ator_id, "master-1");
  assert.equal(rpc.p_evento, "senha_inicial");
  assert.match(rpc.p_senha_hash, /^scrypt\$/);
  assert.equal(JSON.stringify(inserido).includes(res.body.senhaTemporaria), false);
});

test("falha da RPC Master deixa a conta sem credencial e não devolve senha temporária", async () => {
  let inserido;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais" && method === "GET") return pg([{ id: "master-1", auth_version: 0, role: "master" }]);
    if (url.pathname === "/rest/v1/policiais" && method === "POST") {
      inserido = JSON.parse(init.body)[0];
      return pg({ ...inserido, id: "novo-pendente" }, 201);
    }
    if (url.pathname === "/rest/v1/rpc/master_set_credential") return pg({ code: "PGRST202", message: "migration pendente" }, 404);
    return pg([], 404);
  };
  const res = resposta();
  await criarPolicialHandler(requisicao({ method: "POST", body: {
    nome_completo: "Novo Policial", nome_guerra: "Novo", matricula: "7789", role: "policial",
  } }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(inserido.senha, null);
  assert.equal(inserido.credencial_provisionada, false);
  assert.equal(res.body.senhaTemporaria, undefined);
});

test("contas antigas sem senha rejeitam numeral e matrícula mesmo no primeiro acesso", async () => {
  const casos = [
    { senha: null, numeral: "12345", matricula: "12345", tentativa: "12345" },
    { senha: "", numeral: "—", matricula: "98761234", tentativa: "1234" },
    { senha: "   ", numeral: "42", matricula: "98761234", tentativa: "42" },
  ];

  for (const [indice, caso] of casos.entries()) {
    let tentouAtualizar = false;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/policiais" && (init.method || "GET") === "GET") return pg([{
        id: `legado-${indice}`, matricula: caso.matricula, numeral: caso.numeral,
        senha: caso.senha, primeiro_acesso: true, credencial_provisionada: true,
        auth_version: 0, role: "policial",
      }]);
      tentouAtualizar = true;
      return pg([]);
    };

    const res = resposta();
    await loginHandler({ method: "POST", headers: {}, body: { matricula: caso.matricula, senha: caso.tentativa } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["Set-Cookie"], undefined);
    assert.equal(tentouAtualizar, false);
  }
});

test("senha armazenada impede fallback padrão mesmo com primeiro acesso pendente", async () => {
  const hash = await hashSenha("Senha-temporaria-privada9!");
  let tentouAtualizar = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais" && (init.method || "GET") === "GET") return pg([{
      id: "provisionado", matricula: "12345", numeral: "12345", senha: hash,
      primeiro_acesso: true, credencial_provisionada: true, auth_version: 4, role: "policial",
    }]);
    tentouAtualizar = true;
    return pg([]);
  };
  const res = resposta();
  await loginHandler({ method: "POST", headers: {}, body: { matricula: "12345", senha: "12345" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(tentouAtualizar, false);
});

test("contas DRSO antigas com senha nula ou vazia não autenticam", async () => {
  for (const [indice, senhaArmazenada] of [null, "", "   "].entries()) {
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/policiais") return pg([]);
      if (url.pathname === "/rest/v1/drso_policiais_externos") return pg([{
        id: `drso-sem-senha-${indice}`, matricula: "98765", numeral: "42", ativo: true,
        senha: senhaArmazenada, primeiro_acesso: true, credencial_provisionada: true,
        auth_version: 0,
      }]);
      return pg([], 404);
    };
    const res = resposta();
    await loginHandler({ method: "POST", headers: {}, body: { matricula: "98765", senha: "42" } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("cadastro de conta DRSO não aceita senha do gestor e aguarda provisionamento Master", async () => {
  let inserido;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais" && method === "GET") {
      if (url.searchParams.has("matricula")) return pg([]);
      return pg([{ id: "master-1", auth_version: 0, role: "master", primeiro_acesso: false }]);
    }
    if (url.pathname === "/rest/v1/drso_policiais_externos" && method === "POST") {
      inserido = JSON.parse(init.body);
      return pg({ ...inserido, id: "externo-novo" }, 201);
    }
    return pg([], 404);
  };

  const res = resposta();
  await drsoHandler(requisicao({ method: "POST", body: {
    acao: "criar_policial_externo", nome_completo: "Externo", nome_guerra: "Externo",
    matricula: "98765", posto_graduacao: "Soldado", unidade_origem: "Unidade A",
    senha: "senha-fornecida-pelo-gestor",
  } }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(inserido.senha, null);
  assert.equal(inserido.credencial_provisionada, false);
  assert.equal(res.body.credencialPendente, true);
  assert.equal(res.body.senha_inicial, undefined);
});

test("painel Master retorna apenas metadados de credenciais e eventos", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("id") === "eq.master-1") {
      return pg([{ id: "master-1", auth_version: 0, role: "master" }]);
    }
    if (url.pathname === "/rest/v1/policiais") return pg([{
      id: "u-1", nome_guerra: "Silva", nome_completo: "João Silva", matricula: "123",
      role: "policial", status: "INATIVO", senha: "scrypt$hash-secreto", primeiro_acesso: true,
      credencial_provisionada: true, auth_version: 2,
    }]);
    if (url.pathname === "/rest/v1/drso_policiais_externos") return pg([]);
    if (url.pathname === "/rest/v1/rpc/credential_audit_latest") return pg([
      { usuario_id: "u-1", ultimo_login: "2026-11-10T10:00:00Z", ultima_alteracao_senha: "2026-11-09T10:00:00Z" },
    ]);
    return pg([], 404);
  };

  const res = resposta();
  await credenciaisHandler(requisicao({ method: "GET" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.resumo.total, 1);
  assert.equal(res.body.resumo.primeiroAcessoPendente, 1);
  assert.equal(res.body.usuarios[0].temSenha, true);
  assert.equal(res.body.usuarios[0].ultimoLogin, "2026-11-10T10:00:00Z");
  assert.equal(res.body.usuarios[0].ultimaAlteracaoSenha, "2026-11-09T10:00:00Z");
  assert.equal(JSON.stringify(res.body).includes("hash-secreto"), false);
});

test("Master redefine credencial DRSO com hash e versão de sessão incrementada", async () => {
  let rpc;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais") return pg([{ id: "master-1", auth_version: 0, role: "master" }]);
    if (url.pathname === "/rest/v1/rpc/master_set_credential") {
      rpc = JSON.parse(init.body);
      return pg([{ id: "drso-1", auth_version: 7 }]);
    }
    return pg([], 404);
  };

  const res = resposta();
  await credenciaisHandler(requisicao({ method: "POST", body: { origem: "drso_policiais_externos", id: "drso-1" } }), res);
  assert.equal(res.statusCode, 200);
  assert.match(rpc.p_senha_hash, /^scrypt\$/);
  assert.equal(rpc.p_origem, "drso_policiais_externos");
  assert.equal(rpc.p_ator_id, "master-1");
  assert.equal(rpc.p_evento, "reset_admin");
  assert.equal(typeof res.body.senhaTemporaria, "string");
  assert.equal(JSON.stringify(rpc).includes(res.body.senhaTemporaria), false);

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([]);
    if (url.pathname === "/rest/v1/drso_policiais_externos") return pg([{
      id: "drso-1", matricula: "98765", numeral: "42", ativo: true,
      senha: rpc.p_senha_hash, primeiro_acesso: true, credencial_provisionada: true,
      auth_version: 7,
    }]);
    return pg([]);
  };
  for (const senha of ["senha-antiga", "42", "8765"]) {
    const tentativa = resposta();
    await loginHandler({ method: "POST", headers: {}, body: { matricula: "98765", senha } }, tentativa);
    assert.equal(tentativa.statusCode, 401);
  }
  const acessoTemporario = resposta();
  await loginHandler({ method: "POST", headers: {}, body: { matricula: "98765", senha: res.body.senhaTemporaria } }, acessoTemporario);
  assert.equal(acessoTemporario.statusCode, 200);
  assert.equal(acessoTemporario.body.user.primeiro_acesso, true);
});

test("conta DRSO provisionada rejeita senha antiga e padrão previsível no primeiro acesso", async () => {
  const hash = await hashSenha("Senha-nova-privada9!");
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([]);
    if (url.pathname === "/rest/v1/drso_policiais_externos") return pg([{
      id: "drso-1", matricula: "98765", numeral: "42", ativo: true,
      senha: hash, primeiro_acesso: true, credencial_provisionada: true,
      auth_version: 3, nome_completo: "Externo",
    }]);
    return pg([]);
  };
  for (const senha of ["senha-antiga", "42", "8765"]) {
    const res = resposta();
    await loginHandler({ method: "POST", headers: {}, body: { matricula: "98765", senha } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["Set-Cookie"], undefined);
  }
});

test("conta DRSO existente autentica pela senha armazenada e migra valor legado com compare-and-set", async () => {
  let hashMigrado;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais") return pg([]);
    if (url.pathname === "/rest/v1/drso_policiais_externos" && method === "GET") return pg([{
      id: "drso-legado", matricula: "54321", numeral: "42", ativo: true,
      senha: "senha-legada-corretamente-armazenada", primeiro_acesso: true,
      credencial_provisionada: true, auth_version: 5,
    }]);
    if (url.pathname === "/rest/v1/drso_policiais_externos" && method === "PATCH") {
      hashMigrado = JSON.parse(init.body).senha;
      assert.equal(url.searchParams.get("senha"), "eq.senha-legada-corretamente-armazenada");
      assert.equal(url.searchParams.get("auth_version"), "eq.5");
      return pg([{ id: "drso-legado" }]);
    }
    return pg([]);
  };
  const res = resposta();
  await loginHandler({ method: "POST", headers: {}, body: {
    matricula: "54321", senha: "senha-legada-corretamente-armazenada",
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(hashMigrado, /^scrypt\$/);
  assert.equal(res.body.user.senha, undefined);
});

test("consulta de histórico usa RPC indexada e resposta não expõe dados de auditoria sensíveis", async () => {
  let chamadaRpc;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.has("id")) return pg([{ id: "master-1", auth_version: 0, role: "master" }]);
    if (url.pathname === "/rest/v1/policiais") return pg([{ id: "u-1", senha: "scrypt$segredo", auth_version: 1 }]);
    if (url.pathname === "/rest/v1/drso_policiais_externos") return pg([]);
    if (url.pathname === "/rest/v1/rpc/credential_audit_latest") {
      chamadaRpc = JSON.parse(init.body);
      return pg([{ usuario_id: "u-1", ultimo_login: "2026-11-15T10:00:00Z", ultima_alteracao_senha: null }]);
    }
    return pg([], 404);
  };
  const res = resposta();
  await credenciaisHandler(requisicao({ method: "GET" }), res);
  assert.equal(chamadaRpc.p_origem, "policiais");
  assert.deepEqual(chamadaRpc.p_usuario_ids, ["u-1"]);
  assert.equal(res.body.usuarios[0].ultimoLogin, "2026-11-15T10:00:00Z");
  assert.equal(JSON.stringify(res.body).includes("scrypt$segredo"), false);
});

test("Master solicita invalidação de todas as sessões usando sua identidade autenticada", async () => {
  let rpc;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([{ id: "master-1", role: "master", auth_version: 0 }]);
    if (url.pathname === "/rest/v1/rpc/master_administrar_conta_v1") {
      rpc = JSON.parse(init.body);
      return pg({ id: "alvo-1", origem: "policiais", acao: "encerrar_sessoes", role: "policial", conta_suspensa: false, auth_version: 8 });
    }
    return pg([], 404);
  };
  const res = resposta();
  await credenciaisHandler(requisicao({ method: "POST", body: {
    acao: "administrar_conta", origem: "policiais", id: "alvo-1",
    tipo: "encerrar_sessoes", ator_id: "forjado", role: "master",
  } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(rpc.p_ator_id, "master-1");
  assert.equal(rpc.p_usuario_id, "alvo-1");
  assert.equal(rpc.p_acao, "encerrar_sessoes");
  assert.equal("auth_version" in res.body.conta, false);
});

test("policial não aciona administração de contas e perfis fora da lista são rejeitados", async () => {
  let chamadaRpc = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([{ id: "policial-1", role: "policial", auth_version: 0 }]);
    if (url.pathname.endsWith("master_administrar_conta_v1")) chamadaRpc = true;
    return pg([], 404);
  };
  const negada = resposta();
  await credenciaisHandler(requisicao({ id: "policial-1", role: "policial", method: "POST", body: {
    acao: "administrar_conta", origem: "policiais", id: "alvo-1", tipo: "suspender",
  } }), negada);
  assert.equal(negada.statusCode, 403);
  assert.equal(chamadaRpc, false);

  const masterFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([{ id: "master-1", role: "master", auth_version: 0 }]);
    return pg([], 404);
  };
  const perfilInvalido = resposta();
  await credenciaisHandler(requisicao({ method: "POST", body: {
    acao: "administrar_conta", origem: "policiais", id: "alvo-1", tipo: "alterar_perfil", role: "superadmin",
  } }), perfilInvalido);
  assert.equal(perfilInvalido.statusCode, 400);
  globalThis.fetch = masterFetch;
});

test("edição legada de policiais não contorna a RPC auditada de alteração de perfil", async () => {
  let houveAtualizacao = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("select") === "*") return pg([{ id: "master-1", role: "master", auth_version: 0 }]);
    if (url.pathname === "/rest/v1/policiais" && url.searchParams.get("id") === "eq.alvo-1") return pg([{ id: "alvo-1", role: "policial", drso_escalante: false }]);
    if (method === "PATCH") houveAtualizacao = true;
    return pg([], 404);
  };
  const res = resposta();
  await policialDetalheHandler({
    ...requisicao({ method: "PATCH", body: { role: "master" } }),
    query: { id: "alvo-1" },
  }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(houveAtualizacao, false);
});

test("login de conta suspensa não emite sessão", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/rest/v1/policiais") return pg([{
      id: "suspenso-1", matricula: "11111", senha: "senha-valida",
      conta_suspensa: true, credencial_provisionada: true, auth_version: 0,
    }]);
    return pg([], 404);
  };
  const res = resposta();
  await loginHandler({ method: "POST", headers: {}, body: { matricula: "11111", senha: "senha-valida" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["Set-Cookie"], undefined);
});
