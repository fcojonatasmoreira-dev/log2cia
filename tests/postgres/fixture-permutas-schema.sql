\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
create table public.policiais (
  id uuid primary key,
  role text not null,
  status text not null,
  posto_graduacao text not null default 'Soldado',
  is_master boolean not null default false
);
insert into public.policiais (id, role, status) values
  ('10000000-0000-4000-8000-000000000001', 'policial', 'EM ATIVIDADE'),
  ('10000000-0000-4000-8000-000000000002', 'policial', 'EM ATIVIDADE'),
  ('10000000-0000-4000-8000-000000000003', 'oficial', 'EM ATIVIDADE'),
  ('10000000-0000-4000-8000-000000000004', 'p1', 'EM ATIVIDADE'),
  ('10000000-0000-4000-8000-000000000005', 'policial', 'EM ATIVIDADE'),
  ('10000000-0000-4000-8000-000000000006', 'policial', 'EM ATIVIDADE'),
  ('10000000-0000-4000-8000-000000000007', 'oficial', 'EM ATIVIDADE');
update public.policiais set is_master = true where id = '10000000-0000-4000-8000-000000000007';
update public.policiais set posto_graduacao = 'Major' where id in ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007');
grant select on public.policiais to service_role;
