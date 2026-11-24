import test from "node:test";
import assert from "node:assert/strict";
import { listarNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas } from "../src/services/notificacoesService.js";

test("serviço usa endpoint interno autenticado para listar e marcar leitura", async () => {
  const anterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, options = {}) => {
    chamadas.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return Response.json({ notificacoes: [], nao_lidas: 0, atualizadas: 1 });
  };
  try {
    await listarNotificacoes();
    await marcarNotificacaoLida("10000000-0000-4000-8000-000000000001");
    await marcarTodasNotificacoesLidas();
  } finally {
    globalThis.fetch = anterior;
  }
  assert.deepEqual(chamadas.map(({ url, options, body }) => ({ url, method: options.method, credentials: options.credentials, body })), [
    { url: "/api/notificacoes", method: undefined, credentials: "include", body: null },
    { url: "/api/notificacoes", method: "PATCH", credentials: "include", body: { acao: "marcar_lida", id: "10000000-0000-4000-8000-000000000001" } },
    { url: "/api/notificacoes", method: "PATCH", credentials: "include", body: { acao: "marcar_todas_lidas" } },
  ]);
});
