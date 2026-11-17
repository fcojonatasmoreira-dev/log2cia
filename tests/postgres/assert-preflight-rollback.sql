\set ON_ERROR_STOP on
do $$
declare
  tabela text;
  tabela_oid regclass;
  sequencia record;
begin
  if (select relrowsecurity from pg_class where oid='public.policiais'::regclass)
     or (select relforcerowsecurity from pg_class where oid='public.policiais'::regclass)
     or (select relrowsecurity from pg_class where oid='public.equipamentos'::regclass)
     or (select relforcerowsecurity from pg_class where oid='public.equipamentos'::regclass)
     or (select relrowsecurity from pg_class where oid='public.cautelas'::regclass)
     or (select relforcerowsecurity from pg_class where oid='public.cautelas'::regclass)
     or (select relrowsecurity from pg_class where oid='public.cautela_itens'::regclass)
     or (select relforcerowsecurity from pg_class where oid='public.cautela_itens'::regclass) then
    raise exception 'Preflight negativo deixou RLS parcialmente alterado';
  end if;
  foreach tabela in array array['policiais', 'equipamentos', 'cautelas', 'cautela_itens'] loop
    tabela_oid := to_regclass(format('public.%I', tabela));
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tabela and policyname = 'fixture_' || tabela || '_permissiva'
    ) then
      raise exception 'Preflight negativo alterou a policy fixture de public.%', tabela;
    end if;
    if not has_table_privilege('anon', tabela_oid, 'SELECT')
       or not has_table_privilege('anon', tabela_oid, 'INSERT')
       or not has_table_privilege('anon', tabela_oid, 'UPDATE')
       or not has_table_privilege('anon', tabela_oid, 'DELETE')
       or not has_table_privilege('authenticated', tabela_oid, 'SELECT')
       or not has_table_privilege('authenticated', tabela_oid, 'INSERT')
       or not has_table_privilege('authenticated', tabela_oid, 'UPDATE')
       or not has_table_privilege('authenticated', tabela_oid, 'DELETE') then
      raise exception 'Preflight negativo revogou grants em public.%', tabela;
    end if;
    if not has_table_privilege('service_role', tabela_oid, 'SELECT')
       or not has_table_privilege('service_role', tabela_oid, 'INSERT')
       or not has_table_privilege('service_role', tabela_oid, 'UPDATE')
       or not has_table_privilege('service_role', tabela_oid, 'DELETE') then
      raise exception 'Preflight negativo alterou grants de service_role em public.%', tabela;
    end if;

    for sequencia in
      select seq.oid::regclass as nome
      from pg_class seq
      join pg_depend dep on dep.objid = seq.oid and dep.deptype in ('a', 'i')
      where seq.relkind = 'S' and dep.refobjid = tabela_oid
    loop
      if not has_sequence_privilege('anon', sequencia.nome, 'USAGE')
         or not has_sequence_privilege('anon', sequencia.nome, 'SELECT')
         or not has_sequence_privilege('anon', sequencia.nome, 'UPDATE')
         or not has_sequence_privilege('authenticated', sequencia.nome, 'USAGE')
         or not has_sequence_privilege('authenticated', sequencia.nome, 'SELECT')
         or not has_sequence_privilege('authenticated', sequencia.nome, 'UPDATE') then
        raise exception 'Preflight negativo revogou grants de navegador na sequence %', sequencia.nome;
      end if;
      if not has_sequence_privilege('service_role', sequencia.nome, 'USAGE')
         or not has_sequence_privilege('service_role', sequencia.nome, 'SELECT')
         or not has_sequence_privilege('service_role', sequencia.nome, 'UPDATE') then
        raise exception 'Preflight negativo alterou grants de service_role na sequence %', sequencia.nome;
      end if;
    end loop;
  end loop;

  if (select rolbypassrls from pg_roles where rolname = 'service_role') is distinct from false then
    raise exception 'Preflight negativo não preservou service_role como NOBYPASSRLS';
  end if;
end;
$$;
