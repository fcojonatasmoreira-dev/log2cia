\set ON_ERROR_STOP on

alter table public.policiais add column auth_version integer not null default 0;
create table public.drso_policiais_externos (
  id uuid primary key,
  auth_version integer not null default 0,
  ativo boolean not null default true
);
insert into public.drso_policiais_externos (id) values ('20000000-0000-4000-8000-000000000001');

update public.policiais set role = 'policial', is_master = false
where id = '10000000-0000-4000-8000-000000000007';
insert into public.policiais (id, role, status, posto_graduacao)
values
  ('10000000-0000-4000-8000-000000000008', 'master', 'EM ATIVIDADE', 'Major'),
  ('10000000-0000-4000-8000-000000000010', 'master', 'EM ATIVIDADE', 'Major');

create table public.banco_horas_solicitacoes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  policial_id uuid not null references public.policiais(id),
  tipo text not null,
  status text not null default 'pendente'
);
grant select, insert, update on public.banco_horas_solicitacoes to service_role;
