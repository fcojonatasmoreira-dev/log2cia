import test from "node:test";
import assert from "node:assert/strict";
import { saudacaoOficial } from "../src/utils/dashboardGreeting.js";

test("saudação usa a hora local e só aparece para o perfil efetivo Oficial", () => {
  const oficial = { role: "oficial", modo_acesso: "administrativo" };
  assert.equal(saudacaoOficial(oficial, new Date(2026, 0, 1, 5, 0)), "Bom dia, senhor comandante! 🫡");
  assert.equal(saudacaoOficial(oficial, new Date(2026, 0, 1, 11, 59)), "Bom dia, senhor comandante! 🫡");
  assert.equal(saudacaoOficial(oficial, new Date(2026, 0, 1, 12, 0)), "Boa tarde, senhor comandante! 🫡");
  assert.equal(saudacaoOficial(oficial, new Date(2026, 0, 1, 17, 59)), "Boa tarde, senhor comandante! 🫡");
  assert.equal(saudacaoOficial(oficial, new Date(2026, 0, 1, 18, 0)), "Boa noite, senhor comandante! 🫡");
  assert.equal(saudacaoOficial(oficial, new Date(2026, 0, 1, 4, 59)), "Boa noite, senhor comandante! 🫡");

  for (const role of ["master", "p1", "p4", "armeiro", "policial"]) {
    assert.equal(saudacaoOficial({ role }, new Date(2026, 0, 1, 9, 0)), "", `${role} não deve receber a saudação`);
  }
  assert.equal(saudacaoOficial({ role: "MASTER", modo_acesso: "policial" }, new Date(2026, 0, 1, 9, 0)), "");
});
