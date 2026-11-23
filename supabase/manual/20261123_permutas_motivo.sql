-- Permutas de Serviço — motivo obrigatório na solicitação.
-- Aplicar manualmente somente depois de confirmar que a migration base está instalada.
-- Esta migration não é executada automaticamente pelo aplicativo.

begin;

do $$
declare
  v_tipo text;
  v_definicao text;
begin
  select data_type into v_tipo
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'permutas_servico'
    and column_name = 'motivo';

  if v_tipo is null then
    alter table public.permutas_servico add column motivo text;
  elsif v_tipo <> 'text' then
    raise exception 'public.permutas_servico.motivo existe com tipo %, esperado text', v_tipo;
  end if;

  select pg_get_constraintdef(oid) into v_definicao
  from pg_constraint
  where conrelid = 'public.permutas_servico'::regclass
    and conname = 'permutas_servico_motivo_length_check';

  if v_definicao is null then
    alter table public.permutas_servico
      add constraint permutas_servico_motivo_length_check
      check (motivo is null or length(btrim(motivo)) between 1 and 500) not valid;
  elsif v_definicao not ilike '%motivo IS NULL%' or v_definicao not ilike '%500%' then
    raise exception 'Constraint permutas_servico_motivo_length_check existe com definição inesperada: %', v_definicao;
  end if;
end
$$;

comment on column public.permutas_servico.motivo is
  'Motivo informado pelos participantes; NULL somente para solicitações anteriores à versão que passou a exigir o campo.';

-- A troca de assinatura e o ajuste da ACL são atômicos. A versão antiga deixa
-- de aceitar criação sem motivo; o backend novo chama a assinatura de 9 args.
drop function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text);

create function public.permutas_servico_criar_v1(
  p_tipo text, p_solicitante_id uuid, p_destinatario_id uuid,
  p_data date, p_turno text, p_inicio time, p_fim time,
  p_descricao text, p_motivo text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_tipo not in ('SUBSTITUICAO_SIMPLES', 'TROCA_RECIPROCA')
    or p_solicitante_id is null or p_destinatario_id is null
    or p_solicitante_id = p_destinatario_id or p_data is null
    or length(btrim(coalesce(p_turno, ''))) not between 1 and 80
    or p_inicio is null or p_fim is null or p_inicio = p_fim
    or length(btrim(coalesce(p_descricao, ''))) not between 1 and 500
    or length(btrim(coalesce(p_motivo, ''))) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Dados da permuta inválidos.';
  end if;
  perform public.permutas_servico_bloquear_policial_v1(array[p_solicitante_id, p_destinatario_id]);
  if public.permutas_servico_conflito_v1(p_solicitante_id, p_data, p_inicio, p_fim)
    or public.permutas_servico_conflito_v1(p_destinatario_id, p_data, p_inicio, p_fim) then
    raise exception using errcode = '23505', message = 'Há conflito de horário com outra permuta ativa.';
  end if;
  insert into public.permutas_servico (tipo, solicitante_id, destinatario_id, motivo)
    values (p_tipo, p_solicitante_id, p_destinatario_id, btrim(p_motivo)) returning id into v_id;
  insert into public.permutas_servico_manifestacoes
    (permuta_id, policial_id, substituto_id, origem_servico, data_servico, turno, horario_inicio, horario_fim, descricao)
    values (v_id, p_solicitante_id, p_destinatario_id, 'informado', p_data, btrim(p_turno), p_inicio, p_fim, btrim(p_descricao));
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_novo)
    values (v_id, p_solicitante_id, 'CRIADA', 'AGUARDANDO_CONFIRMACAO');
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo)
    values (v_id, p_solicitante_id, 'MANIFESTACAO', 'AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_CONFIRMACAO');
  return v_id;
end;
$$;

revoke all on function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text, text)
  to service_role;

commit;
