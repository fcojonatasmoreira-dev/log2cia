\set ON_ERROR_STOP on

-- Schema deliberadamente incompatível, apenas para verificar rollback DDL.
-- A tabela de auditoria não tem identity sequence: a migration deve falhar
-- no GRANT da sequência e reverter as alterações anteriores.
create table public.policiais (
  id uuid primary key,
  senha text,
  primeiro_acesso boolean,
  auth_version integer not null default 0
);
create table public.drso_policiais_externos (
  id uuid primary key,
  senha text not null,
  primeiro_acesso boolean,
  auth_version integer not null default 0
);
create table public.credential_audit_events (
  id bigint primary key,
  origem text not null,
  usuario_id text not null,
  evento text not null,
  criado_em timestamptz not null default now()
);
