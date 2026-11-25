import test from "node:test";
import assert from "node:assert/strict";
import { filtrarUsuariosMaster, situacaoCredencialUsuario } from "../src/utils/painelMaster.js";

const usuarios = [
  { nome_completo: "João da Silva", nome_guerra: "Clemilton", numeral: "12", matricula: "0012", role: "master", contaSuspensa: false, credencialProvisionada: true, temSenha: true, primeiroAcesso: false },
  { nome_completo: "Maria Santos", nome_guerra: "De Araújo", numeral: "29", matricula: "0029", role: "policial", contaSuspensa: true, credencialProvisionada: true, temSenha: true, primeiroAcesso: true },
  { nome_completo: "Pedro Souza", nome_guerra: "Souza", numeral: "45", matricula: "0045", role: "policial", contaSuspensa: false, credencialProvisionada: false, temSenha: false, primeiroAcesso: true },
];

test("pesquisa da gestão Master encontra nome, numeral e matrícula e combina filtros locais", () => {
  assert.deepEqual(filtrarUsuariosMaster(usuarios, { busca: "clem" }), [usuarios[0]]);
  assert.deepEqual(filtrarUsuariosMaster(usuarios, { busca: "29" }), [usuarios[1]]);
  assert.deepEqual(filtrarUsuariosMaster(usuarios, { busca: "0045" }), [usuarios[2]]);
  assert.deepEqual(filtrarUsuariosMaster(usuarios, { perfil: "policial", conta: "ativa", credencial: "nao_provisionada" }), [usuarios[2]]);
  assert.deepEqual(filtrarUsuariosMaster(usuarios, { perfil: "policial", conta: "suspensa", credencial: "primeiro_acesso" }), [usuarios[1]]);
});

test("situação da credencial distingue não provisionada, sem senha, primeiro acesso e ativa", () => {
  assert.equal(situacaoCredencialUsuario({ credencialProvisionada: false }), "nao_provisionada");
  assert.equal(situacaoCredencialUsuario({ credencialProvisionada: true, temSenha: false }), "sem_senha");
  assert.equal(situacaoCredencialUsuario({ credencialProvisionada: true, temSenha: true, primeiroAcesso: true }), "primeiro_acesso");
  assert.equal(situacaoCredencialUsuario({ credencialProvisionada: true, temSenha: true, primeiroAcesso: false }), "ativa");
});
