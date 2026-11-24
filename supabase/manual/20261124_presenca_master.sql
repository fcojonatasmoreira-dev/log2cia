-- Heartbeat autenticado e presença agregada para o Painel Master.
-- Executar manualmente após conferir public.policiais no Supabase.
begin;

do $$
begin
  if to_regclass('public.policiais') is null then
    raise exception 'Pré-condição ausente: public.policiais.';
  end if;
  if to_regclass('public.presenca_sessoes') is not null
    or to_regprocedure('public.presenca_registrar_v1(uuid,uuid)') is not null then
    raise exception 'Colisão: objetos de presença já existem; revisar manualmente.';
  end if;
end;
$$;

create table public.presenca_sessoes (
  policial_id uuid not null references public.policiais(id) on delete cascade,
  instancia_id uuid not null,
  ultima_atividade timestamptz not null default pg_catalog.clock_timestamp(),
  constraint presenca_sessoes_pkey primary key (policial_id, instancia_id)
);

create index presenca_sessoes_atividade_idx
  on public.presenca_sessoes (ultima_atividade desc);

alter table public.presenca_sessoes enable row level security;
revoke all on table public.presenca_sessoes from public, anon, authenticated, service_role;
grant select on table public.presenca_sessoes to service_role;

create function public.presenca_registrar_v1(p_policial_id uuid, p_instancia_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_atividade timestamptz := pg_catalog.clock_timestamp();
begin
  if p_policial_id is null or p_instancia_id is null then
    raise exception using errcode = '22023', message = 'Identificador da sessão de presença inválido.';
  end if;

  insert into public.presenca_sessoes (policial_id, instancia_id, ultima_atividade)
  values (p_policial_id, p_instancia_id, v_atividade)
  on conflict (policial_id, instancia_id)
  do update set ultima_atividade = excluded.ultima_atividade;

  -- Retenção limitada para evitar crescimento indefinido; presença online é
  -- calculada separadamente com janela de 120 segundos.
  delete from public.presenca_sessoes
  where ultima_atividade < v_atividade - interval '30 days';
  return v_atividade;
end;
$$;

revoke all on function public.presenca_registrar_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.presenca_registrar_v1(uuid, uuid)
  to service_role;

commit;
