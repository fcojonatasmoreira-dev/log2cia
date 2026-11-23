-- Permutas de Serviço — proposta manual, ainda não executada.
-- Data/turno/horário/descrição são informados pelos policiais. Não há integração
-- nem validação contra uma escala oficial nesta etapa.

begin;

create table public.permutas_servico (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('SUBSTITUICAO_SIMPLES', 'TROCA_RECIPROCA')),
  status text not null default 'AGUARDANDO_CONFIRMACAO'
    check (status in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA')),
  solicitante_id uuid not null references public.policiais(id),
  destinatario_id uuid not null references public.policiais(id),
  criada_em timestamptz not null default clock_timestamp(),
  atualizada_em timestamptz not null default clock_timestamp(),
  check (solicitante_id <> destinatario_id)
);

create table public.permutas_servico_manifestacoes (
  id uuid primary key default gen_random_uuid(),
  permuta_id uuid not null references public.permutas_servico(id) on delete restrict,
  policial_id uuid not null references public.policiais(id),
  substituto_id uuid not null references public.policiais(id),
  origem_servico text not null default 'informado' check (origem_servico in ('informado', 'equipes')),
  referencia_origem text,
  data_servico date not null,
  turno text not null check (length(btrim(turno)) between 1 and 80),
  horario_inicio time not null,
  horario_fim time not null,
  descricao text not null check (length(btrim(descricao)) between 1 and 500),
  criada_em timestamptz not null default clock_timestamp(),
  unique (permuta_id, policial_id),
  check (policial_id <> substituto_id),
  check (horario_inicio <> horario_fim),
  check (
    (origem_servico = 'informado' and referencia_origem is null)
    or (origem_servico = 'equipes' and referencia_origem is not null)
  )
);

create table public.permutas_servico_confirmacoes (
  permuta_id uuid not null references public.permutas_servico(id) on delete restrict,
  policial_id uuid not null references public.policiais(id),
  confirmada_em timestamptz not null default clock_timestamp(),
  primary key (permuta_id, policial_id)
);

create table public.permutas_servico_historico (
  id bigint generated always as identity primary key,
  permuta_id uuid not null references public.permutas_servico(id) on delete restrict,
  ator_id uuid not null references public.policiais(id),
  tipo_evento text not null check (tipo_evento in ('CRIADA', 'MANIFESTACAO', 'CONFIRMADA', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA')),
  estado_anterior text check (estado_anterior is null or estado_anterior in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA')),
  estado_novo text not null check (estado_novo in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE', 'DEFERIDA', 'INDEFERIDA', 'CANCELADA')),
  justificativa text check (justificativa is null or length(justificativa) <= 3000),
  servicos_conferidos boolean not null default false,
  ocorrido_em timestamptz not null default clock_timestamp()
);

create index permutas_servico_solicitante_status_idx on public.permutas_servico (solicitante_id, status);
create index permutas_servico_destinatario_status_idx on public.permutas_servico (destinatario_id, status);
create index permutas_servico_status_data_idx on public.permutas_servico (status, criada_em desc);
create index permutas_servico_manifestacoes_data_idx on public.permutas_servico_manifestacoes (data_servico, policial_id);
create index permutas_servico_historico_permuta_idx on public.permutas_servico_historico (permuta_id, ocorrido_em, id);

alter table public.permutas_servico enable row level security;
alter table public.permutas_servico_manifestacoes enable row level security;
alter table public.permutas_servico_confirmacoes enable row level security;
alter table public.permutas_servico_historico enable row level security;

revoke all on public.permutas_servico, public.permutas_servico_manifestacoes,
  public.permutas_servico_confirmacoes, public.permutas_servico_historico
  from public, anon, authenticated;
grant all on public.permutas_servico, public.permutas_servico_manifestacoes,
  public.permutas_servico_confirmacoes, public.permutas_servico_historico
  to service_role;
grant usage, select on sequence public.permutas_servico_historico_id_seq to service_role;

-- Trava por policial serializa reservas mesmo para serviços que atravessam
-- meia-noite; a busca de conflito usa intervalos temporais e estados ativos.
create or replace function public.permutas_servico_bloquear_policial_v1(p_ids uuid[])
returns void
language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_chave bigint;
begin
  for v_chave in
    select distinct hashtextextended('permutas:' || policial_id::text, 0)
    from unnest(p_ids) as policial_id
    order by 1
  loop
    perform pg_advisory_xact_lock(v_chave);
  end loop;
end;
$$;

create or replace function public.permutas_servico_conflito_v1(
  p_policial_id uuid, p_data date, p_inicio time, p_fim time
) returns boolean
language sql volatile security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.permutas_servico_manifestacoes m
    join public.permutas_servico p on p.id = m.permuta_id
    cross join lateral (
      select tsrange(
        m.data_servico + m.horario_inicio,
        m.data_servico + m.horario_fim
          + case when m.horario_fim <= m.horario_inicio then interval '1 day' else interval '0' end,
        '[)'
      ) as intervalo_existente,
      tsrange(
        p_data + p_inicio,
        p_data + p_fim + case when p_fim <= p_inicio then interval '1 day' else interval '0' end,
        '[)'
      ) as intervalo_novo
    ) janelas
    where p.status in ('AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_ANALISE', 'DEFERIDA')
      and p_policial_id in (m.policial_id, m.substituto_id)
      and janelas.intervalo_existente && janelas.intervalo_novo
  )
$$;

create or replace function public.permutas_servico_criar_v1(
  p_tipo text, p_solicitante_id uuid, p_destinatario_id uuid,
  p_data date, p_turno text, p_inicio time, p_fim time, p_descricao text
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
    or length(btrim(coalesce(p_descricao, ''))) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Dados da permuta inválidos.';
  end if;
  perform public.permutas_servico_bloquear_policial_v1(array[p_solicitante_id, p_destinatario_id]);
  if public.permutas_servico_conflito_v1(p_solicitante_id, p_data, p_inicio, p_fim)
    or public.permutas_servico_conflito_v1(p_destinatario_id, p_data, p_inicio, p_fim) then
    raise exception using errcode = '23505', message = 'Há conflito de horário com outra permuta ativa.';
  end if;
  insert into public.permutas_servico (tipo, solicitante_id, destinatario_id)
    values (p_tipo, p_solicitante_id, p_destinatario_id) returning id into v_id;
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

create or replace function public.permutas_servico_confirmar_v1(
  p_permuta_id uuid, p_ator_id uuid, p_data date default null,
  p_turno text default null, p_inicio time default null,
  p_fim time default null, p_descricao text default null
) returns text
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_permuta public.permutas_servico%rowtype;
  v_estado_novo text := 'AGUARDANDO_CONFIRMACAO';
  v_manifestacoes integer;
  v_confirmacoes integer;
begin
  select * into v_permuta from public.permutas_servico where id = p_permuta_id for update;
  if not found or v_permuta.status <> 'AGUARDANDO_CONFIRMACAO' then
    raise exception using errcode = '40001', message = 'A permuta não está aguardando confirmação.';
  end if;
  if p_ator_id not in (v_permuta.solicitante_id, v_permuta.destinatario_id) then
    raise exception using errcode = '42501', message = 'Somente os policiais envolvidos podem confirmar esta permuta.';
  end if;
  if exists (select 1 from public.permutas_servico_confirmacoes where permuta_id = p_permuta_id and policial_id = p_ator_id) then
    raise exception using errcode = '23505', message = 'Este policial já confirmou a permuta.';
  end if;
  if v_permuta.tipo = 'TROCA_RECIPROCA' and p_ator_id = v_permuta.destinatario_id
    and not exists (select 1 from public.permutas_servico_manifestacoes where permuta_id = p_permuta_id and policial_id = p_ator_id) then
    if p_data is null or length(btrim(coalesce(p_turno, ''))) not between 1 and 80
      or p_inicio is null or p_fim is null or p_inicio = p_fim
      or length(btrim(coalesce(p_descricao, ''))) not between 1 and 500 then
      raise exception using errcode = '22023', message = 'Informe data, turno, horário e descrição da manifestação recíproca.';
    end if;
    perform public.permutas_servico_bloquear_policial_v1(array[v_permuta.solicitante_id, v_permuta.destinatario_id]);
    if public.permutas_servico_conflito_v1(p_ator_id, p_data, p_inicio, p_fim)
      or public.permutas_servico_conflito_v1(v_permuta.solicitante_id, p_data, p_inicio, p_fim) then
      raise exception using errcode = '23505', message = 'Há conflito de horário com outra permuta ativa.';
    end if;
    insert into public.permutas_servico_manifestacoes
      (permuta_id, policial_id, substituto_id, origem_servico, data_servico, turno, horario_inicio, horario_fim, descricao)
      values (p_permuta_id, p_ator_id, v_permuta.solicitante_id, 'informado', p_data, btrim(p_turno), p_inicio, p_fim, btrim(p_descricao));
    insert into public.permutas_servico_historico
      (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo)
      values (p_permuta_id, p_ator_id, 'MANIFESTACAO', v_permuta.status, v_permuta.status);
  end if;
  insert into public.permutas_servico_confirmacoes (permuta_id, policial_id)
    values (p_permuta_id, p_ator_id);
  select count(*) into v_manifestacoes from public.permutas_servico_manifestacoes where permuta_id = p_permuta_id;
  select count(*) into v_confirmacoes from public.permutas_servico_confirmacoes where permuta_id = p_permuta_id;
  if v_confirmacoes = 2 and v_manifestacoes = (case when v_permuta.tipo = 'TROCA_RECIPROCA' then 2 else 1 end) then
    v_estado_novo := 'AGUARDANDO_ANALISE';
  end if;
  update public.permutas_servico set status = v_estado_novo, atualizada_em = clock_timestamp()
    where id = p_permuta_id;
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo)
    values (p_permuta_id, p_ator_id, 'CONFIRMADA', v_permuta.status, v_estado_novo);
  return v_estado_novo;
end;
$$;

create or replace function public.permutas_servico_decidir_v1(
  p_permuta_id uuid, p_ator_id uuid, p_deferir boolean, p_justificativa text,
  p_servicos_conferidos boolean
) returns text
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_permuta public.permutas_servico%rowtype;
  v_novo text;
begin
  select * into v_permuta from public.permutas_servico where id = p_permuta_id for update;
  if not found or v_permuta.status <> 'AGUARDANDO_ANALISE' then
    raise exception using errcode = '40001', message = 'A permuta não está aguardando análise.';
  end if;
  if length(btrim(coalesce(p_justificativa, ''))) not between 1 and 3000 then
    raise exception using errcode = '22023', message = 'Informe a justificativa ou observação da decisão.';
  end if;
  if p_servicos_conferidos is distinct from true then
    raise exception using errcode = '22023', message = 'Confirme que os serviços foram conferidos antes da decisão.';
  end if;
  v_novo := case when p_deferir then 'DEFERIDA' else 'INDEFERIDA' end;
  update public.permutas_servico set status = v_novo, atualizada_em = clock_timestamp() where id = p_permuta_id;
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo, justificativa, servicos_conferidos)
    values (p_permuta_id, p_ator_id, v_novo, v_permuta.status, v_novo, btrim(p_justificativa), p_servicos_conferidos);
  return v_novo;
end;
$$;

create or replace function public.permutas_servico_cancelar_v1(
  p_permuta_id uuid, p_ator_id uuid, p_justificativa text
) returns text
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_permuta public.permutas_servico%rowtype;
begin
  select * into v_permuta from public.permutas_servico where id = p_permuta_id for update;
  if not found or v_permuta.status <> 'DEFERIDA' then
    raise exception using errcode = '40001', message = 'Somente uma permuta deferida pode ser cancelada.';
  end if;
  if length(btrim(coalesce(p_justificativa, ''))) not between 1 and 3000 then
    raise exception using errcode = '22023', message = 'Informe a justificativa do cancelamento.';
  end if;
  update public.permutas_servico set status = 'CANCELADA', atualizada_em = clock_timestamp() where id = p_permuta_id;
  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo, justificativa)
    values (p_permuta_id, p_ator_id, 'CANCELADA', 'DEFERIDA', 'CANCELADA', btrim(p_justificativa));
  return 'CANCELADA';
end;
$$;

-- O bloco transacional evita expor funções SECURITY DEFINER com ACL padrão
-- durante a instalação. Revogamos também service_role para remover grants
-- anteriores nos helpers; somente as quatro RPCs chamadas pelo handler ficam acessíveis.
revoke all on function public.permutas_servico_bloquear_policial_v1(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.permutas_servico_conflito_v1(uuid, date, time, time) from public, anon, authenticated, service_role;
revoke all on function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text) from public, anon, authenticated, service_role;
revoke all on function public.permutas_servico_confirmar_v1(uuid, uuid, date, text, time, time, text) from public, anon, authenticated, service_role;
revoke all on function public.permutas_servico_decidir_v1(uuid, uuid, boolean, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.permutas_servico_cancelar_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.permutas_servico_criar_v1(text, uuid, uuid, date, text, time, time, text) to service_role;
grant execute on function public.permutas_servico_confirmar_v1(uuid, uuid, date, text, time, time, text) to service_role;
grant execute on function public.permutas_servico_decidir_v1(uuid, uuid, boolean, text, boolean) to service_role;
grant execute on function public.permutas_servico_cancelar_v1(uuid, uuid, text) to service_role;

commit;
