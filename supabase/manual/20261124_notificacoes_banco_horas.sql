-- Estende a central interna aos eventos aprovados do Banco de Horas.
-- Aplicar após 20261124_notificacoes_permutas.sql e após conferir a estrutura
-- real de public.banco_horas_solicitacoes no SQL Editor de produção.
begin;

do $$
declare
  v_tipo oid;
begin
  if to_regclass('public.notificacoes_internas') is null
     or to_regclass('public.banco_horas_solicitacoes') is null
     or to_regclass('public.policiais') is null then
    raise exception 'Pré-condições ausentes: central de notificações, Banco de Horas ou policiais.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.notificacoes_internas'::regclass
      and attname = 'banco_horas_solicitacao_id' and not attisdropped
  ) or to_regprocedure('public.notificacoes_banco_horas_v1()') is not null
    or exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.banco_horas_solicitacoes'::regclass and tgname = 'notificacoes_banco_horas_v1' and not tgisinternal) then
    raise exception 'Colisão: objetos de notificação do Banco de Horas já existem.';
  end if;
  if to_regclass('public.notificacoes_internas_banco_evento_uidx') is not null
     or to_regclass('public.notificacoes_internas_banco_ref_idx') is not null
     or exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.notificacoes_internas'::regclass and conname = 'notificacoes_internas_referencia_exclusiva_check') then
    raise exception 'Colisão: constraint ou índice da integração de Banco de Horas já existe.';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.notificacoes_internas'::regclass and conname = 'notificacoes_internas_tipo_check' and contype = 'c') then
    raise exception 'Pré-condição incompatível: notificacoes_internas_tipo_check não existe com o nome esperado.';
  end if;
  select atttypid into v_tipo from pg_catalog.pg_attribute
  where attrelid = 'public.notificacoes_internas'::regclass and attname = 'permuta_id' and not attisdropped;
  if v_tipo is distinct from 'uuid'::regtype::oid then
    raise exception 'Precondição incompatível: notificacoes_internas.permuta_id precisa ser uuid.';
  end if;
  select atttypid into v_tipo from pg_catalog.pg_attribute
  where attrelid = 'public.banco_horas_solicitacoes'::regclass and attname = 'id' and not attisdropped;
  if v_tipo is distinct from 'uuid'::regtype::oid then
    raise exception 'Revisão manual: banco_horas_solicitacoes.id precisa ser uuid para esta integração.';
  end if;
  select atttypid into v_tipo from pg_catalog.pg_attribute
  where attrelid = 'public.banco_horas_solicitacoes'::regclass and attname = 'policial_id' and not attisdropped;
  if v_tipo is distinct from 'uuid'::regtype::oid then
    raise exception 'Revisão manual: banco_horas_solicitacoes.policial_id precisa ser uuid.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.banco_horas_solicitacoes'::regclass and attname = 'tipo' and not attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.banco_horas_solicitacoes'::regclass and attname = 'status' and not attisdropped) then
    raise exception 'Pré-condição ausente: banco_horas_solicitacoes.tipo/status.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.banco_horas_solicitacoes'::regclass
      and c.confrelid = 'public.policiais'::regclass and c.contype = 'f'
      and c.conkey @> array[(select a.attnum from pg_catalog.pg_attribute a where a.attrelid = c.conrelid and a.attname = 'policial_id' and not a.attisdropped)]::smallint[]
  ) then
    raise exception 'Pré-condição incompatível: policial_id deve ter FK para public.policiais.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.notificacoes_internas'::regclass and attname = 'permuta_id' and not attisdropped) then
    raise exception 'Pré-condição ausente: notificacoes_internas.permuta_id.';
  end if;
end;
$$;

alter table public.notificacoes_internas
  alter column permuta_id drop not null,
  add column banco_horas_solicitacao_id uuid references public.banco_horas_solicitacoes(id) on delete restrict;
alter table public.notificacoes_internas
  add constraint notificacoes_internas_referencia_exclusiva_check
  check ((permuta_id is not null) <> (banco_horas_solicitacao_id is not null));
alter table public.notificacoes_internas
  drop constraint notificacoes_internas_tipo_check,
  add constraint notificacoes_internas_tipo_check check (tipo in (
    'PERMUTA_RECEBIDA', 'PERMUTA_AGUARDANDO_ANALISE', 'PERMUTA_DEFERIDA',
    'PERMUTA_INDEFERIDA', 'PERMUTA_CANCELADA',
    'BANCO_HORAS_NOVA', 'BANCO_HORAS_DEFERIDA', 'BANCO_HORAS_INDEFERIDA'
  ));
create unique index notificacoes_internas_banco_evento_uidx
  on public.notificacoes_internas (destinatario_id, banco_horas_solicitacao_id, tipo)
  where banco_horas_solicitacao_id is not null;
create index notificacoes_internas_banco_ref_idx
  on public.notificacoes_internas (banco_horas_solicitacao_id)
  where banco_horas_solicitacao_id is not null;

create function public.notificacoes_banco_horas_v1()
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
    if new.status::text <> 'pendente'
       or new.tipo::text not in ('inclusao_horas', 'dispensa') then
      return new;
    end if;
    for v_destinatario in
      select distinct p.id from public.policiais p
      where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) in ('master', 'p1', 'oficial')
        or pg_catalog.to_jsonb(p)->>'is_master' = 'true'
    loop
      insert into public.notificacoes_internas
        (destinatario_id, banco_horas_solicitacao_id, tipo)
      values (v_destinatario, new.id, 'BANCO_HORAS_NOVA')
      on conflict (destinatario_id, banco_horas_solicitacao_id, tipo)
        where banco_horas_solicitacao_id is not null do nothing;
    end loop;
    return new;
  end if;

  if old.status::text is not distinct from new.status::text
     or new.tipo::text not in ('inclusao_horas', 'dispensa') then
    return new;
  end if;
  v_tipo := case new.status::text
    when 'deferida' then 'BANCO_HORAS_DEFERIDA'
    when 'indeferida' then 'BANCO_HORAS_INDEFERIDA'
    else null
  end;
  if v_tipo is not null then
    insert into public.notificacoes_internas
      (destinatario_id, banco_horas_solicitacao_id, tipo)
    values (new.policial_id, new.id, v_tipo)
    on conflict (destinatario_id, banco_horas_solicitacao_id, tipo)
      where banco_horas_solicitacao_id is not null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.notificacoes_banco_horas_v1()
  from public, anon, authenticated, service_role;
create trigger notificacoes_banco_horas_v1
  after insert or update of status on public.banco_horas_solicitacoes
  for each row execute function public.notificacoes_banco_horas_v1();

commit;
