-- Corrige a RPC de reconciliação após o Controle de Escala trocar a
-- constraint única legada por um índice parcial para evento_chave nulo.
-- Aplicar após 20261125_permutas_controle_escala.sql.
begin;

do $$
begin
  if to_regclass('public.notificacoes_internas') is null
     or to_regclass('public.permutas_servico') is null
     or to_regclass('public.policiais') is null then
    raise exception 'Pré-condições ausentes para corrigir a reconciliação das notificações.';
  end if;
  if to_regprocedure('public.permutas_notificacoes_reconciliar_v1(uuid)') is null then
    raise exception 'Pré-condição ausente: public.permutas_notificacoes_reconciliar_v1(uuid).';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.notificacoes_internas'::regclass
      and attname = 'evento_chave' and not attisdropped
  ) or to_regclass('public.notificacoes_internas_legadas_uidx') is null then
    raise exception 'Pré-condição ausente: índice parcial do Controle de Escala.';
  end if;
end;
$$;

create or replace function public.permutas_notificacoes_reconciliar_v1(p_destinatario_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text;
  v_is_master boolean;
  v_inseridas integer;
begin
  select pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))),
         coalesce((pg_catalog.to_jsonb(p)->>'is_master')::boolean, false)
    into v_role, v_is_master
  from public.policiais as p
  where p.id = p_destinatario_id;

  if not found or (v_role <> 'oficial' and v_role <> 'master' and not v_is_master) then
    raise exception using errcode = '42501', message = 'Destinatário não autorizado para pendências administrativas.';
  end if;

  insert into public.notificacoes_internas (destinatario_id, permuta_id, tipo)
  select p_destinatario_id, s.id, 'PERMUTA_AGUARDANDO_ANALISE'
  from public.permutas_servico as s
  where s.status = 'AGUARDANDO_ANALISE'
  on conflict (destinatario_id, permuta_id, tipo) where evento_chave is null do nothing;
  get diagnostics v_inseridas = row_count;
  return v_inseridas;
end;
$$;

revoke all on function public.permutas_notificacoes_reconciliar_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_notificacoes_reconciliar_v1(uuid)
  to service_role;

commit;
