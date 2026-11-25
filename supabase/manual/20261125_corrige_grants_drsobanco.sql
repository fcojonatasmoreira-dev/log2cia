-- Correção pontual de grants excessivos nas tabelas indicadas pelo diagnóstico.
-- Executar manualmente somente após revisar
-- 20261125_diagnostico_seguranca_tabelas_permutas.sql.
-- Remove privilégios de PUBLIC/anon/authenticated apenas nestas duas tabelas.
-- RLS e policies não são alterados. Direitos de backend necessários são
-- concedidos explicitamente a service_role antes da revogação de PUBLIC.

begin;

do $$
declare
  v_role_service oid;
  v_executor_super boolean;
  v_tabela record;
begin
  select oid into v_role_service from pg_catalog.pg_roles where rolname='service_role';
  if v_role_service is null
     or not exists (select 1 from pg_catalog.pg_roles where rolname='anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then
    raise exception 'Roles anon, authenticated e service_role precisam existir; nenhuma correção foi aplicada.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where oid=v_role_service and rolbypassrls) then
    raise exception 'service_role precisa manter BYPASSRLS para o backend; nenhuma correção foi aplicada.';
  end if;

  select rolsuper into v_executor_super from pg_catalog.pg_roles where rolname=current_user;
  for v_tabela in
    select * from (values
      ('drso_policiais_externos'::text),
      ('banco_horas_solicitacoes'::text)
    ) as esperadas(nome)
  loop
    if to_regclass(format('public.%I',v_tabela.nome)) is null then
      raise exception 'Tabela public.% ausente; nenhuma correção foi aplicada.',v_tabela.nome;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_class c
      where c.oid=to_regclass(format('public.%I',v_tabela.nome)) and c.relrowsecurity
    ) then
      raise exception 'RLS não está habilitado em public.%; nenhuma correção foi aplicada.',v_tabela.nome;
    end if;
    if not coalesce(v_executor_super,false)
       and not pg_catalog.pg_has_role(current_user,
             (select relowner from pg_catalog.pg_class where oid=to_regclass(format('public.%I',v_tabela.nome))),
             'MEMBER') then
      raise exception 'Executor não é proprietário/membro do proprietário de public.%; nenhuma correção foi aplicada.',v_tabela.nome;
    end if;
  end loop;

  if not pg_catalog.has_table_privilege(v_role_service,'public.drso_policiais_externos','SELECT')
     or not pg_catalog.has_table_privilege(v_role_service,'public.drso_policiais_externos','INSERT')
     or not pg_catalog.has_table_privilege(v_role_service,'public.drso_policiais_externos','UPDATE')
     or not pg_catalog.has_table_privilege(v_role_service,'public.drso_policiais_externos','DELETE') then
    raise exception 'service_role não possui os privilégios DRSO exigidos pelo handler; nenhuma correção foi aplicada.';
  end if;
  if not pg_catalog.has_table_privilege(v_role_service,'public.banco_horas_solicitacoes','SELECT')
     or not pg_catalog.has_table_privilege(v_role_service,'public.banco_horas_solicitacoes','INSERT')
     or not pg_catalog.has_table_privilege(v_role_service,'public.banco_horas_solicitacoes','UPDATE') then
    raise exception 'service_role não possui SELECT/INSERT/UPDATE exigidos pelo handler do Banco de Horas; nenhuma correção foi aplicada.';
  end if;
end;
$$;

-- Preserva acesso backend se algum dos direitos necessários vier atualmente
-- de PUBLIC. Os mesmos privilégios já são efetivos para service_role antes
-- desta transação; o GRANT os torna explícitos antes de retirar PUBLIC.
grant select, insert, update, delete on table public.drso_policiais_externos to service_role;
grant select, insert, update on table public.banco_horas_solicitacoes to service_role;

revoke all privileges on table public.drso_policiais_externos,
  public.banco_horas_solicitacoes
  from public, anon, authenticated;

-- REVOKE ALL no nível da tabela não substitui REVOKE de ACLs por coluna.
do $$
declare
  v_tabela record;
  v_colunas text;
begin
  for v_tabela in
    select * from (values
      ('drso_policiais_externos'::text),
      ('banco_horas_solicitacoes'::text)
    ) as esperadas(nome)
  loop
    select string_agg(pg_catalog.format('%I',a.attname),', ' order by a.attnum)
      into v_colunas
      from pg_catalog.pg_attribute a
     where a.attrelid=to_regclass(format('public.%I',v_tabela.nome))
       and a.attnum>0 and not a.attisdropped;
    if v_colunas is not null then
      execute pg_catalog.format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        v_colunas,v_tabela.nome
      );
    end if;
  end loop;
end;
$$;

-- Falha fechada se associação de roles/grants externos ainda der acesso ou se
-- os direitos backend necessários não tiverem sido preservados. A exceção
-- reverte toda a transação, inclusive os GRANT/REVOKE acima.
do $$
declare
  v_role record;
  v_tabela record;
  v_rel oid;
begin
  for v_tabela in
    select * from (values
      ('drso_policiais_externos'::text),
      ('banco_horas_solicitacoes'::text)
    ) as esperadas(nome)
  loop
    v_rel:=to_regclass(format('public.%I',v_tabela.nome));
    if not exists (select 1 from pg_catalog.pg_class where oid=v_rel and relrowsecurity) then
      raise exception 'RLS foi alterado inesperadamente em public.%; transação revertida.',v_tabela.nome;
    end if;
    for v_role in select oid,rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated')
    loop
      if pg_catalog.has_table_privilege(v_role.oid,v_rel,'SELECT')
         or pg_catalog.has_table_privilege(v_role.oid,v_rel,'INSERT')
         or pg_catalog.has_table_privilege(v_role.oid,v_rel,'UPDATE')
         or pg_catalog.has_table_privilege(v_role.oid,v_rel,'DELETE')
         or pg_catalog.has_table_privilege(v_role.oid,v_rel,'TRUNCATE')
         or pg_catalog.has_table_privilege(v_role.oid,v_rel,'REFERENCES')
         or pg_catalog.has_table_privilege(v_role.oid,v_rel,'TRIGGER')
         or pg_catalog.has_any_column_privilege(v_role.oid,v_rel,'SELECT')
         or pg_catalog.has_any_column_privilege(v_role.oid,v_rel,'INSERT')
         or pg_catalog.has_any_column_privilege(v_role.oid,v_rel,'UPDATE')
         or pg_catalog.has_any_column_privilege(v_role.oid,v_rel,'REFERENCES') then
        raise exception 'Acesso efetivo de % permanece em public.%; possível grant herdado. Transação revertida.',v_role.rolname,v_tabela.nome;
      end if;
    end loop;
    if exists (
      select 1 from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
      where c.oid=v_rel and x.grantee=0
        and x.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
    ) or exists (
      select 1 from pg_catalog.pg_attribute a
      cross join lateral pg_catalog.aclexplode(a.attacl) x
      where a.attrelid=v_rel and a.attnum>0 and not a.attisdropped
        and x.grantee=0 and x.privilege_type in ('SELECT','INSERT','UPDATE','REFERENCES')
    ) then
      raise exception 'ACL de PUBLIC permanece em public.%; transação revertida.',v_tabela.nome;
    end if;
  end loop;

  if not pg_catalog.has_table_privilege('service_role','public.drso_policiais_externos','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.drso_policiais_externos','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.drso_policiais_externos','UPDATE')
     or not pg_catalog.has_table_privilege('service_role','public.drso_policiais_externos','DELETE')
     or not pg_catalog.has_table_privilege('service_role','public.banco_horas_solicitacoes','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.banco_horas_solicitacoes','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.banco_horas_solicitacoes','UPDATE') then
    raise exception 'Privilégios necessários do service_role não foram preservados; transação revertida.';
  end if;
end;
$$;

commit;
