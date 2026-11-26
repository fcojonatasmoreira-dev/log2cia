import test from "node:test";
import assert from "node:assert/strict";
import { modulosDashboard, podeVerAlertasDashboard, podeVerPainelMaster } from "../src/utils/dashboardAccess.js";

const caminhos = (usuario) => modulosDashboard(usuario).map((item) => item.caminho);

test("modo Policial só apresenta módulos pessoais e operações policiais comuns", () => {
  const resultado = caminhos({ role: "master", is_master: true, modo_acesso: "policial" });
  assert.deepEqual(resultado, ["/", "/drso", "/banco-horas", "/permutas", "/checkin-viaturas"]);
  assert.equal(resultado.includes("/inventario"), false);
  assert.equal(resultado.includes("/painel-master"), false);
  assert.equal(podeVerPainelMaster({ role: "master", modo_acesso: "policial" }), false);
});

test("modo Administrativo mostra apenas os módulos autorizados ao perfil", () => {
  const policial = caminhos({ role: "policial", modo_acesso: "administrativo" });
  assert.deepEqual(policial, ["/", "/drso", "/permutas", "/checkin-viaturas"]);

  const p4 = caminhos({ role: "p4", modo_acesso: "administrativo" });
  assert.ok(p4.includes("/viaturas"));
  assert.ok(p4.includes("/inventario"));
  assert.equal(p4.includes("/eventos"), false);

  const oficial = caminhos({ role: "oficial", modo_acesso: "administrativo" });
  assert.ok(oficial.includes("/eventos"));
  assert.ok(oficial.includes("/permutas"));
  assert.ok(oficial.includes("/banco-horas"));
  assert.equal(caminhos({ role: "p4", modo_acesso: "administrativo" }).includes("/banco-horas"), false);
});

test("Painel Master e alertas seguem o modo e os perfis atendidos pela API atual", () => {
  assert.equal(podeVerPainelMaster({ role: "master", modo_acesso: "administrativo" }), true);
  assert.equal(podeVerPainelMaster({ role: "p1", modo_acesso: "administrativo" }), false);
  assert.equal(podeVerAlertasDashboard({ role: "p1", modo_acesso: "administrativo" }), true);
  assert.equal(podeVerAlertasDashboard({ role: "p4", modo_acesso: "administrativo" }), false);
  assert.equal(podeVerAlertasDashboard({ role: "policial", modo_acesso: "policial" }), true);
});
