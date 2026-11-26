import test from "node:test";
import assert from "node:assert/strict";
import { imagemDecodificada } from "../src/utils/decodeImage.js";

test("imagem institucional pronta no cache é aceita após decodificar", async () => {
  const imagem = { complete: true, naturalWidth: 1199, decode: async () => {} };
  assert.equal(await imagemDecodificada(imagem), true);
});

test("imagem indisponível ou com erro de decodificação usa fallback", async () => {
  assert.equal(await imagemDecodificada(null), false);
  assert.equal(await imagemDecodificada({ complete: false, naturalWidth: 0 }), false);
  assert.equal(await imagemDecodificada({ complete: true, naturalWidth: 0 }), false);
  assert.equal(await imagemDecodificada({ complete: true, naturalWidth: 100, decode: async () => { throw new Error("decode failed"); } }), false);
});

test("navegador sem decode aceita imagem completa", async () => {
  assert.equal(await imagemDecodificada({ complete: true, naturalWidth: 100 }), true);
});
