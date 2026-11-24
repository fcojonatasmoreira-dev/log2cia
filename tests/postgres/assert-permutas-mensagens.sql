do $$
declare
  v_id_sem_mensagens uuid;
  v_id_com_tres uuid;
  v_id_parcial uuid;
  v_id_rollback uuid;
  v_status text;
  v_evento public.permutas_servico_historico%rowtype;
  v_tem_public boolean;
begin
  if not exists (
    select 1 from public.permutas_servico_historico
    where tipo_evento = 'DEFERIDA'
      and justificativa = 'Serviços conferidos e deferidos.'
      and mensagem_escalante is null and mensagem_policial_1 is null and mensagem_policial_2 is null
  ) then
    raise exception 'migration não preservou registro histórico legado com justificativa única';
  end if;

  insert into public.permutas_servico (tipo, status, solicitante_id, destinatario_id, motivo)
  values ('SUBSTITUICAO_SIMPLES', 'AGUARDANDO_ANALISE',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Motivo preservado')
  returning id into v_id_sem_mensagens;
  v_status := public.permutas_servico_decidir_v2(
    v_id_sem_mensagens, '10000000-0000-4000-8000-000000000003', true, true, null, null, null
  );
  if v_status <> 'DEFERIDA' then raise exception 'deferimento vazio falhou'; end if;

  select * into v_evento from public.permutas_servico_historico
  where permuta_id = v_id_sem_mensagens and tipo_evento = 'DEFERIDA';
  if v_evento.ator_id <> '10000000-0000-4000-8000-000000000003'
    or v_evento.ocorrido_em is null or not v_evento.servicos_conferidos
    or v_evento.mensagem_escalante is not null
    or v_evento.mensagem_policial_1 is not null
    or v_evento.mensagem_policial_2 is not null then
    raise exception 'deferimento sem mensagens não preservou ator, timestamp ou campos opcionais';
  end if;

  insert into public.permutas_servico (tipo, status, solicitante_id, destinatario_id, motivo)
  values ('TROCA_RECIPROCA', 'AGUARDANDO_ANALISE',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Outro motivo')
  returning id into v_id_com_tres;
  v_status := public.permutas_servico_decidir_v2(
    v_id_com_tres, '10000000-0000-4000-8000-000000000003', true, true,
    ' Escalante ', ' Solicitante ', ' Destinatário '
  );
  if v_status <> 'DEFERIDA' then raise exception 'deferimento com mensagens falhou'; end if;
  select * into v_evento from public.permutas_servico_historico
  where permuta_id = v_id_com_tres and tipo_evento = 'DEFERIDA';
  if v_evento.mensagem_escalante <> 'Escalante'
    or v_evento.mensagem_policial_1 <> 'Solicitante'
    or v_evento.mensagem_policial_2 <> 'Destinatário' then
    raise exception 'mensagens distintas não foram preservadas ou aparadas';
  end if;

  insert into public.permutas_servico (tipo, status, solicitante_id, destinatario_id, motivo)
  values ('SUBSTITUICAO_SIMPLES', 'AGUARDANDO_ANALISE',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Motivo parcial')
  returning id into v_id_parcial;
  v_status := public.permutas_servico_decidir_v2(
    v_id_parcial, '10000000-0000-4000-8000-000000000003', false, true,
    null, null, 'Somente destinatário'
  );
  if v_status <> 'INDEFERIDA' then raise exception 'indeferimento parcial falhou'; end if;
  select * into v_evento from public.permutas_servico_historico
  where permuta_id = v_id_parcial and tipo_evento = 'INDEFERIDA';
  if v_evento.mensagem_escalante is not null
    or v_evento.mensagem_policial_1 is not null
    or v_evento.mensagem_policial_2 <> 'Somente destinatário' then
    raise exception 'mensagens parciais foram gravadas incorretamente';
  end if;

  perform public.permutas_servico_cancelar_v1(
    v_id_com_tres, '10000000-0000-4000-8000-000000000003', 'Cancelamento de teste'
  );
  if (select count(*) from public.permutas_servico_historico
      where permuta_id = v_id_com_tres and tipo_evento = 'DEFERIDA'
        and mensagem_escalante = 'Escalante' and mensagem_policial_1 = 'Solicitante'
        and mensagem_policial_2 = 'Destinatário') <> 1
    or (select count(*) from public.permutas_servico_historico
      where permuta_id = v_id_com_tres and tipo_evento = 'CANCELADA') <> 1 then
    raise exception 'cancelamento alterou ou removeu o histórico da decisão';
  end if;

  insert into public.permutas_servico (tipo, status, solicitante_id, destinatario_id, motivo)
  values ('SUBSTITUICAO_SIMPLES', 'AGUARDANDO_ANALISE',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Motivo rollback')
  returning id into v_id_rollback;
  begin
    perform public.permutas_servico_decidir_v2(
      v_id_rollback, '10000000-0000-4000-8000-000000000003', true, false, 'não gravar', null, null
    );
    raise exception 'decisão sem conferência deveria falhar';
  exception when sqlstate '22023' then
    null;
  end;
  if (select status from public.permutas_servico where id = v_id_rollback) <> 'AGUARDANDO_ANALISE'
    or exists (select 1 from public.permutas_servico_historico where permuta_id = v_id_rollback and tipo_evento in ('DEFERIDA', 'INDEFERIDA')) then
    raise exception 'falha de validação não reverteu a decisão';
  end if;

  if not has_function_privilege('service_role', 'public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)', 'EXECUTE') then
    raise exception 'EXECUTE efetivo da RPC não está restrito a service_role';
  end if;
  select exists (
    select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    where p.oid = 'public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) into v_tem_public;
  if v_tem_public then raise exception 'PUBLIC possui EXECUTE direto na nova RPC'; end if;
  if not (select prosecdef from pg_catalog.pg_proc where oid = 'public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)'::regprocedure)
    or not ((select proconfig from pg_catalog.pg_proc where oid = 'public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)'::regprocedure)
      @> array['search_path=pg_catalog, pg_temp']) then
    raise exception 'SECURITY DEFINER ou search_path seguro ausente na nova RPC';
  end if;
end;
$$;

select 'Mensagens de decisão, histórico, cancelamento e ACL validados.' as resultado;
