import test from "node:test";
import assert from "node:assert/strict";
import { listarPresencas, novaInstanciaPresenca, registrarPresenca } from "../src/services/presencaService.js";

test("serviço usa sessão por cookie e a API protegida de presença", async () => {
  const anterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, options) => {
    chamadas.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return Response.json({ usuarios: [], total_online: 0, ultima_atividade: "agora" });
  };
  try {
    const instancia = novaInstanciaPresenca();
    assert.match(instancia, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await registrarPresenca(instancia);
    await listarPresencas();
  } finally {
    globalThis.fetch = anterior;
  }
  assert.deepEqual(chamadas.map(({ url, options, body }) => [url, options.method, options.credentials, body]), [
    ["/api/presenca", "POST", "include", { instancia_id: chamadas[0].body.instancia_id }],
    ["/api/presenca", undefined, "include", null],
  ]);
});
