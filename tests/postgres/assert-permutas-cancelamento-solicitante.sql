\set ON_ERROR_STOP on
set role service_role;

do $$
declare
  v_pendente uuid;
  v_analise uuid;
  v_deferida uuid;
  v_status text;
begin
  v_pendente := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '2028-03-10', 'A', '08:00', '16:00', 'Cancelamento antes da confirmação', 'Teste cancelamento solicitante'
  );
  v_status := public.permutas_servico_cancelar_v1(
    v_pendente, '10000000-0000-4000-8000-000000000001', null
  );
  if v_status <> 'CANCELADA' then raise exception 'solicitante não cancelou solicitação pendente'; end if;

  v_analise := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000006',
    '2028-03-11', 'B', '08:00', '16:00', 'Cancelamento em análise', 'Teste cancelamento em análise'
  );
  v_status := public.permutas_servico_confirmar_v1(
    v_analise, '10000000-0000-4000-8000-000000000006', null, null, null, null, null
  );
  if v_status <> 'AGUARDANDO_ANALISE' then raise exception 'fixture não chegou à análise'; end if;
  v_status := public.permutas_servico_cancelar_v1(
    v_analise, '10000000-0000-4000-8000-000000000005', 'Solicitação não será mais necessária'
  );
  if v_status <> 'CANCELADA' then raise exception 'solicitante não cancelou solicitação em análise'; end if;

  v_deferida := public.permutas_servico_criar_v1(
    'SUBSTITUICAO_SIMPLES',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000006',
    '2028-03-12', 'C', '08:00', '16:00', 'Cancelamento administrativo', 'Teste trilha de decisão'
  );
  v_status := public.permutas_servico_confirmar_v1(
    v_deferida, '10000000-0000-4000-8000-000000000006', null, null, null, null, null
  );
  v_status := public.permutas_servico_decidir_v2(
    v_deferida, '10000000-0000-4000-8000-000000000003', true, true, null, null, null
  );
  if v_status <> 'DEFERIDA' then raise exception 'fixture não foi deferida'; end if;
  v_status := public.permutas_servico_cancelar_v1(
    v_deferida, '10000000-0000-4000-8000-000000000003', 'Ajuste operacional'
  );
  if v_status <> 'CANCELADA' then raise exception 'cancelamento administrativo deferido falhou'; end if;

  if exists (
    select 1 from public.permutas_servico p
    where p.id in (v_pendente, v_analise, v_deferida) and p.status <> 'CANCELADA'
  ) then raise exception 'alguma solicitação não terminou cancelada'; end if;
  if not exists (
    select 1 from public.permutas_servico_historico h
    where h.permuta_id = v_pendente and h.tipo_evento = 'CANCELADA'
      and h.ator_id = '10000000-0000-4000-8000-000000000001' and h.ocorrido_em is not null
      and h.justificativa is null
  ) then raise exception 'cancelamento do solicitante não preservou autor/horário ou motivo opcional'; end if;
  if not exists (
    select 1 from public.notificacoes_internas n
    where n.permuta_id = v_pendente and n.tipo = 'PERMUTA_CANCELADA'
      and n.destinatario_id = '10000000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.notificacoes_internas n
    where n.permuta_id = v_pendente and n.tipo = 'PERMUTA_CANCELADA'
      and n.destinatario_id = '10000000-0000-4000-8000-000000000001'
  ) then raise exception 'aviso de cancelamento pendente foi enviado a destinatário incorreto'; end if;
  if not exists (
    select 1 from public.notificacoes_internas n
    where n.permuta_id = v_analise and n.tipo = 'PERMUTA_CANCELADA'
      and n.destinatario_id = '10000000-0000-4000-8000-000000000006'
  ) or not exists (
    select 1 from public.notificacoes_internas n
    where n.permuta_id = v_analise and n.tipo = 'PERMUTA_CANCELADA'
      and n.destinatario_id = '10000000-0000-4000-8000-000000000003'
  ) then raise exception 'cancelamento em análise não notificou contraparte e Oficial'; end if;
  if exists (
    select 1 from public.notificacoes_internas n
    where n.permuta_id = v_analise and n.tipo in ('PERMUTA_RECEBIDA', 'PERMUTA_AGUARDANDO_ANALISE')
      and n.lida_em is null
  ) then raise exception 'notificação anterior permaneceu pendente após cancelamento'; end if;
  if (select count(*) from public.permutas_servico_historico h
      where h.permuta_id = v_deferida and h.tipo_evento in ('DEFERIDA', 'CANCELADA')) <> 2
    or not exists (select 1 from public.permutas_servico_historico h
      where h.permuta_id = v_deferida and h.tipo_evento = 'DEFERIDA' and h.ator_id = '10000000-0000-4000-8000-000000000003')
    or not exists (select 1 from public.permutas_servico_historico h
      where h.permuta_id = v_deferida and h.tipo_evento = 'CANCELADA' and h.ator_id = '10000000-0000-4000-8000-000000000003') then
    raise exception 'histórico de deferimento e cancelamento não foi preservado';
  end if;
  begin
    perform public.permutas_servico_cancelar_v1(
      v_deferida, '10000000-0000-4000-8000-000000000005', 'Tentativa alheia'
    );
    raise exception 'policial não participante cancelou a permuta';
  exception when sqlstate '40001' then null;
  end;
end;
$$;

reset role;
select 'cancelamento por solicitante, transições, avisos e trilha auditável: OK' as resultado;
