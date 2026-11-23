import test from "node:test";
import assert from "node:assert/strict";
import { alternarEstadoLinhaPermuta, atualizarStatusPermuta, obterIdsMiniCalendariosAbertos, podeCancelarPermuta, podeConsultarCalendario, podeConsultarCalendarioProprio, podeDecidirPermuta } from "../src/utils/permutasUi.js";

test("somente P1, escalante P1, Oficial e Master consultam o calendário geral", () => {
  for (const usuario of [
    { role: "p1" }, { role: "p1_escalante_servico_ordinario" },
    { role: "oficial" }, { role: "master" }, { role: "policial", is_master: true },
  ]) assert.equal(podeConsultarCalendario(usuario), true);
  for (const usuario of [{ role: "policial" }, { role: "p4" }, { role: "armeiro" }, null]) {
    assert.equal(podeConsultarCalendario(usuario), false);
  }
});

test("perfis com acesso ao módulo consultam o próprio calendário sem habilitar consulta geral", () => {
  for (const usuario of [
    { id: "1", role: "policial" }, { id: "2", role: "p1" },
    { id: "3", role: "p1_escalante_servico_ordinario" }, { id: "4", role: "oficial" },
    { id: "5", role: "master" },
  ]) assert.equal(podeConsultarCalendarioProprio(usuario), true);
  assert.equal(podeConsultarCalendarioProprio({ id: "6", role: "p4" }), false);
  assert.equal(podeConsultarCalendarioProprio(null), false);
  assert.equal(podeConsultarCalendario({ role: "policial" }), false);
});

test("mini calendários fechados não geram consulta e cada participante abre de forma independente", () => {
  const permutas = [
    { id: "permuta-1", solicitante_id: "A", destinatario_id: "B" },
    { id: "permuta-2", solicitante_id: "A", destinatario_id: "C" },
  ];
  assert.deepEqual(obterIdsMiniCalendariosAbertos(permutas, {}, { podeConsultarGeral: true }), []);
  assert.deepEqual(obterIdsMiniCalendariosAbertos(permutas, { "permuta-1:A": true }, { podeConsultarGeral: true }), ["A"]);
  assert.deepEqual(obterIdsMiniCalendariosAbertos(permutas, {
    "permuta-1:A": true, "permuta-1:B": true,
  }, { podeConsultarGeral: true }), ["A", "B"]);
  assert.deepEqual(obterIdsMiniCalendariosAbertos(permutas, {
    "permuta-1:B": true, "permuta-2:C": true,
  }, { usuarioId: "A", podeConsultarGeral: false }), []);
  assert.deepEqual(obterIdsMiniCalendariosAbertos(permutas, {
    "permuta-1:A": true, "permuta-1:B": true,
  }, { usuarioId: "A", podeConsultarGeral: false }), ["A"]);
});

test("linhas operacionais começam fechadas e expandem/recolhem por solicitação", () => {
  const fechado = {};
  const primeiraAberta = alternarEstadoLinhaPermuta(fechado, "permuta-1");
  assert.equal(primeiraAberta["permuta-1"], true);
  assert.equal(primeiraAberta["permuta-2"], undefined);
  const segundaAberta = alternarEstadoLinhaPermuta(primeiraAberta, "permuta-2");
  assert.equal(segundaAberta["permuta-1"], true);
  assert.equal(segundaAberta["permuta-2"], true);
  const recolhida = alternarEstadoLinhaPermuta(segundaAberta, "permuta-1");
  assert.equal(recolhida["permuta-1"], false);
  assert.equal(recolhida["permuta-2"], true);
});

test("somente Oficial e Master podem decidir, e apenas enquanto aguardando análise", () => {
  for (const usuario of [{ role: "oficial" }, { role: "master" }, { role: "policial", is_master: true }]) {
    assert.equal(podeDecidirPermuta(usuario, "AGUARDANDO_ANALISE"), true);
    assert.equal(podeDecidirPermuta(usuario, "AGUARDANDO_CONFIRMACAO"), false);
    assert.equal(podeDecidirPermuta(usuario, "DEFERIDA"), false);
  }
  for (const usuario of [{ role: "p1" }, { role: "p1_escalante_servico_ordinario" }, { role: "policial" }]) {
    assert.equal(podeDecidirPermuta(usuario, "AGUARDANDO_ANALISE"), false);
  }
});

test("somente Oficial e Master podem cancelar permuta deferida", () => {
  for (const usuario of [{ role: "oficial" }, { role: "master" }, { is_master: true }]) {
    assert.equal(podeCancelarPermuta(usuario, "DEFERIDA"), true);
    assert.equal(podeCancelarPermuta(usuario, "AGUARDANDO_ANALISE"), false);
    assert.equal(podeCancelarPermuta(usuario, "INDEFERIDA"), false);
  }
  assert.equal(podeCancelarPermuta({ role: "p1" }, "DEFERIDA"), false);
  assert.equal(podeCancelarPermuta({ role: "policial" }, "DEFERIDA"), false);
});

test("atualiza imediatamente somente a permuta decidida na lista atual", () => {
  const lista = [{ id: "a", status: "AGUARDANDO_ANALISE" }, { id: "b", status: "DEFERIDA" }];
  const atualizada = atualizarStatusPermuta(lista, "a", "INDEFERIDA");
  assert.deepEqual(atualizada, [{ id: "a", status: "INDEFERIDA" }, { id: "b", status: "DEFERIDA" }]);
  assert.equal(lista[0].status, "AGUARDANDO_ANALISE", "mantém a lista anterior imutável");
});
