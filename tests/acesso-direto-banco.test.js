import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const PASTA_SRC = join(RAIZ, "src");

function arquivos(raiz) {
  const encontrados = [];
  for (const entrada of readdirSync(raiz)) {
    const caminho = join(raiz, entrada);
    if (statSync(caminho).isDirectory()) encontrados.push(...arquivos(caminho));
    else if (/\.(jsx?|js)$/.test(entrada)) encontrados.push(caminho);
  }
  return encontrados;
}

test("nenhuma tela acessa o banco ou o storage diretamente pelo navegador", () => {
  const infratores = [];
  for (const arquivo of arquivos(PASTA_SRC)) {
    const conteudo = readFileSync(arquivo, "utf8");
    const usaClienteSupabase = /from\s+["'][^"']*supabaseClient["']/.test(conteudo);
    const consultaTabela = /\.from\(\s*["'][a-z_]+["']\s*\)/.test(conteudo);
    const usaStorage = /\.storage\b/.test(conteudo);
    if (usaClienteSupabase || consultaTabela || usaStorage) {
      infratores.push(relative(RAIZ, arquivo));
    }
  }
  assert.deepEqual(infratores, [], `acesso direto ao banco no navegador: ${infratores.join(", ")}`);
});
