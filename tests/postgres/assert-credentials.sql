\set ON_ERROR_STOP on

do $$
declare
  marcador boolean;
  marcador_com_senha boolean;
  marcador_drso_sem_senha boolean;
  default_marcador text;
begin
  select credencial_provisionada into marcador
  from public.policiais where id = '10000000-0000-4000-8000-000000000001';
  if marcador is distinct from false then
    raise exception 'Conta antiga sem senha não foi marcada como não provisionada';
  end if;
  select credencial_provisionada into marcador_com_senha
  from public.policiais where id = '10000000-0000-4000-8000-000000000002';
  if marcador_com_senha is distinct from true then
    raise exception 'Conta antiga com senha não preservou credencial_provisionada=TRUE';
  end if;
  if (select senha from public.policiais where id = '10000000-0000-4000-8000-000000000002') <> 'fake_legacy_hash_value' then
    raise exception 'Migration alterou senha existente de policiais';
  end if;
  if (select credencial_provisionada from public.policiais where id = '10000000-0000-4000-8000-000000000004') is distinct from false then
    raise exception 'Conta antiga com senha vazia não foi marcada como não provisionada';
  end if;
  select credencial_provisionada into marcador_drso_sem_senha
  from public.drso_policiais_externos where id = '20000000-0000-4000-8000-000000000002';
  if marcador_drso_sem_senha is distinct from false then
    raise exception 'Conta DRSO antiga com senha vazia não foi desprovisionada';
  end if;
  if (select credencial_provisionada from public.drso_policiais_externos where id = '20000000-0000-4000-8000-000000000001') is distinct from true
     or (select senha from public.drso_policiais_externos where id = '20000000-0000-4000-8000-000000000001') <> 'fake_legacy_hash_value' then
    raise exception 'Migration não preservou conta DRSO antiga com senha';
  end if;

  select column_default into default_marcador
  from information_schema.columns
  where table_schema = 'public' and table_name = 'policiais'
    and column_name = 'credencial_provisionada';
  if default_marcador not in ('false', 'false::boolean') then
    raise exception 'DEFAULT futuro de policiais não é FALSE: %', default_marcador;
  end if;

  if has_function_privilege('anon', 'public.master_set_credential(text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.master_set_credential(text,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.master_set_credential(text,text,text,text,text)', 'EXECUTE') then
    raise exception 'ACL incorreta na RPC master_set_credential';
  end if;

  if has_function_privilege('anon', 'public.credential_audit_latest(text,text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.credential_audit_latest(text,text[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.credential_audit_latest(text,text[])', 'EXECUTE') then
    raise exception 'ACL incorreta na RPC credential_audit_latest';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.credential_audit_events'::regclass) then
    raise exception 'RLS da tabela de auditoria não está habilitado';
  end if;
  if has_table_privilege('anon', 'public.credential_audit_events', 'SELECT')
     or has_table_privilege('anon', 'public.credential_audit_events', 'INSERT')
     or has_table_privilege('anon', 'public.credential_audit_events', 'UPDATE')
     or has_table_privilege('anon', 'public.credential_audit_events', 'DELETE')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'DELETE') then
    raise exception 'Papel de navegador tem grants na tabela de auditoria';
  end if;

  if (select prosecdef from pg_proc where oid = 'public.master_set_credential(text,text,text,text,text)'::regprocedure) is distinct from true
     or (select prosecdef from pg_proc where oid = 'public.credential_audit_latest(text,text[])'::regprocedure) is distinct from true
     or (select prosecdef from pg_proc where oid = 'public.audit_credential_change()'::regprocedure) is distinct from true then
    raise exception 'Função SECURITY DEFINER esperada não está configurada';
  end if;
end;
$$;

-- Novo cadastro DRSO sem senha permanece não provisionado.
insert into public.drso_policiais_externos
  (id, senha, primeiro_acesso, auth_version, ativo, credencial_provisionada)
values ('20000000-0000-4000-8000-000000000003', null, true, 0, true, true);
do $$
begin
  if (select credencial_provisionada from public.drso_policiais_externos where id = '20000000-0000-4000-8000-000000000003') is distinct from false then
    raise exception 'INSERT novo DRSO sem senha foi marcado como provisionado';
  end if;
end;
$$;

-- Insert sem senha, mesmo com marcador enviado como TRUE, não provisiona conta.
insert into public.policiais (id, senha, primeiro_acesso, auth_version, status, credencial_provisionada)
values ('10000000-0000-4000-8000-000000000003', null, true, 0, 'EM ATIVIDADE', true);
do $$
begin
  if (select credencial_provisionada from public.policiais where id = '10000000-0000-4000-8000-000000000003') is distinct from false then
    raise exception 'INSERT novo foi marcado como provisionado';
  end if;
end;
$$;

-- O backend atua como service_role. A função SECURITY DEFINER faz a mutação
-- e o trigger grava o ator na mesma transação.
set role service_role;
select * from public.master_set_credential(
  'policiais', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-0000000000ff', 'scrypt$fixture$fake-hash', 'senha_inicial'
);
select * from public.master_set_credential(
  'drso_policiais_externos', '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-0000000000ff', 'scrypt$fixture$fake-reset-hash', 'reset_admin'
);
reset role;

do $$
declare
  evento record;
  versao integer;
  senha_fake text;
  primeiro_acesso_db boolean;
begin
  select * into evento from public.credential_audit_events
  where usuario_id = '10000000-0000-4000-8000-000000000001'
  order by criado_em desc, id desc limit 1;
  if evento.evento <> 'senha_inicial'
     or evento.ator_id <> '10000000-0000-4000-8000-0000000000ff' then
    raise exception 'Provisionamento não registrou evento e ator corretos';
  end if;

  select auth_version into versao from public.drso_policiais_externos
  where id = '20000000-0000-4000-8000-000000000001';
  if versao <> 1 then raise exception 'Reset DRSO não incrementou auth_version'; end if;
  select drso.senha, drso.primeiro_acesso
  into senha_fake, primeiro_acesso_db
  from public.drso_policiais_externos as drso
  where drso.id = '20000000-0000-4000-8000-000000000001';
  if senha_fake <> 'scrypt$fixture$fake-reset-hash' or primeiro_acesso_db is distinct from true then
    raise exception 'Reset DRSO não substituiu a credencial e exigiu primeiro acesso';
  end if;
  select * into evento from public.credential_audit_events
  where usuario_id = '20000000-0000-4000-8000-000000000001'
  order by criado_em desc, id desc limit 1;
  if evento.evento <> 'reset_admin'
     or evento.ator_id <> '10000000-0000-4000-8000-0000000000ff' then
    raise exception 'Reset DRSO não registrou evento e ator corretos';
  end if;

  if not exists (
    select 1 from public.credential_audit_latest(
      'policiais', array['10000000-0000-4000-8000-000000000001']::text[]
    ) where ultimo_login is null and ultima_alteracao_senha is not null
  ) then
    raise exception 'credential_audit_latest não retornou histórico esperado';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'credential_audit_events'
      and column_name in ('senha', 'hash', 'token', 'senha_hash')
  ) then
    raise exception 'Auditoria contém coluna de segredo';
  end if;
end;
$$;

-- Exceção deliberada simula falha depois da mutação: a subtransação deve
-- reverter a credencial e o evento juntos.
do $$
declare
  versao_antes integer;
  eventos_antes bigint;
  versao_depois integer;
  eventos_depois bigint;
begin
  select auth_version into versao_antes from public.policiais
  where id = '10000000-0000-4000-8000-000000000001';
  select count(*) into eventos_antes from public.credential_audit_events
  where usuario_id = '10000000-0000-4000-8000-000000000001';
  begin
    perform * from public.master_set_credential(
      'policiais', '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-0000000000ff', 'scrypt$fixture$rollback-hash', 'reset_admin'
    );
    raise exception 'fixture rollback sentinel';
  exception when raise_exception then
    if sqlerrm <> 'fixture rollback sentinel' then raise; end if;
  end;
  select auth_version into versao_depois from public.policiais
  where id = '10000000-0000-4000-8000-000000000001';
  select count(*) into eventos_depois from public.credential_audit_events
  where usuario_id = '10000000-0000-4000-8000-000000000001';
  if versao_depois <> versao_antes or eventos_depois <> eventos_antes then
    raise exception 'Operação e auditoria não reverteram atomicamente';
  end if;
end;
$$;

-- Reset legado para NULL deve retirar o marcador de provisionamento.
update public.policiais set senha = null
where id = '10000000-0000-4000-8000-000000000001';
do $$
begin
  if (select credencial_provisionada from public.policiais where id = '10000000-0000-4000-8000-000000000001') is distinct from false then
    raise exception 'Trigger não retirou provisionamento no reset legado';
  end if;
end;
$$;
