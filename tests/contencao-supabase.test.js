import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/manual/20261116_contencao_tabelas_core.sql", import.meta.url), "utf8");

test("script de contenção protege as quatro tabelas e exige service_role com BYPASSRLS", () => {
  for (const tabela of ["policiais", "equipamentos", "cautelas", "cautela_itens"]) {
    assert.match(sql, new RegExp(`public\\.${tabela}`));
    assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security`, "i"));
  }
  assert.match(sql, /revoke all privileges on table[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant all privileges on table[\s\S]*to service_role/i);
  assert.match(sql, /rolbypassrls/i);
  assert.match(sql, /revoke all privileges on sequence[\s\S]*public, anon, authenticated/i);
});

test("script é transacional e preserva policies e dados", () => {
  assert.match(sql, /\bbegin;/i);
  assert.match(sql, /commit;\s*$/i);
  assert.doesNotMatch(sql, /drop policy|delete from|truncate|drop table/i);
});
