import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/manual/20261116_gestao_credenciais_master.sql", import.meta.url),
  "utf8",
);
const login = readFileSync(new URL("../server/api/auth/_login.js", import.meta.url), "utf8");

test("migration preserva contas com senha, desprovisiona as sem senha e usa FALSE no default", () => {
  for (const tabela of ["policiais", "drso_policiais_externos"]) {
    const adicionar = migration.indexOf(
      `alter table public.${tabela}\n  add column if not exists credencial_provisionada boolean not null default true;`,
    );
    const defaultFuturo = migration.indexOf(
      `alter table public.${tabela}\n  alter column credencial_provisionada set default false;`,
    );
    assert.notEqual(adicionar, -1, `coluna de ${tabela} precisa preservar os registros existentes`);
    const updateSemSenha = migration.indexOf(`update public.${tabela}\nset credencial_provisionada = false\nwhere senha is null or length(btrim(senha)) = 0;`);
    assert.ok(defaultFuturo > adicionar, `default futuro de ${tabela} precisa ser FALSE após a adição`);
    assert.ok(updateSemSenha > adicionar && updateSemSenha < defaultFuturo, `contas sem senha de ${tabela} precisam ser desprovisionadas antes do default`);
  }
  assert.match(migration, /where senha is null or length\(btrim\(senha\)\) = 0;/i);
});

test("trigger bloqueia provisionamento implícito em inserts e resets sem senha", () => {
  assert.match(migration, /if tg_op = 'INSERT' then\s+new\.credencial_provisionada := false;/i);
  assert.match(migration, /elsif new\.senha is null or length\(btrim\(new\.senha\)\) = 0 then\s+new\.credencial_provisionada := false;/i);
  assert.match(migration, /before insert or update of senha, credencial_provisionada on public\.policiais/i);
  assert.match(migration, /before insert or update of senha, credencial_provisionada on public\.drso_policiais_externos/i);
});

test("RPC Master autoriza FALSE para TRUE no mesmo contexto transacional da auditoria", () => {
  const rpcStart = migration.indexOf("create or replace function public.master_set_credential(");
  const rpcEnd = migration.indexOf("revoke all on function public.master_set_credential", rpcStart);
  const rpc = migration.slice(rpcStart, rpcEnd);
  assert.match(rpc, /set_config\('app\.credential_actor_id', p_ator_id, true\)/);
  assert.match(rpc, /set_config\('app\.credential_event', p_evento, true\)/);
  assert.match(rpc, /credencial_provisionada = true/);
  assert.match(rpc, /auth_version = coalesce\(p\.auth_version, 0\) \+ 1/);
  assert.match(migration, /evento_credencial is null\s+or evento_credencial not in \('senha_inicial', 'reset_admin'\)\s+or ator_credencial is null/i);
  assert.match(migration, /insert into public\.credential_audit_events \(origem, usuario_id, evento, ator_id\)/i);
  assert.match(migration, /grant execute on function public\.master_set_credential\(text, text, text, text, text\) to service_role/i);
});

test("migration protege as funções e a tabela e mantém DDL dentro de uma transação", () => {
  assert.match(migration.trimStart(), /^--[\s\S]*?begin;/i);
  assert.match(migration, /revoke all on function public\.credential_audit_latest\(text, text\[\]\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.credential_audit_latest\(text, text\[\]\) to service_role/i);
  assert.match(migration, /alter table public\.credential_audit_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.credential_audit_events from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on table public\.credential_audit_events to service_role/i);
  assert.match(migration.trimEnd(), /commit;[\s\S]*$/i);
  assert.match(migration, /proprietário[\s\S]*?não presuma que o papel se chama postgres/i);
});

test("login não usa policiais.status e contas explicitamente não provisionadas não usam fallback", () => {
  assert.doesNotMatch(login, /policial\.status|\.eq\(["']status["']/i);
  assert.match(login, /policial\.credencial_provisionada === false/);
  assert.match(login, /if \(!senhaLegada\)/);
  assert.doesNotMatch(login, /obterSenhaPadrao|usaSenhaPadrao|matricula\.slice/);
  assert.match(login, /externo\.credencial_provisionada === false/);
});
