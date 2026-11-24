set role service_role;
do $$
declare
  v_atividade timestamptz;
begin
  v_atividade := public.presenca_registrar_v1(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'
  );
  perform public.presenca_registrar_v1(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'
  );
  perform public.presenca_registrar_v1(
    '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'
  );
  if (select count(*) from public.presenca_sessoes where policial_id = '10000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'heartbeat repetido não atualizou a mesma aba ou duas abas não foram separadas';
  end if;
  if (select max(ultima_atividade) from public.presenca_sessoes where policial_id = '10000000-0000-4000-8000-000000000001') < v_atividade then
    raise exception 'timestamp do heartbeat não avançou';
  end if;
  if not has_function_privilege('service_role', 'public.presenca_registrar_v1(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.presenca_registrar_v1(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.presenca_registrar_v1(uuid,uuid)', 'EXECUTE') then
    raise exception 'EXECUTE do heartbeat não está restrito a service_role';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.presenca_sessoes'::regclass) then
    raise exception 'RLS não está habilitado na tabela de presença';
  end if;
end;
$$;
reset role;

select 'Heartbeat, atualização idempotente por aba, múltiplas abas, RLS e grants verificados.' as resultado;
