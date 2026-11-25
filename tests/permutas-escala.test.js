import test from "node:test";
import assert from "node:assert/strict";
import { obterPeriodoControleEscala, agruparServicosControleEscala, separarServicosControleEscala } from "../src/utils/permutasEscala.js";
import { dataLocalHoje } from "../src/utils/permutasCalendar.js";

test("períodos rápidos começam amanhã e atravessam corretamente mês e ano", () => {
  const hojeLocal = "2026-12-31";
  assert.deepEqual(obterPeriodoControleEscala("amanha", hojeLocal), { inicio: "2027-01-01", fim: "2027-01-01", erro: "" });
  assert.deepEqual(obterPeriodoControleEscala("3_dias", hojeLocal), { inicio: "2027-01-01", fim: "2027-01-03", erro: "" });
  assert.deepEqual(obterPeriodoControleEscala("7_dias", hojeLocal), { inicio: "2027-01-01", fim: "2027-01-07", erro: "" });
});

test("o dia de referência usa a data local do usuário perto da virada do dia", () => {
  const quaseMeiaNoiteLocal = new Date(2026, 11, 31, 23, 59, 59);
  const hojeLocal = dataLocalHoje(quaseMeiaNoiteLocal);
  assert.equal(hojeLocal, "2026-12-31");
  assert.deepEqual(obterPeriodoControleEscala("amanha", hojeLocal), { inicio: "2027-01-01", fim: "2027-01-01", erro: "" });
});

test("período personalizado valida datas e mantém limite de 45 dias", () => {
  assert.deepEqual(obterPeriodoControleEscala("personalizado", "2026-11-30", "2026-12-30", "2027-01-10"), {
    inicio: "2026-12-30", fim: "2027-01-10", erro: "",
  });
  assert.match(obterPeriodoControleEscala("personalizado", "2026-11-30", "2026-02-30", "2026-03-01").erro, /período válido/);
  assert.match(obterPeriodoControleEscala("personalizado", "2026-11-30", "2026-01-01", "2026-02-15").erro, /45 dias/);
  assert.match(obterPeriodoControleEscala("personalizado", "2026-11-30", "2026-01-01", "").erro, /Informe as datas/);
});

const item = (id, data, turno, situacao, status = "DEFERIDA", extra = {}) => ({
  id,
  situacao,
  permuta: { id: `p-${id}`, tipo: "SUBSTITUICAO_SIMPLES", status },
  manifestacao: { data_servico: data, turno, horario_inicio: "08:00" },
  ...extra,
});

test("serviços são agrupados por data e ordenados por data, turno e horário", () => {
  const grupos = agruparServicosControleEscala([
    item("3", "2027-01-02", "B", "PENDENTE_NA_ESCALA"),
    item("2", "2027-01-01", "2", "PENDENTE_NA_ESCALA"),
    item("1", "2027-01-01", "1", "PENDENTE_NA_ESCALA"),
  ]);
  assert.deepEqual(grupos.map((grupo) => [grupo.data, grupo.servicos.map((servico) => servico.id)]), [
    ["2027-01-01", ["1", "2"]],
    ["2027-01-02", ["3"]],
  ]);
});

test("classificação conserva pendências fora do período, revisões, aplicados e encerrados", () => {
  const periodo = { inicio: "2027-01-01", fim: "2027-01-01" };
  const itens = [
    item("amanha", "2027-01-01", "A", "PENDENTE_NA_ESCALA"),
    item("anterior", "2026-12-31", "A", "PENDENTE_NA_ESCALA"),
    item("aplicado", "2026-12-01", "A", "APLICADA_NA_ESCALA"),
    item("revisao", "2026-11-01", "A", "REVISAO_NECESSARIA", "CANCELADA", { revisao_concluida_em: null }),
    item("concluida", "2026-10-01", "A", "REVISAO_NECESSARIA", "CANCELADA", { revisao_concluida_em: "2026-11-01T12:00:00Z" }),
    item("encerrado", "2026-09-01", "A", "PENDENTE_NA_ESCALA", "CANCELADA", { encerrada_em: "2026-08-30T12:00:00Z" }),
  ];
  const listas = separarServicosControleEscala(itens, periodo);
  assert.deepEqual(listas.pendentesPeriodo.map((servico) => servico.id), ["amanha"]);
  assert.deepEqual(listas.aplicados.map((servico) => servico.id), ["aplicado"]);
  assert.deepEqual(listas.anterioresERevisoes.map((servico) => servico.id), ["concluida", "revisao", "anterior"]);
  assert.deepEqual(listas.encerrados.map((servico) => servico.id), ["encerrado"]);
});
