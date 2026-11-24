set role service_role;
do $$
declare
  v_novas integer;
  v_lida timestamptz;
begin
  v_novas := public.permutas_notificacoes_reconciliar_v1('10000000-0000-4000-8000-000000000003');
  if v_novas < 1 then raise exception 'pendência anterior não foi criada para Oficial'; end if;
  if (select count(*) from public.notificacoes_internas
      where destinatario_id = '10000000-0000-4000-8000-000000000003'
        and permuta_id = '80000000-0000-4000-8000-000000000001'
        and tipo = 'PERMUTA_AGUARDANDO_ANALISE') <> 1 then
    raise exception 'reconciliação criou registro ausente ou duplicado';
  end if;
  update public.notificacoes_internas set lida_em = clock_timestamp()
  where destinatario_id = '10000000-0000-4000-8000-000000000003'
    and permuta_id = '80000000-0000-4000-8000-000000000001'
    and tipo = 'PERMUTA_AGUARDANDO_ANALISE';
  select lida_em into v_lida from public.notificacoes_internas
  where destinatario_id = '10000000-0000-4000-8000-000000000003'
    and permuta_id = '80000000-0000-4000-8000-000000000001'
    and tipo = 'PERMUTA_AGUARDANDO_ANALISE';
  v_novas := public.permutas_notificacoes_reconciliar_v1('10000000-0000-4000-8000-000000000003');
  if v_novas <> 0 or (select lida_em from public.notificacoes_internas
    where destinatario_id = '10000000-0000-4000-8000-000000000003'
      and permuta_id = '80000000-0000-4000-8000-000000000001'
      and tipo = 'PERMUTA_AGUARDANDO_ANALISE') is distinct from v_lida then
    raise exception 'reconciliação duplicou ou reiniciou leitura existente';
  end if;
  v_novas := public.permutas_notificacoes_reconciliar_v1('10000000-0000-4000-8000-000000000007');
  if v_novas < 1 or not exists (select 1 from public.notificacoes_internas
      where destinatario_id = '10000000-0000-4000-8000-000000000007'
        and permuta_id = '80000000-0000-4000-8000-000000000001'
        and tipo = 'PERMUTA_AGUARDANDO_ANALISE') then
    raise exception 'Master com role combinado não recebeu pendência';
  end if;
  if not has_function_privilege('service_role', 'public.permutas_notificacoes_reconciliar_v1(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.permutas_notificacoes_reconciliar_v1(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.permutas_notificacoes_reconciliar_v1(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE da reconciliação não está restrito a service_role';
  end if;
end;
$$;
reset role;

select 'Reconciliação retroativa, deduplicação, preservação de leitura, perfis e ACL verificados.' as resultado;
