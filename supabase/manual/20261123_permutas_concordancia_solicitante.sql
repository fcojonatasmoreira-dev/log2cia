-- Permutas de Serviço — registrar a concordância do solicitante na criação.
-- Migration incremental manual; executar somente após as migrations base e motivo.
-- Não executar automaticamente pelo aplicativo nem no Supabase pelo Codex.

begin;

do $$
declare
  v_rpc oid := to_regprocedure(
    'public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time without time zone,time without time zone,text,text)'
  );
  v_argumentos text[];
  v_retorno oid;
  v_security_definer boolean;
  v_configuracao text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'permutas_servico'
      and a.attname = 'motivo' and a.atttypid = 'text'::pg_catalog.regtype
      and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Pré-condição ausente: public.permutas_servico.motivo text';
  end if;
  if v_rpc is null then
    raise exception 'Pré-condição ausente: RPC de criação com assinatura de 9 argumentos';
  end if;

  select p.proargnames, p.prorettype, p.prosecdef, p.proconfig
    into v_argumentos, v_retorno, v_security_definer, v_configuracao
  from pg_catalog.pg_proc p where p.oid = v_rpc;
  if v_argumentos is distinct from ARRAY[
    'p_tipo','p_solicitante_id','p_destinatario_id','p_data','p_turno',
    'p_inicio','p_fim','p_descricao','p_motivo'
  ]::text[] or v_retorno <> 'uuid'::pg_catalog.regtype
    or not v_security_definer
    or not (coalesce(v_configuracao, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, pg_temp']::text[]) then
    raise exception 'A definição atual da RPC de criação diverge da assinatura aprovada';
  end if;
  if not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE')
    or exists (
      select 1 from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      where p.oid = v_rpc and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then
    raise exception 'A ACL atual da RPC de criação não corresponde ao acesso restrito esperado';
  end if;
end
$$;

create or replace function public.permutas_servico_criar_v1(
  p_tipo text, p_solicitante_id uuid, p_destinatario_id uuid,
  p_data date, p_turno text, p_inicio time, p_fim time,
  p_descricao text, p_motivo text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_confirmada_em timestamptz;
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

  v_confirmada_em := clock_timestamp();
  insert into public.permutas_servico_confirmacoes (permuta_id, policial_id, confirmada_em)
    values (v_id, p_solicitante_id, v_confirmada_em);
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo, ocorrido_em)
    values (v_id, p_solicitante_id, 'CONFIRMADA', 'AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_CONFIRMACAO', v_confirmada_em);
  return v_id;
end;
$$;

revoke all on function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text, text)
  to service_role;

commit;
