set role service_role;
do $$
declare
  v_id uuid;
  v_reciproca uuid;
  v_conflito uuid;
  v_status text;
  v_versao timestamptz;
  v_evento public.permutas_servico_historico%rowtype;
  v_permuta public.permutas_servico%rowtype;
begin
  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', '2027-07-02', 'A', '08:00', '16:00', 'Serviço original', 'Motivo original'
  );
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000002', null, null, null, null, null);
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'confirmação original não chegou à análise'; end if;

  select atualizada_em into v_versao from public.permutas_servico where id = v_id;
  v_status := public.permutas_servico_editar_v1(
    v_id, '10000000-0000-4000-8000-000000000001', v_versao, '10000000-0000-4000-8000-000000000005',
    'Motivo alterado', '2027-07-03', 'B', '20:00', '04:00', 'Serviço corrigido'
  );
  if v_status <> 'AGUARDANDO_CONFIRMACAO' then raise exception 'edição não reiniciou a confirmação'; end if;
  select * into v_permuta from public.permutas_servico where id = v_id;
  if v_permuta.destinatario_id <> '10000000-0000-4000-8000-000000000005'
    or v_permuta.motivo <> 'Motivo alterado'
    or v_permuta.status <> 'AGUARDANDO_CONFIRMACAO' then raise exception 'dados editados não foram persistidos'; end if;
  begin
    perform public.permutas_servico_editar_v1(
      v_id, '10000000-0000-4000-8000-000000000001', v_versao, '10000000-0000-4000-8000-000000000006',
      'Versão antiga', '2027-07-04', 'A', '08:00', '16:00', 'Não deve sobrescrever'
    );
    raise exception 'edição concorrente com versão obsoleta foi aceita';
  exception when sqlstate '40001' then null;
  end;
  if (select destinatario_id from public.permutas_servico where id = v_id) <> '10000000-0000-4000-8000-000000000005' then
    raise exception 'versão obsoleta sobrescreveu o destinatário atualizado';
  end if;
  if (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 1
    or not exists (select 1 from public.permutas_servico_confirmacoes where permuta_id = v_id and policial_id = '10000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.permutas_servico_confirmacoes where permuta_id = v_id and policial_id <> '10000000-0000-4000-8000-000000000001') then
    raise exception 'confirmações antigas não foram invalidadas';
  end if;
  if exists (select 1 from public.notificacoes_internas where permuta_id = v_id and destinatario_id = '10000000-0000-4000-8000-000000000002' and lida_em is null)
    or not exists (select 1 from public.notificacoes_internas where permuta_id = v_id and destinatario_id = '10000000-0000-4000-8000-000000000005' and tipo = 'PERMUTA_RECEBIDA' and lida_em is null) then
    raise exception 'aviso do participante antigo/nova confirmação não foi atualizado';
  end if;
  select * into v_evento from public.permutas_servico_historico where permuta_id = v_id and tipo_evento = 'EDITADA';
  if v_evento.ator_id <> '10000000-0000-4000-8000-000000000001'
    or v_evento.ocorrido_em is null
    or v_evento.detalhes_alteracao->'antes'->>'motivo' <> 'Motivo original'
    or v_evento.detalhes_alteracao->'depois'->>'motivo' <> 'Motivo alterado'
    or v_evento.detalhes_alteracao->'antes'->>'destinatario_id' <> '10000000-0000-4000-8000-000000000002'
    or v_evento.detalhes_alteracao->'depois'->>'destinatario_id' <> '10000000-0000-4000-8000-000000000005' then
    raise exception 'auditoria da edição está incompleta';
  end if;

  begin
    perform public.permutas_servico_editar_v1(
      v_id, '10000000-0000-4000-8000-000000000002', v_versao, '10000000-0000-4000-8000-000000000006',
      'Tentativa alheia', '2027-07-04', 'A', '08:00', '16:00', 'Serviço'
    );
    raise exception 'edição por participante que não é solicitante foi aceita';
  exception when sqlstate '42501' then null;
  end;
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000005', null, null, null, null, null);
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'novo destinatário não conseguiu confirmar'; end if;
  update public.notificacoes_internas set lida_em = clock_timestamp()
  where permuta_id = v_id and tipo = 'PERMUTA_AGUARDANDO_ANALISE';
  select atualizada_em into v_versao from public.permutas_servico where id = v_id;
  perform public.permutas_servico_editar_v1(
    v_id, '10000000-0000-4000-8000-000000000001', v_versao, '10000000-0000-4000-8000-000000000005',
    'Segundo ajuste', '2027-07-03', 'B', '20:00', '04:00', 'Serviço corrigido novamente'
  );
  if (select status from public.permutas_servico where id = v_id) <> 'AGUARDANDO_CONFIRMACAO' then
    raise exception 'segunda edição não reabriu confirmação';
  end if;
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000005', null, null, null, null, null);
  if v_status <> 'AGUARDANDO_ANALISE'
    or (select lida_em from public.notificacoes_internas where permuta_id = v_id and destinatario_id = '10000000-0000-4000-8000-000000000003' and tipo = 'PERMUTA_AGUARDANDO_ANALISE') is not null then
    raise exception 'nova análise não reativou a notificação lida';
  end if;
  v_status := public.permutas_servico_decidir_v2(v_id, '10000000-0000-4000-8000-000000000003', true, true, null, null, null);
  if v_status <> 'DEFERIDA' then raise exception 'deferimento de edição falhou'; end if;
  begin
    select atualizada_em into v_versao from public.permutas_servico where id = v_id;
    perform public.permutas_servico_editar_v1(
      v_id, '10000000-0000-4000-8000-000000000001', v_versao, '10000000-0000-4000-8000-000000000005',
      'Tentativa após decisão', '2027-07-04', 'A', '08:00', '16:00', 'Serviço'
    );
    raise exception 'edição após deferimento foi aceita';
  exception when sqlstate '40001' then null;
  end;
  if (select status from public.permutas_servico where id = v_id) <> 'DEFERIDA' then raise exception 'estado deferido foi alterado'; end if;

  v_reciproca := public.permutas_servico_criar_v1(
    'TROCA_RECIPROCA', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000005', '2027-08-01', 'A', '08:00', '16:00', 'Serviço 1', 'Motivo recíproco'
  );
  v_status := public.permutas_servico_confirmar_v1(v_reciproca, '10000000-0000-4000-8000-000000000005', '2027-08-05', 'B', '18:00', '06:00', 'Serviço do destinatário');
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'troca recíproca não chegou à análise'; end if;
  select atualizada_em into v_versao from public.permutas_servico where id = v_reciproca;
  v_status := public.permutas_servico_editar_v1(
    v_reciproca, '10000000-0000-4000-8000-000000000001', v_versao, '10000000-0000-4000-8000-000000000006',
    'Motivo recíproco alterado', '2027-08-02', 'C', '08:00', '16:00', 'Serviço 1 alterado'
  );
  if v_status <> 'AGUARDANDO_CONFIRMACAO'
    or (select count(*) from public.permutas_servico_manifestacoes where permuta_id = v_reciproca) <> 1 then
    raise exception 'mudança do destinatário manteve serviço do antigo participante';
  end if;
  v_status := public.permutas_servico_confirmar_v1(v_reciproca, '10000000-0000-4000-8000-000000000006', '2027-08-07', 'D', '18:00', '06:00', 'Novo serviço recíproco');
  if v_status <> 'AGUARDANDO_ANALISE'
    or (select count(*) from public.permutas_servico_manifestacoes where permuta_id = v_reciproca) <> 2
    or not exists (select 1 from public.permutas_servico_manifestacoes where permuta_id = v_reciproca and policial_id = '10000000-0000-4000-8000-000000000006' and substituto_id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'novo participante não registrou o próprio serviço recíproco';
  end if;

  v_conflito := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006', '2027-09-01', 'A', '08:00', '16:00', 'Reserva', 'Conflito'
  );
  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', '2027-09-02', 'B', '08:00', '16:00', 'Serviço a editar', 'Motivo'
  );
  select atualizada_em into v_versao from public.permutas_servico where id = v_id;
  begin
    perform public.permutas_servico_editar_v1(
      v_id, '10000000-0000-4000-8000-000000000001', v_versao, '10000000-0000-4000-8000-000000000005',
      'Motivo conflito', '2027-09-01', 'C', '10:00', '12:00', 'Sobreposição'
    );
    raise exception 'edição com conflito de horário foi aceita';
  exception when sqlstate '23505' then null;
  end;
  if (select status from public.permutas_servico where id = v_id) <> 'AGUARDANDO_CONFIRMACAO'
    or (select destinatario_id from public.permutas_servico where id = v_id) <> '10000000-0000-4000-8000-000000000002' then
    raise exception 'conflito deixou alterações parciais';
  end if;
  if v_conflito is null then raise exception 'fixture de conflito não foi criada'; end if;

  if not has_function_privilege('service_role', 'public.permutas_servico_editar_v1(uuid,uuid,timestamptz,uuid,text,date,text,time without time zone,time without time zone,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.permutas_servico_editar_v1(uuid,uuid,timestamptz,uuid,text,date,text,time without time zone,time without time zone,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.permutas_servico_editar_v1(uuid,uuid,timestamptz,uuid,text,date,text,time without time zone,time without time zone,text)', 'EXECUTE') then
    raise exception 'EXECUTE da RPC de edição não está restrito';
  end if;
end;
$$;
reset role;

select 'Edição simples e recíproca, novas confirmações, bloqueios, notificações, auditoria e privilégios verificados.' as resultado;
