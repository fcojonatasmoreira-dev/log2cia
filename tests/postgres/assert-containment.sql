\set ON_ERROR_STOP on

do $$
declare
  tabela text;
  tabela_oid regclass;
  sequencia record;
begin
  foreach tabela in array array['policiais', 'equipamentos', 'cautelas', 'cautela_itens'] loop
    tabela_oid := to_regclass(format('public.%I', tabela));
    if not (select relrowsecurity from pg_class where oid = tabela_oid) then
      raise exception 'RLS não habilitado em public.%', tabela;
    end if;
    if has_table_privilege('anon', tabela_oid, 'SELECT')
       or has_table_privilege('anon', tabela_oid, 'INSERT')
       or has_table_privilege('anon', tabela_oid, 'UPDATE')
       or has_table_privilege('anon', tabela_oid, 'DELETE')
       or has_table_privilege('authenticated', tabela_oid, 'SELECT')
       or has_table_privilege('authenticated', tabela_oid, 'INSERT')
       or has_table_privilege('authenticated', tabela_oid, 'UPDATE')
       or has_table_privilege('authenticated', tabela_oid, 'DELETE') then
      raise exception 'anon/authenticated ainda têm privilégios em public.%', tabela;
    end if;
    if not has_table_privilege('service_role', tabela_oid, 'SELECT')
       or not has_table_privilege('service_role', tabela_oid, 'INSERT')
       or not has_table_privilege('service_role', tabela_oid, 'UPDATE')
       or not has_table_privilege('service_role', tabela_oid, 'DELETE') then
      raise exception 'service_role perdeu privilégios necessários em public.%', tabela;
    end if;

    for sequencia in
      select seq.oid::regclass as nome
      from pg_class seq
      join pg_depend dep on dep.objid = seq.oid and dep.deptype in ('a', 'i')
      where seq.relkind = 'S' and dep.refobjid = tabela_oid
    loop
      if has_sequence_privilege('anon', sequencia.nome, 'USAGE')
         or has_sequence_privilege('anon', sequencia.nome, 'SELECT')
         or has_sequence_privilege('anon', sequencia.nome, 'UPDATE')
         or has_sequence_privilege('authenticated', sequencia.nome, 'USAGE')
         or has_sequence_privilege('authenticated', sequencia.nome, 'SELECT')
         or has_sequence_privilege('authenticated', sequencia.nome, 'UPDATE') then
        raise exception 'Papel de navegador manteve privilégio na sequência %', sequencia.nome;
      end if;
      if not has_sequence_privilege('service_role', sequencia.nome, 'USAGE')
         or not has_sequence_privilege('service_role', sequencia.nome, 'SELECT') then
        raise exception 'service_role perdeu acesso à sequência %', sequencia.nome;
      end if;
    end loop;
  end loop;

  if (select rolbypassrls from pg_roles where rolname = 'service_role') is distinct from true then
    raise exception 'service_role não possui BYPASSRLS';
  end if;
  if has_table_privilege('anon', 'public.credential_audit_events', 'SELECT')
     or has_table_privilege('anon', 'public.credential_audit_events', 'INSERT')
     or has_table_privilege('anon', 'public.credential_audit_events', 'UPDATE')
     or has_table_privilege('anon', 'public.credential_audit_events', 'DELETE')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.credential_audit_events', 'DELETE') then
    raise exception 'Papel de navegador tem acesso à auditoria';
  end if;
  if not has_table_privilege('service_role', 'public.credential_audit_events', 'SELECT')
     or not has_table_privilege('service_role', 'public.credential_audit_events', 'INSERT') then
    raise exception 'service_role perdeu acesso à auditoria';
  end if;
end;
$$;

-- Confirma uma leitura real sob o papel que as APIs usam, após RLS habilitado.
set role service_role;
select count(*) from public.equipamentos;
select count(*) from public.credential_audit_events;
reset role;
