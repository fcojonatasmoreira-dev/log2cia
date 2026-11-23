\set ON_ERROR_STOP on
set role service_role;

do $$
declare
  v_id uuid;
  v_status text;
  v_assinatura text := 'public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text,text)';
begin
  if to_regprocedure(v_assinatura) is null
     or to_regprocedure('public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)') is not null then
    raise exception 'assinatura nova da RPC não substituiu a antiga';
  end if;
  if not has_function_privilege('service_role', v_assinatura, 'EXECUTE')
     or has_function_privilege('anon', v_assinatura, 'EXECUTE')
     or has_function_privilege('authenticated', v_assinatura, 'EXECUTE') then
    raise exception 'grants da RPC de criação com motivo estão incorretos';
  end if;
  if exists (
    select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_assinatura::regprocedure and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'PUBLIC recebeu EXECUTE na nova RPC'; end if;
  if not (select prosecdef from pg_proc where oid = v_assinatura::regprocedure)
     or not ((select proconfig from pg_proc where oid = v_assinatura::regprocedure) @> array['search_path=pg_catalog, pg_temp']) then
    raise exception 'SECURITY DEFINER ou search_path da RPC nova não foram preservados';
  end if;
  if pg_get_function_identity_arguments(v_assinatura::regprocedure)
      <> 'p_tipo text, p_solicitante_id uuid, p_destinatario_id uuid, p_data date, p_turno text, p_inicio time without time zone, p_fim time without time zone, p_descricao text, p_motivo text' then
    raise exception 'nomes ou tipos dos argumentos da RPC não correspondem ao backend';
  end if;

  begin
    perform public.permutas_servico_criar_v1(
      'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002', '2027-10-01', 'A',
      '08:00', '16:00', 'Serviço', '   '
    );
    raise exception 'motivo vazio foi aceito';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.permutas_servico_criar_v1(
      'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002', '2027-10-01', 'A',
      '08:00', '16:00', 'Serviço', repeat('x', 501)
    );
    raise exception 'motivo acima de 500 caracteres foi aceito';
  exception when invalid_parameter_value then null;
  end;
  perform public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', '2027-10-03', 'A',
    '08:00', '16:00', 'Serviço Unicode', repeat('😀', 500)
  );
  begin
    perform public.permutas_servico_criar_v1(
      'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002', '2027-10-04', 'A',
      '08:00', '16:00', 'Serviço Unicode', repeat('😀', 501)
    );
    raise exception 'motivo Unicode acima de 500 caracteres foi aceito';
  exception when invalid_parameter_value then null;
  end;

  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', '2027-10-01', 'A',
    '08:00', '16:00', 'Serviço', 'Motivo original da solicitação'
  );
  if (select motivo from public.permutas_servico where id = v_id) <> 'Motivo original da solicitação' then
    raise exception 'motivo não foi persistido junto à permuta';
  end if;
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000001');
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000002');
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'confirmações não avançaram a solicitação'; end if;
  v_status := public.permutas_servico_decidir_v1(
    v_id, '10000000-0000-4000-8000-000000000003', true, 'Serviços conferidos.', true
  );
  if v_status <> 'DEFERIDA' or (select motivo from public.permutas_servico where id = v_id) <> 'Motivo original da solicitação' then
    raise exception 'motivo foi alterado ou perdido após deferimento';
  end if;
  v_status := public.permutas_servico_cancelar_v1(
    v_id, '10000000-0000-4000-8000-000000000003', 'Cancelamento de teste'
  );
  if v_status <> 'CANCELADA' or (select motivo from public.permutas_servico where id = v_id) <> 'Motivo original da solicitação' then
    raise exception 'motivo foi alterado ou perdido após cancelamento';
  end if;

  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES', '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005', '2027-10-02', 'B',
    '08:00', '16:00', 'Serviço para indeferimento', 'Motivo que deve permanecer no indeferimento'
  );
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000004');
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000005');
  v_status := public.permutas_servico_decidir_v1(
    v_id, '10000000-0000-4000-8000-000000000003', false, 'Justificativa de indeferimento', true
  );
  if v_status <> 'INDEFERIDA'
     or (select motivo from public.permutas_servico where id = v_id) <> 'Motivo que deve permanecer no indeferimento' then
    raise exception 'motivo foi alterado ou perdido após indeferimento';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permutas_servico'::regclass
      and conname = 'permutas_servico_motivo_length_check'
  ) then raise exception 'constraint de tamanho do motivo ausente'; end if;
end;
$$;

reset role;
