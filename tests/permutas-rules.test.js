import test from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS_PERMUTA,
  permissoesPermuta,
  podeAvancarParaAnalise,
  servicosConflitam,
  transicaoPermitida,
  validarManifestacoes,
  validarServicoInformado,
} from "../server/api/permutas/rules.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const servicoA = { data: "2026-12-01", turno: "A", horario_inicio: "08:00", horario_fim: "16:00", descricao: "Patrulha" };
const servicoB = { data: "2026-12-03", turno: "B", horario_inicio: "18:00", horario_fim: "06:00", descricao: "Permanência" };

test("policial, P1, Oficial e Master recebem permissões próprias do módulo", () => {
  assert.deepEqual(permissoesPermuta({ role: "policial" }), {
    criar: true, confirmar: true, consultar_proprias: true,
    consultar_geral: false, decidir: false, cancelar_deferida: false,
  });
  assert.deepEqual(permissoesPermuta({ role: "p1" }), {
    criar: true, confirmar: true, consultar_proprias: true,
    consultar_geral: true, decidir: false, cancelar_deferida: false,
  });
  assert.equal(permissoesPermuta({ role: "p1_escalante_servico_ordinario" }).decidir, false);
  assert.equal(permissoesPermuta({ role: "p1_escalante_servico_ordinario" }).consultar_geral, true);
  assert.equal(permissoesPermuta({ role: "oficial" }).consultar_geral, true);
  assert.equal(permissoesPermuta({ role: "oficial" }).decidir, true);
  assert.equal(permissoesPermuta({ role: "master" }).consultar_geral, true);
  assert.equal(permissoesPermuta({ role: "master" }).cancelar_deferida, true);
  assert.equal(permissoesPermuta({ role: "policial", is_master: true }).decidir, true);
  assert.equal(permissoesPermuta({ role: "armeiro" }).criar, false);
});

test("valida campos básicos do serviço informado sem presumir escala de origem", () => {
  assert.equal(validarServicoInformado(servicoA), null);
  assert.match(validarServicoInformado({ ...servicoA, data: "2026-02-30" }), /Data/);
  assert.match(validarServicoInformado({ ...servicoA, turno: " " }), /Turno/);
  assert.match(validarServicoInformado({ ...servicoA, horario_fim: "08:00" }), /Horário/);
  assert.match(validarServicoInformado({ ...servicoA, descricao: "" }), /Descrição/);
});

test("detecta conflitos de horário no mesmo dia e em serviço que atravessa a meia-noite", () => {
  assert.equal(servicosConflitam(servicoA, { ...servicoA, horario_inicio: "15:30", horario_fim: "17:00" }), true);
  assert.equal(servicosConflitam(servicoA, { ...servicoA, horario_inicio: "16:00", horario_fim: "18:00" }), false);
  assert.equal(servicosConflitam(servicoB, { ...servicoB, data: "2026-12-04", horario_inicio: "05:00", horario_fim: "07:00" }), true);
});

test("aceita substituição simples com solicitante e destinatário distintos", () => {
  assert.equal(validarManifestacoes({
    tipo: "SUBSTITUICAO_SIMPLES", solicitanteId: A, destinatarioId: B,
    manifestacoes: [{ policial_id: A, substituto_id: B, servico: servicoA }],
  }), null);
});

test("troca recíproca exige a segunda manifestação no sentido inverso e permite datas distintas", () => {
  const manifestacoes = [
    { policial_id: A, substituto_id: B, servico: servicoA },
    { policial_id: B, substituto_id: A, servico: servicoB },
  ];
  assert.equal(validarManifestacoes({ tipo: "TROCA_RECIPROCA", solicitanteId: A, destinatarioId: B, manifestacoes }), null);
  assert.equal(validarManifestacoes({ tipo: "TROCA_RECIPROCA", solicitanteId: A, destinatarioId: B, manifestacoes: manifestacoes.slice(0, 1) }), "As manifestações não correspondem ao tipo da permuta.");
  assert.match(validarManifestacoes({ tipo: "TROCA_RECIPROCA", solicitanteId: A, destinatarioId: B, manifestacoes: [manifestacoes[0], { ...manifestacoes[1], substituto_id: B }] }), /si mesmo/);
});

test("encaminha para análise somente após manifestações e confirmações dos dois envolvidos", () => {
  const manifestacoes = [{ policial_id: A, substituto_id: B, servico: servicoA }];
  assert.equal(podeAvancarParaAnalise({ tipo: "SUBSTITUICAO_SIMPLES", manifestacoes, confirmacoes: [{ policial_id: B }] }), false);
  assert.equal(podeAvancarParaAnalise({ tipo: "SUBSTITUICAO_SIMPLES", manifestacoes, confirmacoes: [{ policial_id: A }, { policial_id: B }] }), true);
  assert.equal(podeAvancarParaAnalise({
    tipo: "TROCA_RECIPROCA",
    manifestacoes: [...manifestacoes, { policial_id: B, substituto_id: A, servico: servicoB }],
    confirmacoes: [{ policial_id: A }, { policial_id: A }],
  }), false);
});

test("transições seguem o fluxo e impedem cancelar solicitação nunca deferida", () => {
  const { AGUARDANDO_CONFIRMACAO: AC, AGUARDANDO_ANALISE: AA, DEFERIDA: D, INDEFERIDA: I, CANCELADA: C } = ESTADOS_PERMUTA;
  assert.equal(transicaoPermitida(AC, AA), true);
  assert.equal(transicaoPermitida(AA, D), true);
  assert.equal(transicaoPermitida(AA, I), true);
  assert.equal(transicaoPermitida(D, C), true);
  assert.equal(transicaoPermitida(AC, C), false);
  assert.equal(transicaoPermitida(AA, C), false);
  assert.equal(transicaoPermitida(I, C), false);
});
