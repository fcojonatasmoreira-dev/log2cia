import test from "node:test";
import assert from "node:assert/strict";
import { criarSessao } from "../server/api/auth/_session.js";
import { usuarioAutenticado } from "../server/api/_server.js";
import { autorizarLeituraPoliciais } from "../server/api/policiais/index.js";
import { podeGerenciarTipoEquipamento, podeLerInventario, validarNovoEquipamento } from "../server/api/equipamentos/index.js";

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
  assert.equal(autorizarLeituraPoliciais({ id: "5", role: "p4" }, "nova-cautela"), true);
  assert.equal(autorizarLeituraPoliciais({ id: "6", role: "armeiro" }, "gestao"), true);
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
