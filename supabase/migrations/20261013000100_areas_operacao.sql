create table public.macroareas_operacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.microareas_operacao (
  id uuid primary key default gen_random_uuid(),
  macroarea_id uuid not null references public.macroareas_operacao(id) on delete restrict,
  nome text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_microareas_operacao_macroarea_id
  on public.microareas_operacao(macroarea_id);

alter table public.viaturas
  add column macroarea_id uuid references public.macroareas_operacao(id) on delete set null;

create index idx_viaturas_macroarea_id
  on public.viaturas(macroarea_id);

update public.viaturas
set area_operacao = null
where area_operacao is not null;

alter table public.macroareas_operacao enable row level security;
alter table public.microareas_operacao enable row level security;
alter table public.livros_permanencia enable row level security;
alter table public.livro_viaturas enable row level security;
alter table public.livro_ocorrencias enable row level security;

drop policy if exists "Permitir atualização para usuários autenticados em livros_pe"
  on public.livros_permanencia;
drop policy if exists "Permitir inserção para usuários autenticados em livros_perma"
  on public.livros_permanencia;
drop policy if exists "Permitir leitura para usuários autenticados em livros_permanen"
  on public.livros_permanencia;
drop policy if exists "Permitir gerenciar livro_viaturas"
  on public.livro_viaturas;
drop policy if exists "Permitir gerenciar livro_ocorrencias"
  on public.livro_ocorrencias;

revoke all on public.macroareas_operacao from public, anon, authenticated;
revoke all on public.microareas_operacao from public, anon, authenticated;
revoke all on public.livros_permanencia from public, anon, authenticated;
revoke all on public.livro_viaturas from public, anon, authenticated;
revoke all on public.livro_ocorrencias from public, anon, authenticated;
grant all on public.macroareas_operacao to service_role;
grant all on public.microareas_operacao to service_role;
grant all on public.livros_permanencia to service_role;
grant all on public.livro_viaturas to service_role;
grant all on public.livro_ocorrencias to service_role;

create or replace function public.atualizar_updated_at_areas_operacao()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_macroareas_operacao_updated_at
before update on public.macroareas_operacao
for each row
execute function public.atualizar_updated_at_areas_operacao();

create trigger trg_microareas_operacao_updated_at
before update on public.microareas_operacao
for each row
execute function public.atualizar_updated_at_areas_operacao();

create or replace function public.validar_microarea_macroarea_ativa()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  macroarea_ativa boolean;
begin
  if new.ativa is not true then
    return new;
  end if;

  select ativa into macroarea_ativa
  from public.macroareas_operacao
  where id = new.macroarea_id
  for update;

  if macroarea_ativa is distinct from true then
    raise exception 'A microárea só pode ficar ativa sob uma macroárea ativa.';
  end if;

  return new;
end;
$$;

create trigger trg_validar_microarea_macroarea_ativa
before insert or update of ativa, macroarea_id on public.microareas_operacao
for each row
execute function public.validar_microarea_macroarea_ativa();

create or replace function public.desvincular_viaturas_macroarea_inativa()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.ativa is true and new.ativa is false then
    update public.viaturas
    set macroarea_id = null,
        area_operacao = null,
        atualizado_em = now()
    where macroarea_id = new.id;
  end if;

  return new;
end;
$$;

create trigger trg_desvincular_viaturas_macroarea_inativa
after update of ativa on public.macroareas_operacao
for each row
when (old.ativa is distinct from new.ativa)
execute function public.desvincular_viaturas_macroarea_inativa();

create or replace function public.validar_macroarea_viatura_ativa()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  macroarea_ativa boolean;
begin
  if new.macroarea_id is null then
    return new;
  end if;

  select ativa into macroarea_ativa
  from public.macroareas_operacao
  where id = new.macroarea_id
  for update;

  if macroarea_ativa is distinct from true then
    raise exception 'A macroárea da viatura não está ativa.';
  end if;

  return new;
end;
$$;

create trigger trg_validar_macroarea_viatura_ativa
before insert or update of macroarea_id on public.viaturas
for each row
execute function public.validar_macroarea_viatura_ativa();
