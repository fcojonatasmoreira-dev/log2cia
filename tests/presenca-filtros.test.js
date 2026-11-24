import test from "node:test";
import assert from "node:assert/strict";
import { filtrarPresencas } from "../src/utils/presenca.js";

test("filtros automáticos de presença combinam nome, numeral, matrícula, situação, perfil e unidade", () => {
  const usuarios = [
    { nome: "CB Clemilton", numeral: "12", matricula: "0012", situacao: "ONLINE", perfil: "policial", unidade: "2ª CIA" },
    { nome: "SD De Araújo", numeral: "29", matricula: "0029", situacao: "OFFLINE", perfil: "oficial", unidade: "1ª CIA" },
  ];
  assert.deepEqual(filtrarPresencas(usuarios, { busca: "clem" }), [usuarios[0]]);
  assert.deepEqual(filtrarPresencas(usuarios, { busca: "0029" }), [usuarios[1]]);
  assert.deepEqual(filtrarPresencas(usuarios, { busca: "29", situacao: "OFFLINE", perfil: "oficial", unidade: "1ª CIA" }), [usuarios[1]]);
  assert.deepEqual(filtrarPresencas(usuarios, { situacao: "ONLINE", perfil: "oficial" }), []);
});
