\set ON_ERROR_STOP on
set role service_role;

do $$
declare
  v_id uuid;
  v_status text;
  v_func record;
begin
  -- Policial simples: os dois registram confirmação em chamadas separadas.
  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-01-01', 'A', '08:00', '16:00', 'Patrulhamento ostensivo'
  );
  if (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 0 then
    raise exception 'criação marcou confirmação sem manifestação individual';
  end if;
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000001');
  if v_status <> 'AGUARDANDO_CONFIRMACAO' then raise exception 'primeira confirmação avançou o estado'; end if;
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000002');
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'segunda confirmação não enviou para análise'; end if;
  begin
    perform public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000002');
    raise exception 'confirmação duplicada foi aceita';
  exception when serialization_failure then null;
  end;
  v_status := public.permutas_servico_decidir_v1(
    v_id, '10000000-0000-4000-8000-000000000003', true, 'Serviços conferidos e deferidos.', true
  );
  if v_status <> 'DEFERIDA' then raise exception 'deferimento falhou'; end if;
  v_status := public.permutas_servico_cancelar_v1(
    v_id, '10000000-0000-4000-8000-000000000003', 'Cancelada por necessidade administrativa.'
  );
  if v_status <> 'CANCELADA' then raise exception 'cancelamento de deferida falhou'; end if;
  if (select count(*) from public.permutas_servico_historico where permuta_id = v_id and tipo_evento = 'DEFERIDA') <> 1
     or (select count(*) from public.permutas_servico_historico where permuta_id = v_id and tipo_evento = 'CANCELADA') <> 1 then
    raise exception 'histórico não preservou deferimento e cancelamento';
  end if;
  if exists (
    select 1 from public.permutas_servico_historico
    where permuta_id = v_id and tipo_evento in ('DEFERIDA', 'CANCELADA')
      and (ator_id <> '10000000-0000-4000-8000-000000000003' or ocorrido_em is null)
  ) then raise exception 'auditoria não registrou ator/timestamp da decisão'; end if;
  perform public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-01-01', 'A', '08:00', '16:00', 'Novo registro após cancelamento'
  );

  -- Troca recíproca com dias diferentes, confirmação individual e dois serviços.
  v_id := public.permutas_servico_criar_v1(
    'TROCA_RECIPROCA',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-01-10', 'A', '06:00', '18:00', 'Serviço administrativo'
  );
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000001');
  if v_status <> 'AGUARDANDO_CONFIRMACAO' then raise exception 'troca avançou antes do segundo policial'; end if;
  v_status := public.permutas_servico_confirmar_v1(
    v_id, '10000000-0000-4000-8000-000000000002',
    '2027-01-13', 'B', '18:00', '06:00', 'Permanência noturna'
  );
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'troca recíproca completa não avançou'; end if;
  if (select count(*) from public.permutas_servico_manifestacoes where permuta_id = v_id) <> 2
     or (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 2 then
    raise exception 'troca recíproca não preservou duas manifestações/confirmações';
  end if;
  if (select min(data_servico) = max(data_servico) from public.permutas_servico_manifestacoes where permuta_id = v_id) then
    raise exception 'datas distintas da troca não foram preservadas';
  end if;
  if (select count(*) from public.permutas_servico_manifestacoes where permuta_id = v_id and origem_servico = 'informado' and referencia_origem is null) <> 2 then
    raise exception 'origem informada não ficou registrada';
  end if;
  perform public.permutas_servico_decidir_v1(
    v_id, '10000000-0000-4000-8000-000000000003', false, 'Serviços conferidos e indeferidos.', true
  );
  begin
    perform public.permutas_servico_cancelar_v1(v_id, '10000000-0000-4000-8000-000000000003', 'Tentativa inválida.');
    raise exception 'permuta indeferida pôde ser cancelada';
  exception when serialization_failure then null;
  end;

  -- Não permite análise nem cancelamento antes de deferimento/dupla confirmação.
  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006',
    '2027-02-01', 'B', '08:00', '12:00', 'Serviço de teste'
  );
  begin
    perform public.permutas_servico_decidir_v1(v_id, '10000000-0000-4000-8000-000000000003', true, 'Ainda pendente.', true);
    raise exception 'solicitação pendente foi decidida';
  exception when serialization_failure then null;
  end;
  begin
    perform public.permutas_servico_cancelar_v1(v_id, '10000000-0000-4000-8000-000000000003', 'Ainda pendente.');
    raise exception 'solicitação nunca deferida foi cancelada';
  exception when serialization_failure then null;
  end;

  -- Falha no segundo serviço recíproco reverte manifestação e confirmação parciais.
  v_id := public.permutas_servico_criar_v1(
    'TROCA_RECIPROCA',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-03-01', 'A', '08:00', '12:00', 'Primeiro serviço'
  );
  perform public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000001');
  begin
    perform public.permutas_servico_confirmar_v1(
      v_id, '10000000-0000-4000-8000-000000000002',
      '2027-03-01', 'A', '11:00', '15:00', 'Serviço conflitante'
    );
    raise exception 'serviço recíproco conflitante foi aceito';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.permutas_servico_manifestacoes where permuta_id = v_id) <> 1
     or (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 1
     or (select status from public.permutas_servico where id = v_id) <> 'AGUARDANDO_CONFIRMACAO' then
    raise exception 'falha deixou mutação parcial da confirmação';
  end if;

  -- Serviço noturno reserva até o dia seguinte; intervalos contíguos não conflitam.
  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '2027-04-01', 'B', '22:00', '06:00', 'Serviço noturno'
  );
  begin
    perform public.permutas_servico_criar_v1(
      'SUBSTITUICAO_SIMPLES',
      '10000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000005',
      '2027-04-02', 'A', '05:00', '07:00', 'Conflito após meia-noite'
    );
    raise exception 'sobreposição após meia-noite foi aceita';
  exception when unique_violation then null;
  end;
  perform public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000005',
    '2027-04-02', 'A', '06:00', '07:00', 'Horário contíguo sem sobreposição'
  );

  if not (select relrowsecurity from pg_class where oid = 'public.permutas_servico'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.permutas_servico_manifestacoes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.permutas_servico_confirmacoes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.permutas_servico_historico'::regclass) then
    raise exception 'RLS não está habilitada em todas as tabelas novas';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('permutas_servico', 'permutas_servico_manifestacoes', 'permutas_servico_confirmacoes', 'permutas_servico_historico')
  ) then raise exception 'migration criou policy não prevista'; end if;
  if has_table_privilege('anon', 'public.permutas_servico', 'SELECT')
     or has_table_privilege('authenticated', 'public.permutas_servico', 'SELECT')
     or not has_table_privilege('service_role', 'public.permutas_servico', 'SELECT') then
    raise exception 'grants de tabela não correspondem a backend-only';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'permutas_servico_bloquear_policial_v1', 'permutas_servico_conflito_v1',
        'permutas_servico_criar_v1', 'permutas_servico_confirmar_v1',
        'permutas_servico_decidir_v1', 'permutas_servico_cancelar_v1'
      )) <> 6 then
    raise exception 'esperava exatamente as seis funções SECURITY DEFINER da migration';
  end if;
  if to_regprocedure('public.permutas_servico_bloquear_policial_v1(uuid[])') is null
     or to_regprocedure('public.permutas_servico_conflito_v1(uuid,date,time,time)') is null
     or to_regprocedure('public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)') is null
     or to_regprocedure('public.permutas_servico_confirmar_v1(uuid,uuid,date,text,time,time,text)') is null
     or to_regprocedure('public.permutas_servico_decidir_v1(uuid,uuid,boolean,text,boolean)') is null
     or to_regprocedure('public.permutas_servico_cancelar_v1(uuid,uuid,text)') is null then
    raise exception 'assinatura de função/RPC não corresponde à migration';
  end if;
  for v_func in
    select p.oid, p.proname,
      p.proname in (
        'permutas_servico_criar_v1', 'permutas_servico_confirmar_v1',
        'permutas_servico_decidir_v1', 'permutas_servico_cancelar_v1'
      ) as service_role_deve_executar,
      p.prosecdef,
      p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'permutas_servico_bloquear_policial_v1', 'permutas_servico_conflito_v1',
      'permutas_servico_criar_v1', 'permutas_servico_confirmar_v1',
      'permutas_servico_decidir_v1', 'permutas_servico_cancelar_v1'
    )
  loop
    if not v_func.prosecdef then
      raise exception 'função % não está SECURITY DEFINER', v_func.proname;
    end if;
    if exists (
      select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where p.oid=v_func.oid and acl.grantee=0 and acl.privilege_type='EXECUTE'
    ) then
      raise exception 'PUBLIC herdou EXECUTE na função %', v_func.proname;
    end if;
    if has_function_privilege('anon', v_func.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_func.oid, 'EXECUTE') then
      raise exception 'anon/authenticated têm EXECUTE efetivo na função %', v_func.proname;
    end if;
    if has_function_privilege('service_role', v_func.oid, 'EXECUTE') is distinct from v_func.service_role_deve_executar then
      raise exception 'EXECUTE de service_role incorreto na função %', v_func.proname;
    end if;
    if not coalesce(v_func.proconfig @> array['search_path=pg_catalog, pg_temp'], false) then
      raise exception 'search_path inseguro/inesperado na função %: %', v_func.proname, v_func.proconfig;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)', 'EXECUTE') then
    raise exception 'grants efetivos da RPC de criação não correspondem a backend-only';
  end if;
  if pg_get_function_identity_arguments('public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)'::regprocedure)
      <> 'p_tipo text, p_solicitante_id uuid, p_destinatario_id uuid, p_data date, p_turno text, p_inicio time without time zone, p_fim time without time zone, p_descricao text' then
    raise exception 'assinatura da RPC de criação mudou';
  end if;
  if (select proargnames from pg_proc where oid = 'public.permutas_servico_confirmar_v1(uuid,uuid,date,text,time,time,text)'::regprocedure)
      <> array['p_permuta_id','p_ator_id','p_data','p_turno','p_inicio','p_fim','p_descricao']
     or (select proargnames from pg_proc where oid = 'public.permutas_servico_decidir_v1(uuid,uuid,boolean,text,boolean)'::regprocedure)
      <> array['p_permuta_id','p_ator_id','p_deferir','p_justificativa','p_servicos_conferidos']
     or (select proargnames from pg_proc where oid = 'public.permutas_servico_cancelar_v1(uuid,uuid,text)'::regprocedure)
      <> array['p_permuta_id','p_ator_id','p_justificativa'] then
    raise exception 'argumentos nomeados de uma RPC não correspondem ao backend';
  end if;
  if exists (
    select 1
    from pg_constraint fk
    join lateral unnest(fk.conkey, fk.confkey) with ordinality as cols(local_att, ref_att, ordinality) on true
    join pg_attribute local_col on local_col.attrelid = fk.conrelid and local_col.attnum = cols.local_att
    join pg_attribute ref_col on ref_col.attrelid = fk.confrelid and ref_col.attnum = cols.ref_att
    where fk.contype = 'f'
      and fk.conrelid in (
        'public.permutas_servico'::regclass,
        'public.permutas_servico_manifestacoes'::regclass,
        'public.permutas_servico_confirmacoes'::regclass,
        'public.permutas_servico_historico'::regclass
      )
      and (local_col.atttypid <> 'uuid'::regtype or ref_col.atttypid <> 'uuid'::regtype)
  ) then raise exception 'foreign key encontrada com tipo diferente de UUID'; end if;
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'policiais' and c.column_name = 'id'
      and c.data_type <> 'uuid'
  ) then raise exception 'policiais.id não é UUID na fixture'; end if;
  if not has_sequence_privilege('service_role', 'public.permutas_servico_historico_id_seq', 'USAGE') then
    raise exception 'service_role sem USAGE na sequence do histórico';
  end if;
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid in (
      'public.permutas_servico'::regclass,
      'public.permutas_servico_manifestacoes'::regclass,
      'public.permutas_servico_confirmacoes'::regclass,
      'public.permutas_servico_historico'::regclass
    ) and not t.tgisinternal
  ) then raise exception 'migration criou trigger não esperado'; end if;
end;
$$;

reset role;
