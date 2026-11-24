-- Recupera avisos de análise que já existiam quando a central foi instalada.
-- Aplicar após 20261124_notificacoes_permutas.sql.
begin;

do $$
begin
  if to_regclass('public.permutas_servico') is null
    or to_regclass('public.policiais') is null
    or to_regclass('public.notificacoes_internas') is null then
    raise exception 'Pré-condições ausentes para reconciliar notificações de Permutas.';
  end if;
  if to_regprocedure('public.permutas_notificacoes_reconciliar_v1(uuid)') is not null then
    raise exception 'Colisão: public.permutas_notificacoes_reconciliar_v1 já existe.';
  end if;
end;
$$;

create function public.permutas_notificacoes_reconciliar_v1(p_destinatario_id uuid)
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
  on conflict (destinatario_id, permuta_id, tipo) do nothing;
  get diagnostics v_inseridas = row_count;
  return v_inseridas;
end;
$$;

revoke all on function public.permutas_notificacoes_reconciliar_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_notificacoes_reconciliar_v1(uuid)
  to service_role;

commit;
