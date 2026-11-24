do $$
declare
  v_permuta_deferida uuid;
  v_permuta_indeferida uuid;
  v_status text;
  v_quantidade integer;
  v_config text[];
begin
  if not pg_catalog.has_table_privilege('service_role', 'public.notificacoes_internas', 'SELECT')
    or pg_catalog.has_table_privilege('anon', 'public.notificacoes_internas', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.notificacoes_internas', 'SELECT')
    or pg_catalog.has_table_privilege('public', 'public.notificacoes_internas', 'SELECT') then
    raise exception 'leitura direta das notificações não está restrita ao service_role';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.notificacoes_internas', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.notificacoes_internas', 'UPDATE')
    or pg_catalog.has_column_privilege('anon', 'public.notificacoes_internas', 'lida_em', 'UPDATE')
    or pg_catalog.has_column_privilege('authenticated', 'public.notificacoes_internas', 'lida_em', 'UPDATE') then
    raise exception 'usuários anon/authenticated podem alterar notificações diretamente';
  end if;
  if not pg_catalog.has_column_privilege('service_role', 'public.notificacoes_internas', 'lida_em', 'UPDATE')
    or pg_catalog.has_table_privilege('service_role', 'public.notificacoes_internas', 'INSERT')
    or pg_catalog.has_table_privilege('service_role', 'public.notificacoes_internas', 'DELETE') then
    raise exception 'service_role recebeu escrita além da marcação de leitura';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.notificacoes_internas'::regclass) then
    raise exception 'RLS não está habilitado na tabela de notificações';
  end if;
  if pg_catalog.has_function_privilege('service_role', 'public.permutas_servico_notificar_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.permutas_servico_notificar_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.permutas_servico_notificar_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.permutas_servico_notificar_mensagem_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.permutas_servico_notificar_mensagem_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', 'public.permutas_servico_notificar_mensagem_v1()', 'EXECUTE') then
    raise exception 'funções internas de trigger estão invocáveis como RPC';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc where oid = 'public.permutas_servico_notificar_v1()'::regprocedure and prosecdef)
    or not exists (select 1 from pg_catalog.pg_proc where oid = 'public.permutas_servico_notificar_mensagem_v1()'::regprocedure and prosecdef) then
    raise exception 'funções dos triggers não usam SECURITY DEFINER';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc where oid = 'public.permutas_servico_notificar_v1()'::regprocedure and proconfig @> array['search_path=pg_catalog, pg_temp'])
    or not exists (select 1 from pg_catalog.pg_proc where oid = 'public.permutas_servico_notificar_mensagem_v1()'::regprocedure and proconfig @> array['search_path=pg_catalog, pg_temp']) then
    raise exception 'search_path seguro ausente nas funções SECURITY DEFINER de eventos';
  end if;
  if (select count(*) from pg_catalog.pg_trigger
      where tgrelid in ('public.permutas_servico'::regclass, 'public.permutas_servico_historico'::regclass)
        and tgname in ('permutas_servico_notificar_criacao_v1', 'permutas_servico_notificar_transicao_v1', 'permutas_servico_notificar_mensagem_v1')
        and not tgisinternal) <> 3 then
    raise exception 'triggers de criação, transição e mensagens não estão instalados';
  end if;
end;
$$;

set role service_role;
do $$
declare
  v_permuta_deferida uuid;
  v_permuta_indeferida uuid;
  v_status text;
begin
  v_permuta_deferida := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-06-01', 'A', '08:00', '16:00', 'Serviço informado', 'Teste de notificação'
  );
  if (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_RECEBIDA'
        and destinatario_id = '10000000-0000-4000-8000-000000000002') <> 1
    or exists (select 1 from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_RECEBIDA'
        and destinatario_id <> '10000000-0000-4000-8000-000000000002') then
    raise exception 'criação não notificou somente o policial indicado';
  end if;

  v_status := public.permutas_servico_confirmar_v1(
    v_permuta_deferida, '10000000-0000-4000-8000-000000000002',
    null, null, null, null, null
  );
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'confirmação não avançou para análise'; end if;
  if (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_AGUARDANDO_ANALISE'
        and destinatario_id in ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007')) <> 2
    or exists (select 1 from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_AGUARDANDO_ANALISE'
        and destinatario_id = '10000000-0000-4000-8000-000000000004') then
    raise exception 'pendência administrativa não notificou Oficial/Master de forma correta';
  end if;

  v_status := public.permutas_servico_decidir_v2(
    v_permuta_deferida, '10000000-0000-4000-8000-000000000003', true, true,
    'Mensagem reservada ao escalante', 'Mensagem reservada ao solicitante', 'Mensagem reservada ao destinatário'
  );
  if v_status <> 'DEFERIDA' then raise exception 'deferimento de teste falhou'; end if;
  if (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_DEFERIDA') <> 4
    or (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_DEFERIDA'
        and mensagem_disponivel) <> 4
    or (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_DEFERIDA'
        and destinatario_id = '10000000-0000-4000-8000-000000000007') <> 1 then
    raise exception 'decisão não notificou envolvidos/P1/Master, ou perdeu a indicação de mensagem privada';
  end if;
  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notificacoes_internas'
      and column_name in ('mensagem_escalante', 'mensagem_policial_1', 'mensagem_policial_2')) then
    raise exception 'conteúdo das mensagens privadas foi duplicado na tabela de notificações';
  end if;

  v_status := public.permutas_servico_cancelar_v1(
    v_permuta_deferida, '10000000-0000-4000-8000-000000000003', 'Cancelamento de teste'
  );
  if v_status <> 'CANCELADA'
    or (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_deferida and tipo = 'PERMUTA_CANCELADA') <> 4 then
    raise exception 'cancelamento não gerou notificações para os destinatários previstos';
  end if;

  v_permuta_indeferida := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006',
    '2027-06-02', 'B', '08:00', '16:00', 'Outro serviço', 'Teste de indeferimento'
  );
  v_status := public.permutas_servico_confirmar_v1(
    v_permuta_indeferida, '10000000-0000-4000-8000-000000000006', null, null, null, null, null
  );
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'confirmação para indeferimento falhou'; end if;
  v_status := public.permutas_servico_decidir_v2(
    v_permuta_indeferida, '10000000-0000-4000-8000-000000000003', false, true, null, null, null
  );
  if v_status <> 'INDEFERIDA'
    or (select count(*) from public.notificacoes_internas
      where permuta_id = v_permuta_indeferida and tipo = 'PERMUTA_INDEFERIDA') <> 4
    or exists (select 1 from public.notificacoes_internas
      where permuta_id = v_permuta_indeferida and tipo = 'PERMUTA_INDEFERIDA' and mensagem_disponivel) then
    raise exception 'indeferimento sem mensagem gerou aviso incorreto';
  end if;

  begin
    perform public.permutas_servico_cancelar_v1(
      v_permuta_indeferida, '10000000-0000-4000-8000-000000000003', 'Transição inválida'
    );
    raise exception 'cancelamento de indeferida deveria ser recusado';
  exception when sqlstate '40001' then
    null;
  end;
  if exists (select 1 from public.notificacoes_internas
      where permuta_id = v_permuta_indeferida and tipo = 'PERMUTA_CANCELADA') then
    raise exception 'operação fracassada gerou notificação';
  end if;
end;
$$;
reset role;

select 'Destinatários, mensagem privada sinalizada sem conteúdo, transições, permissões e isolamento verificados.' as resultado;
