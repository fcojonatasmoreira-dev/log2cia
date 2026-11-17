-- Gestão exclusiva de credenciais pelo Master.
-- NÃO EXECUTAR sem autorização e confirmação do schema remoto.
-- Aplicar e verificar este script antes de publicar as rotas que o exigem.
-- As colunas são adicionadas com TRUE para preservar os marcadores dos registros
-- existentes. Contas sem senha passam a FALSE; somente contas com senha
-- armazenada preservam TRUE. O DEFAULT passa a FALSE para novos inserts.
-- O backend publicado ainda ignora o marcador; execute esta migration em uma
-- janela coordenada e publique o backend atualizado imediatamente depois.
-- Novas contas criadas pelo backend DRSO antigo com senha também ficarão FALSE
-- e precisarão de provisionamento Master após a publicação.
-- Execute com papel confiável que seja proprietário ou tenha poderes equivalentes
-- sobre as tabelas e possa criar funções/triggers e administrar os grants.
-- SECURITY DEFINER executa como o proprietário da função, que será o papel
-- efetivo que a criou/substituiu; confirme esse proprietário após a execução.
-- Não presuma que o papel se chama postgres: confirme-o na instalação alvo.
-- Não execute como anon, authenticated ou service_role.

begin;

alter table public.policiais
  add column if not exists credencial_provisionada boolean not null default true;

alter table public.drso_policiais_externos
  add column if not exists credencial_provisionada boolean not null default true;

-- Não há compatibilidade com credenciais derivadas de matrícula: registros
-- antigos sem senha devem permanecer sem acesso até provisionamento Master.
update public.policiais
set credencial_provisionada = false
where senha is null or length(btrim(senha)) = 0;

update public.drso_policiais_externos
set credencial_provisionada = false
where senha is null or length(btrim(senha)) = 0;

-- Impede provisionamento implícito em novos inserts.
alter table public.policiais
  alter column credencial_provisionada set default false;

alter table public.drso_policiais_externos
  alter column credencial_provisionada set default false;

-- O endpoint de cadastro DRSO deixará de receber senha do escalante.
-- Permitir NULL é necessário para representar conta ainda sem credencial.
alter table public.drso_policiais_externos
  alter column senha drop not null;

create table if not exists public.credential_audit_events (
  id bigint generated always as identity primary key,
  origem text not null check (origem in ('policiais', 'drso_policiais_externos')),
  usuario_id text not null,
  evento text not null check (evento in ('login', 'senha_inicial', 'troca_senha', 'reset_admin', 'migracao_legada')),
  criado_em timestamptz not null default now(),
  ator_id text
);

alter table public.credential_audit_events
  add column if not exists ator_id text;

create index if not exists credential_audit_events_user_time_idx
  on public.credential_audit_events (origem, usuario_id, criado_em desc);

alter table public.credential_audit_events enable row level security;
revoke all on table public.credential_audit_events from public, anon, authenticated;
grant select, insert on table public.credential_audit_events to service_role;
grant usage, select on sequence public.credential_audit_events_id_seq to service_role;

create index if not exists credential_audit_events_latest_idx
  on public.credential_audit_events (origem, usuario_id, evento, criado_em desc);

-- Inserts sempre começam não provisionados, mesmo se o backend antigo enviar
-- uma senha. A RPC Master atualiza a linha depois e pode marcar TRUE usando o
-- contexto transacional autenticado pelo backend. Um reset legado para NULL
-- força FALSE; a atualização Master com hash não é desfeita pelo trigger.
create or replace function public.guard_credential_provisioning()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  evento_credencial text;
  ator_credencial text;
begin
  if tg_op = 'INSERT' then
    new.credencial_provisionada := false;
  elsif new.senha is null or length(btrim(new.senha)) = 0 then
    new.credencial_provisionada := false;
  elsif old.credencial_provisionada is false
        and new.credencial_provisionada is true then
    evento_credencial := nullif(current_setting('app.credential_event', true), '');
    ator_credencial := nullif(current_setting('app.credential_actor_id', true), '');
    if evento_credencial is null
       or evento_credencial not in ('senha_inicial', 'reset_admin')
       or ator_credencial is null then
      new.credencial_provisionada := false;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_credential_provisioning() from public, anon, authenticated;

drop trigger if exists policiais_guard_credential_provisioning on public.policiais;
create trigger policiais_guard_credential_provisioning
  before insert or update of senha, credencial_provisionada on public.policiais
  for each row execute function public.guard_credential_provisioning();

drop trigger if exists drso_external_guard_credential_provisioning on public.drso_policiais_externos;
create trigger drso_external_guard_credential_provisioning
  before insert or update of senha, credencial_provisionada on public.drso_policiais_externos
  for each row execute function public.guard_credential_provisioning();

create or replace function public.audit_credential_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evento_credencial text;
  origem_credencial text;
  ator_credencial text;
begin
  origem_credencial := case
    when tg_table_name = 'policiais' then 'policiais'
    else 'drso_policiais_externos'
  end;

  evento_credencial := nullif(current_setting('app.credential_event', true), '');
  ator_credencial := nullif(current_setting('app.credential_actor_id', true), '');

  if evento_credencial is null and tg_op = 'INSERT' then
    if new.senha is not null and length(btrim(new.senha)) > 0 then
      evento_credencial := 'senha_inicial';
    end if;
  elsif evento_credencial is null and new.senha is distinct from old.senha then
    if new.primeiro_acesso is true
       and new.auth_version is distinct from old.auth_version
       and not (old.auth_version is null and new.auth_version = 0) then
      evento_credencial := 'reset_admin';
    elsif new.senha like 'scrypt$%'
       and coalesce(old.senha, '') not like 'scrypt$%' then
      evento_credencial := 'migracao_legada';
    elsif new.primeiro_acesso is true then
      evento_credencial := 'migracao_legada';
    else
      evento_credencial := 'troca_senha';
    end if;
  end if;

  if evento_credencial is not null then
    insert into public.credential_audit_events (origem, usuario_id, evento, ator_id)
    values (origem_credencial, new.id::text, evento_credencial, ator_credencial);
  end if;
  return new;
end;
$$;

revoke all on function public.audit_credential_change() from public, anon, authenticated;

create or replace function public.master_set_credential(
  p_origem text,
  p_usuario_id text,
  p_ator_id text,
  p_senha_hash text,
  p_evento text
)
returns table (id text, auth_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  tabela text;
begin
  if p_origem is null or p_origem not in ('policiais', 'drso_policiais_externos')
     or p_evento is null or p_evento not in ('senha_inicial', 'reset_admin')
     or nullif(btrim(p_usuario_id), '') is null
     or nullif(btrim(p_ator_id), '') is null
     or p_senha_hash is null or p_senha_hash not like 'scrypt$%' then
    raise exception 'Parâmetros de credencial inválidos' using errcode = '22023';
  end if;

  tabela := case p_origem
    when 'policiais' then 'policiais'
    else 'drso_policiais_externos'
  end;
  perform set_config('app.credential_actor_id', p_ator_id, true);
  perform set_config('app.credential_event', p_evento, true);

  if tabela = 'policiais' then
    return query
      update public.policiais as p
      set senha = p_senha_hash,
          primeiro_acesso = true,
          credencial_provisionada = true,
          auth_version = coalesce(p.auth_version, 0) + 1
      where p.id::text = p_usuario_id
      returning p.id::text, p.auth_version;
  else
    return query
      update public.drso_policiais_externos as p
      set senha = p_senha_hash,
          primeiro_acesso = true,
          credencial_provisionada = true,
          auth_version = coalesce(p.auth_version, 0) + 1
      where p.id::text = p_usuario_id
      returning p.id::text, p.auth_version;
  end if;
end;
$$;

revoke all on function public.master_set_credential(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.master_set_credential(text, text, text, text, text) to service_role;

create or replace function public.credential_audit_latest(p_origem text, p_usuario_ids text[])
returns table (usuario_id text, ultimo_login timestamptz, ultima_alteracao_senha timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ids.usuario_id, login.criado_em, alteracao.criado_em
  from unnest(coalesce(p_usuario_ids, array[]::text[])) as ids(usuario_id)
  left join lateral (
    select e.criado_em
    from public.credential_audit_events as e
    where e.origem = p_origem
      and e.usuario_id = ids.usuario_id
      and e.evento = 'login'
    order by e.criado_em desc
    limit 1
  ) as login on true
  left join lateral (
    select e.criado_em
    from public.credential_audit_events as e
    where e.origem = p_origem
      and e.usuario_id = ids.usuario_id
      and e.evento in ('senha_inicial', 'troca_senha', 'reset_admin', 'migracao_legada')
    order by e.criado_em desc
    limit 1
  ) as alteracao on true;
$$;

revoke all on function public.credential_audit_latest(text, text[]) from public, anon, authenticated;
grant execute on function public.credential_audit_latest(text, text[]) to service_role;

drop trigger if exists policiais_audit_credential_change on public.policiais;
create trigger policiais_audit_credential_change
  after insert or update of senha on public.policiais
  for each row execute function public.audit_credential_change();

drop trigger if exists drso_external_audit_credential_change on public.drso_policiais_externos;
create trigger drso_external_audit_credential_change
  after insert or update of senha on public.drso_policiais_externos
  for each row execute function public.audit_credential_change();

commit;

-- Verificação manual somente após execução autorizada:
-- select column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('policiais', 'drso_policiais_externos')
--   and column_name = 'credencial_provisionada';
-- select relrowsecurity from pg_class
-- where oid = 'public.credential_audit_events'::regclass;
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'credential_audit_events';
-- select p.oid::regprocedure, r.rolname as proprietario, p.prosecdef, p.proconfig
-- from pg_proc p join pg_roles r on r.oid = p.proowner
-- where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('master_set_credential', 'credential_audit_latest',
--                     'audit_credential_change', 'guard_credential_provisioning');
