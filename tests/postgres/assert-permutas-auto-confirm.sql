\set ON_ERROR_STOP on
set role service_role;

do $$
declare
  v_id uuid;
  v_status text;
  v_solicitante_em timestamptz;
begin
  v_id := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-11-10', 'A', '08:00', '16:00', 'Serviço simples', 'Concordância registrada na criação'
  );
  if (select status from public.permutas_servico where id = v_id) <> 'AGUARDANDO_CONFIRMACAO' then
    raise exception 'a criação simples avançou antes da confirmação do destinatário';
  end if;
  if (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 1
    or not exists (
      select 1 from public.permutas_servico_confirmacoes
      where permuta_id = v_id and policial_id = '10000000-0000-4000-8000-000000000001' and confirmada_em is not null
    ) then
    raise exception 'a criação não registrou a concordância do solicitante com ID e horário';
  end if;
  select confirmada_em into v_solicitante_em
  from public.permutas_servico_confirmacoes
  where permuta_id = v_id and policial_id = '10000000-0000-4000-8000-000000000001';
  if not exists (
    select 1 from public.permutas_servico_historico
    where permuta_id = v_id and tipo_evento = 'CRIADA' and ator_id = '10000000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from public.permutas_servico_historico
    where permuta_id = v_id and tipo_evento = 'CONFIRMADA'
      and ator_id = '10000000-0000-4000-8000-000000000001'
      and ocorrido_em = v_solicitante_em
      and estado_anterior = 'AGUARDANDO_CONFIRMACAO'
      and estado_novo = 'AGUARDANDO_CONFIRMACAO'
  ) then
    raise exception 'histórico não preservou criação e concordância automática do solicitante';
  end if;
  begin
    perform public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000001');
    raise exception 'solicitante pôde confirmar duas vezes';
  exception when unique_violation then null;
  end;
  v_status := public.permutas_servico_confirmar_v1(v_id, '10000000-0000-4000-8000-000000000002');
  if v_status <> 'AGUARDANDO_ANALISE'
    or (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 2
    or not exists (
      select 1 from public.permutas_servico_confirmacoes
      where permuta_id = v_id and policial_id = '10000000-0000-4000-8000-000000000002'
    ) then
    raise exception 'a confirmação do destinatário não concluiu a substituição simples';
  end if;

  v_id := public.permutas_servico_criar_v1(
    'TROCA_RECIPROCA',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2027-12-31', 'B', '22:00', '06:00', 'Serviço noturno do solicitante', 'Troca recíproca em datas distintas'
  );
  v_status := public.permutas_servico_confirmar_v1(
    v_id, '10000000-0000-4000-8000-000000000002',
    '2028-01-02', 'A', '18:00', '06:00', 'Serviço noturno do destinatário'
  );
  if v_status <> 'AGUARDANDO_ANALISE'
    or (select count(*) from public.permutas_servico_manifestacoes where permuta_id = v_id) <> 2
    or (select count(*) from public.permutas_servico_confirmacoes where permuta_id = v_id) <> 2
    or (select count(distinct data_servico) from public.permutas_servico_manifestacoes where permuta_id = v_id) <> 2
    or not exists (
      select 1 from public.permutas_servico_manifestacoes
      where permuta_id = v_id and policial_id = '10000000-0000-4000-8000-000000000002'
        and substituto_id = '10000000-0000-4000-8000-000000000001'
        and data_servico = '2028-01-02' and horario_fim < horario_inicio
    ) then
    raise exception 'a confirmação recíproca não registrou o serviço do destinatário ou não avançou corretamente';
  end if;
end;
$$;

reset role;
