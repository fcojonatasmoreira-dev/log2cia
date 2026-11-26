import test from "node:test";
import assert from "node:assert/strict";
import { aplicarTema, obterTemaSalvo, TEMAS, THEME_STORAGE_KEY } from "../src/utils/theme.js";

function criarStorage(inicial = {}) {
  const valores = new Map(Object.entries(inicial));
  return {
    getItem: (chave) => valores.get(chave) ?? null,
    setItem: (chave, valor) => valores.set(chave, valor),
  };
}

test("tema persistido é lido com fallback claro para valores inválidos", () => {
  assert.equal(obterTemaSalvo(criarStorage()), TEMAS.CLARO);
  assert.equal(obterTemaSalvo(criarStorage({ [THEME_STORAGE_KEY]: "escuro" })), TEMAS.ESCURO);
  assert.equal(obterTemaSalvo(criarStorage({ [THEME_STORAGE_KEY]: "desconhecido" })), TEMAS.CLARO);
});

test("falha de armazenamento não impede inicialização ou aplicação do tema", () => {
  const storageBloqueado = {
    getItem() { throw new Error("armazenamento indisponível"); },
    setItem() { throw new Error("armazenamento indisponível"); },
  };
  const raiz = { dataset: {}, style: {} };

  assert.equal(obterTemaSalvo(storageBloqueado), TEMAS.CLARO);
  assert.equal(aplicarTema(TEMAS.ESCURO, raiz, storageBloqueado), TEMAS.ESCURO);
  assert.equal(raiz.dataset.theme, TEMAS.ESCURO);
  assert.equal(raiz.style.colorScheme, "dark");
});

test("alternar tema atualiza a raiz e persiste sem depender de navegador", () => {
  const raiz = { dataset: {}, style: {} };
  const storage = criarStorage();
  assert.equal(aplicarTema("escuro", raiz, storage), TEMAS.ESCURO);
  assert.equal(raiz.dataset.theme, "escuro");
  assert.equal(raiz.style.colorScheme, "dark");
  assert.equal(obterTemaSalvo(storage), TEMAS.ESCURO);
  aplicarTema("claro", raiz, storage);
  assert.equal(raiz.style.colorScheme, "light");
  assert.equal(obterTemaSalvo(storage), TEMAS.CLARO);
});
