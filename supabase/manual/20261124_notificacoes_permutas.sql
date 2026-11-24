-- Central interna de notificações: eventos do módulo Permutas.
-- Aplicar manualmente após a migration base e a migration de mensagens
-- 20261124_permutas_mensagens_decisao.sql.

begin;

do $$
begin
  if to_regclass('public.permutas_servico') is null then
    raise exception 'Pré-condição ausente: public.permutas_servico';
  end if;
  if to_regclass('public.policiais') is null then
    raise exception 'Pré-condição ausente: public.policiais';
  end if;
  if to_regclass('public.permutas_servico_historico') is null then
    raise exception 'Pré-condição ausente: public.permutas_servico_historico';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.policiais'::regclass
      and a.attname = 'role' and a.attnum > 0 and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico'::regclass
      and a.attname = 'status' and a.attnum > 0 and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico'::regclass
      and a.attname = 'solicitante_id' and a.attnum > 0 and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico'::regclass
      and a.attname = 'destinatario_id' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Pré-condição ausente: estrutura de participantes/status de Permutas ou public.policiais.role';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico_historico'::regclass
      and a.attname = 'mensagem_escalante' and a.attnum > 0 and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico_historico'::regclass
      and a.attname = 'mensagem_policial_1' and a.attnum > 0 and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico_historico'::regclass
      and a.attname = 'mensagem_policial_2' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'Pré-condição ausente: aplique primeiro a migration de mensagens de decisão';
  end if;
  if to_regclass('public.notificacoes_internas') is not null
    or to_regprocedure('public.permutas_servico_notificar_v1()') is not null
    or to_regprocedure('public.permutas_servico_notificar_mensagem_v1()') is not null
    or exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid in ('public.permutas_servico'::regclass, 'public.permutas_servico_historico'::regclass)
        and tgname in (
          'permutas_servico_notificar_criacao_v1',
          'permutas_servico_notificar_transicao_v1',
          'permutas_servico_notificar_mensagem_v1'
        )
        and not tgisinternal
    ) then
    raise exception 'Colisão: objetos da central de notificações já existem; revisar manualmente';
  end if;
end;
$$;

create table public.notificacoes_internas (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  destinatario_id uuid not null references public.policiais(id) on delete restrict,
  permuta_id uuid not null references public.permutas_servico(id) on delete restrict,
  tipo text not null check (tipo in (
    'PERMUTA_RECEBIDA', 'PERMUTA_AGUARDANDO_ANALISE', 'PERMUTA_DEFERIDA',
    'PERMUTA_INDEFERIDA', 'PERMUTA_CANCELADA'
  )),
  mensagem_disponivel boolean not null default false,
  criado_em timestamptz not null default pg_catalog.clock_timestamp(),
  lida_em timestamptz,
  unique (destinatario_id, permuta_id, tipo)
);

create index notificacoes_internas_destinatario_data_idx
  on public.notificacoes_internas (destinatario_id, criado_em desc);
create index notificacoes_internas_nao_lidas_idx
  on public.notificacoes_internas (destinatario_id, criado_em desc)
  where lida_em is null;

alter table public.notificacoes_internas enable row level security;
revoke all on table public.notificacoes_internas from public, anon, authenticated, service_role;
grant select on table public.notificacoes_internas to service_role;
grant update (lida_em) on table public.notificacoes_internas to service_role;

create function public.permutas_servico_notificar_v1()
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

  if old.status is not distinct from new.status then
    return new;
  end if;

  v_tipo := case new.status
    when 'AGUARDANDO_ANALISE' then 'PERMUTA_AGUARDANDO_ANALISE'
    when 'DEFERIDA' then 'PERMUTA_DEFERIDA'
    when 'INDEFERIDA' then 'PERMUTA_INDEFERIDA'
    when 'CANCELADA' then 'PERMUTA_CANCELADA'
    else null
  end;
  if v_tipo is null then
    return new;
  end if;

  if new.status = 'AGUARDANDO_ANALISE' then
    for v_destinatario in
      select distinct p.id
      from public.policiais as p
      where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) = 'oficial'
        or pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) = 'master'
        or pg_catalog.to_jsonb(p)->>'is_master' = 'true'
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
      values (v_destinatario, new.id, v_tipo)
      on conflict (destinatario_id, permuta_id, tipo) do nothing;
    end loop;
  else
    for v_destinatario in
      select distinct destinatarios.id
      from (
        select p.id
        from public.policiais as p
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

create trigger permutas_servico_notificar_criacao_v1
  after insert on public.permutas_servico
  for each row execute function public.permutas_servico_notificar_v1();

create trigger permutas_servico_notificar_transicao_v1
  after update of status on public.permutas_servico
  for each row execute function public.permutas_servico_notificar_v1();

create function public.permutas_servico_notificar_mensagem_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_tipo text;
begin
  if new.tipo_evento not in ('DEFERIDA', 'INDEFERIDA') then
    return new;
  end if;
  v_tipo := case new.tipo_evento
    when 'DEFERIDA' then 'PERMUTA_DEFERIDA'
    when 'INDEFERIDA' then 'PERMUTA_INDEFERIDA'
  end;

  update public.notificacoes_internas as n
  set mensagem_disponivel = true
  where n.permuta_id = new.permuta_id
    and n.tipo = v_tipo
    and (
      (new.mensagem_escalante is not null and exists (
        select 1 from public.policiais as p
        where p.id = n.destinatario_id
          and (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in
            ('p1', 'p1_escalante_servico_ordinario', 'master')
            or pg_catalog.to_jsonb(p)->>'is_master' = 'true')
      ))
      or (new.mensagem_policial_1 is not null and exists (
        select 1 from public.permutas_servico as s
        where s.id = new.permuta_id and s.solicitante_id = n.destinatario_id
      ))
      or (new.mensagem_policial_2 is not null and exists (
        select 1 from public.permutas_servico as s
        where s.id = new.permuta_id and s.destinatario_id = n.destinatario_id
      ))
      or ((pg_catalog.lower(pg_catalog.btrim(coalesce((
        select p.role from public.policiais as p where p.id = n.destinatario_id
      ), ''))) = 'master'
        or exists (
          select 1 from public.policiais as p
          where p.id = n.destinatario_id and pg_catalog.to_jsonb(p)->>'is_master' = 'true'
        )) and (
          new.mensagem_escalante is not null
          or new.mensagem_policial_1 is not null
          or new.mensagem_policial_2 is not null
        ))
    );
  return new;
end;
$$;

revoke all on function public.permutas_servico_notificar_mensagem_v1() from public, anon, authenticated, service_role;

create trigger permutas_servico_notificar_mensagem_v1
  after insert on public.permutas_servico_historico
  for each row execute function public.permutas_servico_notificar_mensagem_v1();

commit;
