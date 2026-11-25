\set ON_ERROR_STOP on

set role service_role;
do $$
declare
  v_lida timestamptz := '2026-11-25 12:00:00+00';
  v_banco_horas integer;
  v_controle_escala integer;
begin
  update public.notificacoes_internas
  set lida_em = v_lida
  where destinatario_id = '10000000-0000-4000-8000-000000000003'
    and permuta_id = '80000000-0000-4000-8000-000000000001'
    and tipo = 'PERMUTA_AGUARDANDO_ANALISE';
  if not found then
    raise exception 'Fixture de pendência preexistente não encontrada para testar leitura preservada.';
  end if;

  select count(*) into v_banco_horas
  from public.notificacoes_internas where tipo like 'BANCO_HORAS_%';
  select count(*) into v_controle_escala
  from public.notificacoes_internas where tipo like 'PERMUTA_ESCALA_%';

  perform public.permutas_notificacoes_reconciliar_v1('10000000-0000-4000-8000-000000000003');
  perform public.permutas_notificacoes_reconciliar_v1('10000000-0000-4000-8000-000000000003');

  if (select count(*) from public.notificacoes_internas
      where destinatario_id = '10000000-0000-4000-8000-000000000003'
        and permuta_id = '80000000-0000-4000-8000-000000000001'
        and tipo = 'PERMUTA_AGUARDANDO_ANALISE') <> 1 then
    raise exception 'Reconciliação repetida duplicou ou removeu a notificação preexistente.';
  end if;
  if (select lida_em from public.notificacoes_internas
      where destinatario_id = '10000000-0000-4000-8000-000000000003'
        and permuta_id = '80000000-0000-4000-8000-000000000001'
        and tipo = 'PERMUTA_AGUARDANDO_ANALISE') is distinct from v_lida then
    raise exception 'Reconciliação alterou o estado de leitura preexistente.';
  end if;
  if (select count(*) from public.notificacoes_internas where tipo like 'BANCO_HORAS_%') <> v_banco_horas
     or (select count(*) from public.notificacoes_internas where tipo like 'PERMUTA_ESCALA_%') <> v_controle_escala then
    raise exception 'Reconciliação alterou notificações do Banco de Horas ou Controle de Escala.';
  end if;
end;
$$;
reset role;

do $$
declare
  v_funcao regprocedure := 'public.permutas_notificacoes_reconciliar_v1(uuid)'::regprocedure;
begin
  if (select count(*) from public.notificacoes_internas
      where destinatario_id = '10000000-0000-4000-8000-000000000003'
        and permuta_id = '80000000-0000-4000-8000-000000000001'
        and tipo = 'PERMUTA_AGUARDANDO_ANALISE') <> 1 then
    raise exception 'A reconciliação após o Controle de Escala duplicou ou perdeu a notificação existente.';
  end if;
  if not (select prosecdef from pg_catalog.pg_proc where oid = v_funcao)
     or not exists (select 1 from pg_catalog.pg_proc p where p.oid = v_funcao and p.proconfig @> array['search_path=pg_catalog, pg_temp']) then
    raise exception 'A função corrigida perdeu SECURITY DEFINER ou search_path seguro.';
  end if;
  if not has_function_privilege('service_role', v_funcao, 'EXECUTE')
     or has_function_privilege('anon', v_funcao, 'EXECUTE')
     or has_function_privilege('authenticated', v_funcao, 'EXECUTE')
     or exists (select 1 from pg_catalog.pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = v_funcao and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'Os privilégios da RPC corrigida não estão restritos a service_role.';
  end if;
end;
$$;
