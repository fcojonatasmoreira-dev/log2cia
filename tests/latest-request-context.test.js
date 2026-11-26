import test from "node:test";
import assert from "node:assert/strict";
import { createLatestRequestGuard } from "../src/utils/latestRequestGuard.js";
import { chaveContextoSessao } from "../src/utils/sessionContext.js";
import { listarViaturas } from "../src/services/viaturasService.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("resposta antiga que chega por último não substitui a consulta mais recente", async () => {
  const guard = createLatestRequestGuard();
  const antiga = deferred();
  const nova = deferred();
  const exibidos = [];

  const consultaAntiga = guard.run(() => antiga.promise, { onSuccess: (valor) => exibidos.push(valor) });
  const consultaNova = guard.run(() => nova.promise, { onSuccess: (valor) => exibidos.push(valor) });
  nova.resolve("contexto novo");
  assert.equal((await consultaNova).status, "success");
  antiga.resolve("contexto anterior");

  assert.equal((await consultaAntiga).status, "stale");
  assert.deepEqual(exibidos, ["contexto novo"]);
});

test("logout ou troca de contexto invalida uma requisição ainda pendente", async () => {
  const guard = createLatestRequestGuard();
  const pendente = deferred();
  const exibidos = [];
  const consulta = guard.run(() => pendente.promise, { onSuccess: (valor) => exibidos.push(valor) });

  guard.invalidate();
  pendente.resolve("dados da sessão encerrada");

  assert.equal((await consulta).status, "stale");
  assert.deepEqual(exibidos, []);
});

test("notificações antigas não reaparecem após a sessão mudar", async () => {
  const guard = createLatestRequestGuard();
  const pendente = deferred();
  let notificacoes = [{ id: "aviso-da-sessao-anterior" }];
  const consulta = guard.run(() => pendente.promise, {
    onSuccess: (resultado) => { notificacoes = resultado; },
  });

  notificacoes = [];
  guard.invalidate();
  pendente.resolve([{ id: "aviso-da-sessao-anterior" }]);

  assert.equal((await consulta).status, "stale");
  assert.deepEqual(notificacoes, []);
});

test("troca rápida de mês no DRSO descarta a resposta do mês anterior", async () => {
  const guard = createLatestRequestGuard();
  const novembro = deferred();
  const dezembro = deferred();
  let mesExibido = "2026-11";
  let dadosExibidos = [];
  const consultaNovembro = guard.run(() => novembro.promise, {
    onSuccess: (resultado) => { mesExibido = "2026-11"; dadosExibidos = resultado; },
  });
  const consultaDezembro = guard.run(() => dezembro.promise, {
    onSuccess: (resultado) => { mesExibido = "2026-12"; dadosExibidos = resultado; },
  });

  dezembro.resolve(["escala de dezembro"]);
  await consultaDezembro;
  novembro.resolve(["escala de novembro"]);

  assert.equal((await consultaNovembro).status, "stale");
  assert.equal(mesExibido, "2026-12");
  assert.deepEqual(dadosExibidos, ["escala de dezembro"]);
});

test("falha ao consultar viaturas permanece erro e não resposta vazia", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: "Serviço de viaturas indisponível" }),
  });

  try {
    await assert.rejects(listarViaturas(), (error) => {
      assert.equal(error.message, "Serviço de viaturas indisponível");
      assert.equal(error.status, 503);
      return true;
    });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("contexto de sessão distingue usuário, modo e permissões efetivas", () => {
  const base = { id: "p1", role: "master", modo_acesso: "administrativo", permissoes: { gerir: true } };
  assert.equal(chaveContextoSessao(base), chaveContextoSessao({ ...base }));
  assert.notEqual(chaveContextoSessao(base), chaveContextoSessao({ ...base, id: "p2" }));
  assert.notEqual(chaveContextoSessao(base), chaveContextoSessao({ ...base, modo_acesso: "policial" }));
  assert.notEqual(chaveContextoSessao(base), chaveContextoSessao({ ...base, permissoes: { gerir: false } }));
});
