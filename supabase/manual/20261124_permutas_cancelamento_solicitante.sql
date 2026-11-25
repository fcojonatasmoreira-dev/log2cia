-- Permite que o solicitante cancele somente enquanto não houve decisão.
-- Preserva o cancelamento administrativo de permutas deferidas.
-- Depende da central de notificações 20261124_notificacoes_permutas.sql.
begin;

do $$
begin
  if to_regclass('public.permutas_servico') is null
     or to_regclass('public.permutas_servico_historico') is null
     or to_regclass('public.notificacoes_internas') is null
     or to_regclass('public.policiais') is null then
    raise exception 'Pré-condições ausentes para cancelar permutas pelo solicitante.';
  end if;
  if to_regprocedure('public.permutas_servico_cancelar_v1(uuid,uuid,text)') is null
     or to_regprocedure('public.permutas_servico_notificar_v1()') is null then
    raise exception 'RPC ou trigger de notificações da versão aprovada não existe.';
  end if;
end;
$$;

create or replace function public.permutas_servico_cancelar_v1(
  p_permuta_id uuid,
  p_ator_id uuid,
  p_justificativa text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_permuta public.permutas_servico%rowtype;
  v_role text;
  v_is_master boolean;
  v_justificativa text := nullif(pg_catalog.btrim(coalesce(p_justificativa, '')), '');
  v_admin boolean := false;
begin
  if p_ator_id is null then
    raise exception using errcode = '22023', message = 'Identidade autenticada ausente.';
  end if;
  select * into v_permuta
  from public.permutas_servico
  where id = p_permuta_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Permuta não encontrada.';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))),
         coalesce((pg_catalog.to_jsonb(p)->>'is_master')::boolean, false)
    into v_role, v_is_master
  from public.policiais p where p.id = p_ator_id;
  if not found then
    raise exception using errcode = '42501', message = 'Ator não autorizado.';
  end if;
  v_admin := v_role in ('oficial', 'master') or v_is_master;

  if v_permuta.status in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE')
     and p_ator_id = v_permuta.solicitante_id then
    if v_justificativa is not null and pg_catalog.char_length(v_justificativa) > 3000 then
      raise exception using errcode = '22023', message = 'O motivo pode ter até 3000 caracteres.';
    end if;
  elsif v_permuta.status = 'DEFERIDA' and v_admin then
    if v_justificativa is null or pg_catalog.char_length(v_justificativa) > 3000 then
      raise exception using errcode = '22023', message = 'Informe justificativa administrativa de até 3000 caracteres.';
    end if;
  else
    raise exception using errcode = '40001', message = 'A permuta não pode ser cancelada por este usuário ou nesta situação.';
  end if;

  -- Registrar antes da mudança permite que o trigger identifique o ator e
  -- não envie ao solicitante um aviso sobre o próprio cancelamento.
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo, justificativa)
  values
    (p_permuta_id, p_ator_id, 'CANCELADA', v_permuta.status, 'CANCELADA', v_justificativa);

  update public.permutas_servico
  set status = 'CANCELADA', atualizada_em = pg_catalog.clock_timestamp()
  where id = p_permuta_id;
  return 'CANCELADA';
end;
$$;

revoke all on function public.permutas_servico_cancelar_v1(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_servico_cancelar_v1(uuid,uuid,text)
  to service_role;

create or replace function public.permutas_servico_notificar_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_destinatario uuid;
  v_tipo text;
  v_ator_id uuid;
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

  if new.status = 'CANCELADA' then
    select h.ator_id into v_ator_id
    from public.permutas_servico_historico h
    where h.permuta_id = new.id and h.tipo_evento = 'CANCELADA'
      and h.estado_novo = 'CANCELADA'
    order by h.ocorrido_em desc, h.id desc limit 1;

    update public.notificacoes_internas n
    set lida_em = coalesce(n.lida_em, pg_catalog.clock_timestamp())
    where n.permuta_id = new.id
      and n.tipo in ('PERMUTA_RECEBIDA', 'PERMUTA_AGUARDANDO_ANALISE');

    for v_destinatario in
      select distinct ids.id from (
        select p.id from public.policiais p
        where ((old.status = 'AGUARDANDO_ANALISE'
                and p.id is distinct from v_ator_id
                and (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in ('oficial', 'master')
                     or pg_catalog.to_jsonb(p)->>'is_master' = 'true'))
          or (old.status = 'DEFERIDA'
              and p.id is distinct from v_ator_id
              and (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in ('p1', 'p1_escalante_servico_ordinario', 'master')
                   or pg_catalog.to_jsonb(p)->>'is_master' = 'true')))
        union all select new.solicitante_id where v_ator_id is distinct from new.solicitante_id
        union all select new.destinatario_id where v_ator_id is distinct from new.destinatario_id
      ) ids
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (v_destinatario, new.id, v_tipo)
      on conflict (destinatario_id, permuta_id, tipo) do nothing;
    end loop;
    return new;
  end if;

  if new.status = 'AGUARDANDO_ANALISE' then
    for v_destinatario in
      select distinct p.id from public.policiais p
      where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in ('oficial', 'master')
        or pg_catalog.to_jsonb(p)->>'is_master' = 'true'
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (v_destinatario, new.id, v_tipo)
      on conflict (destinatario_id, permuta_id, tipo) do nothing;
    end loop;
  else
    for v_destinatario in
      select distinct ids.id from (
        select p.id from public.policiais p
        where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in ('p1', 'p1_escalante_servico_ordinario', 'master')
          or pg_catalog.to_jsonb(p)->>'is_master' = 'true'
        union all select new.solicitante_id
        union all select new.destinatario_id
      ) ids
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (v_destinatario, new.id, v_tipo)
      on conflict (destinatario_id, permuta_id, tipo) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.permutas_servico_notificar_v1()
  from public, anon, authenticated, service_role;

commit;
