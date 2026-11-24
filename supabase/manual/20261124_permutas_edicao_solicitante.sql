-- Edição auditável pelo solicitante enquanto a permuta não recebeu decisão.
-- Aplicar manualmente após Permutas, motivo, concordância, mensagens e notificações.
begin;

do $$
begin
  if to_regclass('public.permutas_servico') is null
    or to_regclass('public.permutas_servico_manifestacoes') is null
    or to_regclass('public.permutas_servico_confirmacoes') is null
    or to_regclass('public.permutas_servico_historico') is null
    or to_regclass('public.notificacoes_internas') is null then
    raise exception 'Pré-condições ausentes para a edição de Permutas.';
  end if;
  if to_regprocedure('public.permutas_servico_notificar_v1()') is null then
    raise exception 'Pré-condição ausente: trigger de notificações da central.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico'::regclass
      and a.attname = 'atualizada_em' and a.attnum > 0 and not a.attisdropped
      and a.atttypid = 'timestamp with time zone'::regtype
  ) then
    raise exception 'Pré-condição ausente: public.permutas_servico.atualizada_em timestamptz.';
  end if;
  if to_regprocedure('public.permutas_servico_editar_v1(uuid,uuid,timestamp with time zone,uuid,text,date,text,time without time zone,time without time zone,text)') is not null then
    raise exception 'Colisão: public.permutas_servico_editar_v1 já existe.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.permutas_servico_historico'::regclass
      and conname = 'permutas_servico_historico_tipo_evento_check'
  ) then
    raise exception 'Constraint de eventos do histórico diverge da migration base.';
  end if;
end;
$$;

alter table public.permutas_servico_historico
  drop constraint permutas_servico_historico_tipo_evento_check,
  add constraint permutas_servico_historico_tipo_evento_check
    check (tipo_evento in ('CRIADA', 'MANIFESTACAO', 'CONFIRMADA', 'EDITADA', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA')),
  add column detalhes_alteracao jsonb;

-- Reabertura para confirmação pode voltar a AGUARDANDO_ANALISE. Nesse caso,
-- a chave única impede duplicar o aviso, mas a notificação antiga precisa ser
-- reativada para voltar ao topo e ao contador de não lidas.
create or replace function public.permutas_servico_notificar_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_destinatario uuid;
  v_tipo text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'AGUARDANDO_CONFIRMACAO' then
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (new.destinatario_id, new.id, 'PERMUTA_RECEBIDA')
      on conflict (destinatario_id, permuta_id, tipo) do nothing;
    end if;
    return new;
  end if;

  if old.status is not distinct from new.status then return new; end if;
  v_tipo := case new.status
    when 'AGUARDANDO_ANALISE' then 'PERMUTA_AGUARDANDO_ANALISE'
    when 'DEFERIDA' then 'PERMUTA_DEFERIDA'
    when 'INDEFERIDA' then 'PERMUTA_INDEFERIDA'
    when 'CANCELADA' then 'PERMUTA_CANCELADA'
    else null
  end;
  if v_tipo is null then return new; end if;

  if new.status = 'AGUARDANDO_ANALISE' then
    for v_destinatario in
      select distinct p.id from public.policiais as p
      where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in ('oficial', 'master')
        or pg_catalog.to_jsonb(p)->>'is_master' = 'true'
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (v_destinatario, new.id, v_tipo)
      on conflict (destinatario_id, permuta_id, tipo)
      do update set criado_em = excluded.criado_em, lida_em = null;
    end loop;
  else
    for v_destinatario in
      select distinct destinatarios.id from (
        select p.id from public.policiais as p
        where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in
          ('p1', 'p1_escalante_servico_ordinario', 'master')
          or pg_catalog.to_jsonb(p)->>'is_master' = 'true'
        union all select new.solicitante_id
        union all select new.destinatario_id
      ) as destinatarios
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (v_destinatario, new.id, v_tipo)
      on conflict (destinatario_id, permuta_id, tipo) do nothing;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.permutas_servico_notificar_v1() from public, anon, authenticated, service_role;

create function public.permutas_servico_editar_v1(
  p_permuta_id uuid,
  p_ator_id uuid,
  p_versao_esperada timestamptz,
  p_destinatario_id uuid,
  p_motivo text,
  p_data date,
  p_turno text,
  p_inicio time,
  p_fim time,
  p_descricao text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_permuta public.permutas_servico%rowtype;
  v_destinatario public.policiais%rowtype;
  v_posto text;
  v_posto_oficial boolean;
  v_antes jsonb;
  v_depois jsonb;
  v_agora timestamptz := pg_catalog.clock_timestamp();
begin
  select * into v_permuta
  from public.permutas_servico
  where id = p_permuta_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Permuta não encontrada.';
  end if;
  if p_ator_id is null or p_ator_id <> v_permuta.solicitante_id then
    raise exception using errcode = '42501', message = 'Somente o solicitante original pode editar esta permuta.';
  end if;
  if p_versao_esperada is null or v_permuta.atualizada_em is distinct from p_versao_esperada then
    raise exception using errcode = '40001', message = 'A permuta foi atualizada em outra sessão. Recarregue os dados antes de editar.';
  end if;
  if v_permuta.status not in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE') then
    raise exception using errcode = '40001', message = 'Esta permuta não pode mais ser editada.';
  end if;
  if p_destinatario_id is null or p_destinatario_id = v_permuta.solicitante_id
    or p_data is null or pg_catalog.length(pg_catalog.btrim(coalesce(p_turno, ''))) not between 1 and 80
    or p_inicio is null or p_fim is null or p_inicio = p_fim
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_descricao, ''))) not between 1 and 500
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_motivo, ''))) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Dados da permuta inválidos.';
  end if;

  select * into v_destinatario from public.policiais where id = p_destinatario_id;
  v_posto := pg_catalog.lower(pg_catalog.btrim(coalesce(v_destinatario.posto_graduacao, '')));
  v_posto_oficial :=
    (v_posto like '%coronel%' and v_posto not like '%tenente%')
    or v_posto like '%tenente coronel%'
    or v_posto like '%tenente-coronel%'
    or v_posto = 'tc'
    or v_posto like '%major%'
    or v_posto = 'maj'
    or v_posto like '%capit%'
    or v_posto = 'cap'
    or v_posto like '%1º tenente%'
    or v_posto like '%1o tenente%'
    or v_posto like '%primeiro tenente%'
    or v_posto like '%1 tenente%'
    or v_posto like '%2º tenente%'
    or v_posto like '%2o tenente%'
    or v_posto like '%segundo tenente%'
    or v_posto like '%2 tenente%'
    or v_posto like '%aspirante%'
    or v_posto = 'asp';
  if not found or v_destinatario.status is distinct from 'EM ATIVIDADE' or v_posto_oficial then
    raise exception using errcode = '22023', message = 'O substituto precisa estar em atividade e fora de posto de oficial.';
  end if;

  perform public.permutas_servico_bloquear_policial_v1(array[v_permuta.solicitante_id, v_permuta.destinatario_id, p_destinatario_id]);

  select pg_catalog.jsonb_build_object(
    'destinatario_id', v_permuta.destinatario_id,
    'motivo', v_permuta.motivo,
    'manifestacoes', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.policial_id), '[]'::jsonb)
  ) into v_antes
  from public.permutas_servico_manifestacoes as m
  where m.permuta_id = p_permuta_id;

  if exists (
    select 1
    from public.permutas_servico_manifestacoes as m
    join public.permutas_servico as p on p.id = m.permuta_id
    cross join lateral (
      select pg_catalog.tsrange(m.data_servico + m.horario_inicio,
        m.data_servico + m.horario_fim + case when m.horario_fim <= m.horario_inicio then interval '1 day' else interval '0' end, '[)') as existente,
        pg_catalog.tsrange(p_data + p_inicio,
        p_data + p_fim + case when p_fim <= p_inicio then interval '1 day' else interval '0' end, '[)') as novo
    ) as janelas
    where p.id <> p_permuta_id
      and p.status in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE', 'DEFERIDA')
      and (v_permuta.solicitante_id in (m.policial_id, m.substituto_id)
        or p_destinatario_id in (m.policial_id, m.substituto_id))
      and janelas.existente && janelas.novo
  ) then
    raise exception using errcode = '23505', message = 'Há conflito de horário com outra permuta ativa.';
  end if;

  if v_permuta.tipo = 'TROCA_RECIPROCA' and p_destinatario_id = v_permuta.destinatario_id
    and exists (
      select 1 from public.permutas_servico_manifestacoes as m
      where m.permuta_id = p_permuta_id and m.policial_id = v_permuta.destinatario_id
        and pg_catalog.tsrange(m.data_servico + m.horario_inicio,
          m.data_servico + m.horario_fim + case when m.horario_fim <= m.horario_inicio then interval '1 day' else interval '0' end, '[)')
        && pg_catalog.tsrange(p_data + p_inicio,
          p_data + p_fim + case when p_fim <= p_inicio then interval '1 day' else interval '0' end, '[)')
    ) then
    raise exception using errcode = '23505', message = 'Os dois serviços da troca recíproca não podem conflitar.';
  end if;

  update public.permutas_servico_manifestacoes
  set substituto_id = p_destinatario_id,
      data_servico = p_data,
      turno = pg_catalog.btrim(p_turno),
      horario_inicio = p_inicio,
      horario_fim = p_fim,
      descricao = pg_catalog.btrim(p_descricao)
  where permuta_id = p_permuta_id and policial_id = v_permuta.solicitante_id;
  if not found then
    raise exception using errcode = '23514', message = 'A manifestação original do solicitante está ausente.';
  end if;

  if p_destinatario_id <> v_permuta.destinatario_id then
    -- Em troca recíproca, o serviço informado pelo antigo destinatário não
    -- pode ser transferido ao novo participante; ele deverá informá-lo ao confirmar.
    delete from public.permutas_servico_manifestacoes
    where permuta_id = p_permuta_id and policial_id = v_permuta.destinatario_id;
  end if;

  update public.permutas_servico
  set destinatario_id = p_destinatario_id,
      motivo = pg_catalog.btrim(p_motivo),
      status = 'AGUARDANDO_CONFIRMACAO',
      atualizada_em = v_agora
  where id = p_permuta_id;

  update public.notificacoes_internas
  set lida_em = coalesce(lida_em, v_agora)
  where permuta_id = p_permuta_id and tipo = 'PERMUTA_AGUARDANDO_ANALISE';

  delete from public.permutas_servico_confirmacoes
  where permuta_id = p_permuta_id and policial_id <> v_permuta.solicitante_id;
  insert into public.permutas_servico_confirmacoes (permuta_id, policial_id)
  values (p_permuta_id, v_permuta.solicitante_id)
  on conflict (permuta_id, policial_id) do nothing;

  select pg_catalog.jsonb_build_object(
    'destinatario_id', p_destinatario_id,
    'motivo', pg_catalog.btrim(p_motivo),
    'manifestacoes', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.policial_id), '[]'::jsonb)
  ) into v_depois
  from public.permutas_servico_manifestacoes as m
  where m.permuta_id = p_permuta_id;

  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo, detalhes_alteracao, ocorrido_em)
  values
    (p_permuta_id, v_permuta.solicitante_id, 'EDITADA', v_permuta.status, 'AGUARDANDO_CONFIRMACAO',
     pg_catalog.jsonb_build_object('antes', v_antes, 'depois', v_depois), v_agora);

  -- Uma edição sempre exige nova manifestação do destinatário. Reaproveita o
  -- registro único e reinicia a leitura para não deixar aviso obsoleto.
  insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo, mensagem_disponivel, criado_em, lida_em)
  values (p_destinatario_id, p_permuta_id, 'PERMUTA_RECEBIDA', false, v_agora, null)
  on conflict (destinatario_id, permuta_id, tipo)
  do update set mensagem_disponivel = false, criado_em = excluded.criado_em, lida_em = null;

  if p_destinatario_id <> v_permuta.destinatario_id then
    update public.notificacoes_internas
    set lida_em = coalesce(lida_em, v_agora)
    where destinatario_id = v_permuta.destinatario_id
      and permuta_id = p_permuta_id
      and tipo = 'PERMUTA_RECEBIDA';
  end if;
  return 'AGUARDANDO_CONFIRMACAO';
end;
$$;

revoke all on function public.permutas_servico_editar_v1(uuid, uuid, timestamptz, uuid, text, date, text, time, time, text)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_servico_editar_v1(uuid, uuid, timestamptz, uuid, text, date, text, time, time, text)
  to service_role;

commit;
