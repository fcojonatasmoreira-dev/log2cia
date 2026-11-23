import test from "node:test";
import assert from "node:assert/strict";
import {
  ehPostoOficial,
  filtrarPoliciaisPorBusca,
  filtrarPoliciaisSubstitutos,
  formatarIdentificacaoPolicial,
  ordenarPoliciaisHierarquicamente,
  pesoHierarquiaPolicial,
} from "../src/utils/hierarquiaPolicial.js";

const postos = [
  "Coronel", "Tenente-Coronel", "Major", "Capitão", "1º Tenente", "2º Tenente",
  "Aspirante a Oficial", "Subtenente", "1º Sargento", "2º Sargento", "3º Sargento", "Cabo", "Soldado",
];

function policial(id, posto, extra = {}) {
  return { id, posto_graduacao: posto, numeral: "12", nome_guerra: id.toUpperCase(), status: "EM ATIVIDADE", ...extra };
}

test("ordena os postos do mais alto ao mais baixo pela hierarquia militar", () => {
  const entrada = [...postos].reverse().map((posto, indice) => policial(String(indice), posto));
  assert.deepEqual(ordenarPoliciaisHierarquicamente(entrada).map((item) => item.posto_graduacao), postos);
  assert.equal(pesoHierarquiaPolicial("TEN CEL"), 2);
  assert.equal(pesoHierarquiaPolicial("Asp Of"), 7);
});

test("exclui o próprio usuário, oficiais e policiais fora de atividade", () => {
  const lista = [
    policial("eu", "Soldado"), policial("cel", "Coronel"), policial("asp", "Aspirante"),
    policial("inativo", "Cabo", { status: "INATIVO" }), policial("cabo", "Cabo"),
  ];
  assert.equal(ehPostoOficial("Aspirante a Oficial"), true);
  assert.deepEqual(filtrarPoliciaisSubstitutos(lista, { usuarioId: "eu" }).map((item) => item.id), ["cabo"]);
});

test("busca parcial sem acento por nome de guerra, numeral e posto/graduação", () => {
  const lista = [policial("alvaro", "Soldado", { nome_guerra: "Álvaro" }), policial("cabo", "Cabo", { numeral: "237" })];
  assert.deepEqual(filtrarPoliciaisSubstitutos(lista, { busca: "alv" }).map((item) => item.id), ["alvaro"]);
  assert.deepEqual(filtrarPoliciaisSubstitutos(lista, { busca: "37" }).map((item) => item.id), ["cabo"]);
  assert.deepEqual(filtrarPoliciaisSubstitutos(lista, { busca: "sold" }).map((item) => item.id), ["alvaro"]);
});

test("busca geral do calendário usa hierarquia sem excluir usuário, oficiais ou inativos", () => {
  const lista = [
    policial("soldado", "Soldado", { nome_guerra: "Álvaro", numeral: "237" }),
    policial("oficial", "Major", { nome_guerra: "ALFA", status: "INATIVO" }),
    policial("cabo", "Cabo", { nome_guerra: "BRAVO", numeral: "12" }),
  ];
  assert.deepEqual(filtrarPoliciaisPorBusca(lista).map(({ id }) => id), ["oficial", "cabo", "soldado"]);
  assert.deepEqual(filtrarPoliciaisPorBusca(lista, { busca: "alv" }).map(({ id }) => id), ["soldado"]);
  assert.deepEqual(filtrarPoliciaisPorBusca(lista, { busca: "37" }).map(({ id }) => id), ["soldado"]);
  assert.deepEqual(filtrarPoliciaisPorBusca(lista, { busca: "maj" }).map(({ id }) => id), ["oficial"]);
});

test("formata o candidato com posto, numeral e nome de guerra", () => {
  assert.equal(formatarIdentificacaoPolicial(policial("alfa", "Cabo", { numeral: "42", nome_guerra: "ALFA" })), "Cabo 42 – ALFA");
});
