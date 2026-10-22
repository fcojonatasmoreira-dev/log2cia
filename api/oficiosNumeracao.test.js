import test from "node:test";
import assert from "node:assert/strict";
import {
  conflitoDeNumero,
  numeroOficio,
  obterProximoNumero,
} from "./oficiosNumeracao.js";

test("formata números internos e de eventos", () => {
  assert.equal(numeroOficio(1, 2026), "001/2026");
  assert.equal(numeroOficio(3, 2026, true), "EVT-003/2026");
});

test("calcula sequências independentes por categoria e ano, preenchendo lacunas", async () => {
  const registros = [
    { ano: 2026, numero_sequencial: 1, evento: false },
    { ano: 2026, numero_sequencial: 3, evento: false },
    { ano: 2026, numero_sequencial: 1, evento: true },
    { ano: 2026, numero_sequencial: 3, evento: true },
    { ano: 2025, numero_sequencial: 1, evento: false },
  ];
  const db = {
    from() {
      const query = {
        ano: null,
        evento: null,
        select() { return this; },
        eq(_column, value) { this.ano = value; return this; },
        is(_column, _operator, value) { this.evento = value === null ? false : true; return this; },
        not() { this.evento = true; return this; },
        order() {
          return Promise.resolve({ data: registros.filter((item) => item.ano === this.ano && item.evento === this.evento), error: null });
        },
      };
      return query;
    },
  };
  assert.equal(await obterProximoNumero(db, 2026, "interno"), 2);
  assert.equal(await obterProximoNumero(db, 2026, "evento"), 2);
  assert.equal(await obterProximoNumero(db, 2025, "evento"), 1);
});

test("só repete tentativas para conflito da chave de numeração", () => {
  assert.equal(conflitoDeNumero({ code: "23505", constraint: "oficios_ano_numero_sequencial_key" }), true);
  assert.equal(conflitoDeNumero({ code: "23505", constraint: "oficios_solicitacao_evento_id_key" }), false);
  assert.equal(conflitoDeNumero({ code: "23505", constraint: "oficios_pasta_id_key" }), false);
  assert.equal(conflitoDeNumero({ code: "23503", constraint: "oficios_ano_numero_sequencial_key" }), false);
});
