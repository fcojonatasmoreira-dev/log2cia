import test from "node:test";
import assert from "node:assert/strict";
import {
  criarEventosCalendario,
  criarEventosCalendarioCompleto,
  criarEventosDispensasCalendario,
  calcularIndicadoresCalendario,
  filtrarServicosDeferidosPassados,
  deslocarData,
  deslocarReferenciaCalendario,
  obterDiasCalendario,
} from "../src/utils/permutasCalendar.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function servico(id, policialId, substitutoId, data, inicio = "08:00", fim = "16:00") {
  return {
    id, policial_id: policialId, substituto_id: substitutoId,
    data_servico: data, horario_inicio: inicio, horario_fim: fim,
  };
}

function permuta(id, status, tipo, manifestacoes) {
  return { id, status, tipo, manifestacoes };
}

test("calendário semanal começa na segunda e navega sete dias", () => {
  assert.deepEqual(obterDiasCalendario("2026-11-23", "semana"), [
    "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
  ]);
  assert.equal(deslocarReferenciaCalendario("2026-12-31", "semana", 1), "2027-01-07");
});

test("calendário mensal inclui todos os dias do mês em semanas completas", () => {
  const dias = obterDiasCalendario("2026-02-15", "mes");
  assert.equal(dias.length % 7, 0);
  assert.ok(dias.includes("2026-02-01"));
  assert.ok(dias.includes("2026-02-28"));
  assert.equal(dias[0], "2026-01-26");
  assert.equal(deslocarReferenciaCalendario("2026-12-19", "mes", 1), "2027-01-01");
  assert.equal(deslocarData("2027-01-01", -1), "2026-12-31");
});

test("troca recíproca marca duas datas e mantém a data original de cada serviço", () => {
  const itens = [permuta("r1", "DEFERIDA", "TROCA_RECIPROCA", [
    servico("s1", A, B, "2026-12-02"),
    servico("s2", B, A, "2026-12-05"),
  ])];
  const eventos = criarEventosCalendario(itens);
  assert.deepEqual(eventos.map((item) => [item.dataMarcacao, item.dataServico]), [
    ["2026-12-02", "2026-12-02"], ["2026-12-05", "2026-12-05"],
  ]);
  assert.ok(eventos.every((item) => item.autorizado));
});

test("serviço noturno é marcado somente na data de início e mantém os horários", () => {
  const eventos = criarEventosCalendario([permuta("n1", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [
    servico("sn", A, B, "2026-12-31", "22:00", "06:00"),
  ])]);
  assert.deepEqual(eventos.map((item) => [item.dataMarcacao, item.dataServico, item.continuidade]), [["2026-12-31", "2026-12-31", false]]);
  assert.equal(eventos[0].manifestacao.horario_inicio, "22:00");
  assert.equal(eventos[0].manifestacao.horario_fim, "06:00");
});

test("mini calendário mantém somente serviços deferidos com horário final local já transcorrido", () => {
  const agora = new Date(2026, 10, 23, 8, 0, 0);
  const itens = [
    permuta("passado", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("p", A, B, "2026-11-22", "08:00", "16:00")]),
    permuta("noite-passada", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("np", A, B, "2026-11-22", "22:00", "06:00")]),
    permuta("noite-futura", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("nf", A, B, "2026-11-22", "22:00", "10:00")]),
    permuta("futuro", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("f", A, B, "2026-11-24", "08:00", "16:00")]),
    permuta("fim-no-momento", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("h", A, B, "2026-11-23", "06:00", "08:00")]),
    permuta("cancelada", "CANCELADA", "SUBSTITUICAO_SIMPLES", [servico("c", A, B, "2026-11-22", "08:00", "16:00")]),
    permuta("indeferida", "INDEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("i", A, B, "2026-11-22", "08:00", "16:00")]),
    permuta("aguardando-confirmacao", "AGUARDANDO_CONFIRMACAO", "SUBSTITUICAO_SIMPLES", [servico("ac", A, B, "2026-11-22", "08:00", "16:00")]),
    permuta("aguardando-analise", "AGUARDANDO_ANALISE", "SUBSTITUICAO_SIMPLES", [servico("aa", A, B, "2026-11-22", "08:00", "16:00")]),
  ];
  const resultado = filtrarServicosDeferidosPassados(itens, agora);
  assert.deepEqual(resultado.map((item) => item.id), ["passado", "noite-passada"]);
  assert.deepEqual(criarEventosCalendario(resultado).map((item) => [item.dataMarcacao, item.dataServico, item.continuidade]), [
    ["2026-11-22", "2026-11-22", false],
    ["2026-11-22", "2026-11-22", false],
  ]);
});

test("filtros identificam se o policial foi substituído ou substituiu alguém", () => {
  const itens = [permuta("r1", "DEFERIDA", "TROCA_RECIPROCA", [
    servico("s1", A, B, "2026-12-02"),
    servico("s2", B, A, "2026-12-05"),
  ])];
  const a = criarEventosCalendario(itens, { policialId: A });
  assert.deepEqual(a.map((item) => item.classificacaoPolicial), ["Foi substituído", "Substituiu alguém"]);
  const b = criarEventosCalendario(itens, { policialId: B });
  assert.deepEqual(b.map((item) => item.classificacaoPolicial), ["Substituiu alguém", "Foi substituído"]);
});

test("situação e tipo filtram serviços e só DEFERIDA conta como autorizada", () => {
  const itens = [
    permuta("ok", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("a", A, B, "2026-12-01")]),
    permuta("cancelada", "CANCELADA", "SUBSTITUICAO_SIMPLES", [servico("b", A, B, "2026-12-01")]),
    permuta("negada", "INDEFERIDA", "TROCA_RECIPROCA", [servico("c", B, A, "2026-12-01")]),
    permuta("pendente", "AGUARDANDO_ANALISE", "TROCA_RECIPROCA", [servico("d", B, A, "2026-12-01")]),
  ];
  const todos = criarEventosCalendario(itens);
  assert.equal(todos.length, 4, "múltiplas permutas no mesmo dia permanecem visíveis");
  assert.equal(todos.filter((item) => item.autorizado).length, 1);
  assert.equal(todos.find((item) => item.permuta.id === "cancelada").autorizado, false);
  assert.equal(todos.find((item) => item.permuta.id === "negada").autorizado, false);
  assert.equal(todos.find((item) => item.permuta.id === "pendente").autorizado, false);
  assert.deepEqual(criarEventosCalendario(itens, { tipo: "SUBSTITUICAO_SIMPLES", status: "CANCELADA" }).map((item) => item.permuta.id), ["cancelada"]);
});

test("indicadores contam serviços e solicitações distintas respeitando filtros", () => {
  const itens = [
    permuta("reciproca", "DEFERIDA", "TROCA_RECIPROCA", [
      servico("r1", A, B, "2026-12-31", "22:00", "06:00"),
      servico("r2", B, A, "2027-01-02", "08:00", "16:00"),
    ]),
    permuta("simples", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [
      servico("s1", A, B, "2027-01-02"),
    ]),
    permuta("historica", "CANCELADA", "SUBSTITUICAO_SIMPLES", [
      servico("h1", A, B, "2027-01-02"),
    ]),
  ];
  const padrao = calcularIndicadoresCalendario(itens, {
    policialId: A, status: "DEFERIDA", dataInicio: "2026-12-31", dataFim: "2027-01-02",
  });
  assert.deepEqual(padrao, { foiSubstituido: 2, substituiu: 1, simples: 1, reciprocas: 1, solicitacoes: 2 });

  const somenteReciproca = calcularIndicadoresCalendario(itens, {
    policialId: A, status: "DEFERIDA", tipo: "TROCA_RECIPROCA", participacao: "substituiu",
    dataInicio: "2027-01-02", dataFim: "2027-01-02",
  });
  assert.deepEqual(somenteReciproca, { foiSubstituido: 0, substituiu: 1, simples: 0, reciprocas: 1, solicitacoes: 1 });
});

test("calendário adiciona somente dispensas deferidas sem confundi-las com eventos ou indicadores de permuta", () => {
  const dispensas = [
    { id: "d1", tipo: "dispensa", policial_id: A, data_servico: "2026-12-31", turno: "A", horas_solicitadas: 12, origem_dispensa: "banco_horas", status: "deferida" },
    { id: "d2", tipo: "dispensa", policial_id: A, data_servico: "2026-12-31", turno: "B", status: "pendente" },
    { id: "d3", tipo: "dispensa", policial_id: A, data_servico: "2027-01-01", turno: "A", status: "indeferida" },
    { id: "d4", tipo: "inclusao_horas", policial_id: A, data_servico: "2026-12-31", turno: "A", status: "deferida" },
  ];
  const eventos = criarEventosDispensasCalendario(dispensas, { policialId: A, dataInicio: "2026-12-01", dataFim: "2026-12-31" });
  assert.deepEqual(eventos.map(({ dispensa, dataMarcacao, chaveParticipacao }) => [dispensa.id, dataMarcacao, chaveParticipacao]), [
    ["d1", "2026-12-31", "dispensa"],
  ]);
  assert.equal(criarEventosDispensasCalendario(dispensas, { policialId: B }).length, 0);
  assert.equal(criarEventosDispensasCalendario(dispensas, { policialId: A, tipo: "SUBSTITUICAO_SIMPLES" }).length, 0);
  const combinados = criarEventosCalendarioCompleto([
    permuta("p1", "DEFERIDA", "SUBSTITUICAO_SIMPLES", [servico("s1", A, B, "2026-12-31")]),
  ], dispensas, { policialId: A, dataInicio: "2026-12-01", dataFim: "2026-12-31" });
  assert.deepEqual(combinados.map((evento) => [evento.dataMarcacao, evento.tipoEvento || "permuta"]), [
    ["2026-12-31", "permuta"], ["2026-12-31", "dispensa"],
  ]);
  assert.deepEqual(calcularIndicadoresCalendario([], { policialId: A }), {
    foiSubstituido: 0, substituiu: 0, simples: 0, reciprocas: 0, solicitacoes: 0,
  });
});

test("filtro de participação no calendário não altera a data original do serviço", () => {
  const itens = [permuta("r1", "DEFERIDA", "TROCA_RECIPROCA", [
    servico("r1a", A, B, "2026-12-31", "22:00", "06:00"),
    servico("r1b", B, A, "2027-01-02"),
  ])];
  const eventos = criarEventosCalendario(itens, {
    policialId: A, participacao: "substituiu", dataInicio: "2027-01-01", dataFim: "2027-01-03",
  });
  assert.deepEqual(eventos.map(({ dataMarcacao, dataServico, continuidade }) => [dataMarcacao, dataServico, continuidade]), [
    ["2027-01-02", "2027-01-02", false],
  ]);
});
