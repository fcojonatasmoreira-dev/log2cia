\set ON_ERROR_STOP on
do $$
declare
  tabela text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name in ('policiais', 'drso_policiais_externos')
      and column_name = 'credencial_provisionada'
  ) then
    raise exception 'Coluna credencial_provisionada permaneceu após rollback';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='credential_audit_events' and column_name='ator_id'
  ) then
    raise exception 'Coluna ator_id permaneceu após rollback';
  end if;
  if (select relrowsecurity from pg_class where oid='public.credential_audit_events'::regclass)
     or (select relforcerowsecurity from pg_class where oid='public.credential_audit_events'::regclass) then
    raise exception 'RLS da auditoria permaneceu alterado após rollback';
  end if;
  if to_regclass('public.credential_audit_events_user_time_idx') is not null
     or to_regclass('public.credential_audit_events_latest_idx') is not null
     or to_regprocedure('public.master_set_credential(text,text,text,text,text)') is not null
     or to_regprocedure('public.credential_audit_latest(text,text[])') is not null
     or to_regprocedure('public.guard_credential_provisioning()') is not null
     or to_regprocedure('public.audit_credential_change()') is not null
     or to_regclass('public.credential_audit_events_id_seq') is not null then
    raise exception 'Índice, função ou sequence parcial permaneceu após rollback';
  end if;
  if not (select attnotnull from pg_attribute where attrelid='public.drso_policiais_externos'::regclass and attname='senha' and not attisdropped) then
    raise exception 'Alteração de nullability não reverteu';
  end if;

  foreach tabela in array array['policiais', 'drso_policiais_externos'] loop
    if exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass(format('public.%I', tabela))
        and not tgisinternal
        and tgname in (
          'policiais_guard_credential_provisioning',
          'drso_external_guard_credential_provisioning',
          'policiais_audit_credential_change',
          'drso_external_audit_credential_change'
        )
    ) then
      raise exception 'Trigger de credencial permaneceu em public.% após rollback', tabela;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'credential_audit_events'
  ) then
    raise exception 'Policy de auditoria permaneceu após rollback';
  end if;
  if has_table_privilege('service_role', 'public.credential_audit_events', 'SELECT')
     or has_table_privilege('service_role', 'public.credential_audit_events', 'INSERT')
     or has_table_privilege('service_role', 'public.credential_audit_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.credential_audit_events', 'DELETE') then
    raise exception 'Grants de service_role permaneceram após rollback';
  end if;
end;
$$;
