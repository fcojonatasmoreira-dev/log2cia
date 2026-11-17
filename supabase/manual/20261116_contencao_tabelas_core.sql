-- Contenção de acesso direto pelo navegador às tabelas centrais.
-- NÃO EXECUTAR em produção sem autorização e validação após publicar o gateway.
-- Executar como proprietário das quatro tabelas ou superusuário. O papel
-- service_role precisa existir e ter BYPASSRLS para manter as APIs operacionais.
-- Este script não remove policies existentes nem altera dados ou schema funcional.

begin;

do $$
declare
  tabela text;
  tabela_oid oid;
  service_bypass boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'Papéis anon, authenticated e service_role devem existir';
  end if;

  select rolbypassrls into service_bypass
  from pg_roles where rolname = 'service_role';
  if service_bypass is distinct from true then
    raise exception 'service_role não possui BYPASSRLS; interrompendo para evitar indisponibilidade das APIs';
  end if;

  foreach tabela in array array['policiais', 'equipamentos', 'cautelas', 'cautela_itens'] loop
    tabela_oid := to_regclass(format('public.%I', tabela));
    if tabela_oid is null then
      raise exception 'Tabela public.% não encontrada', tabela;
    end if;
    if not (select rolsuper from pg_roles where rolname = current_user)
       and not exists (
         select 1 from pg_class
         where oid = tabela_oid
           and relowner = (select oid from pg_roles where rolname = current_user)
       ) then
      raise exception 'Execute como proprietário de public.% ou superusuário', tabela;
    end if;
  end loop;
end;
$$;

revoke all privileges on table
  public.policiais,
  public.equipamentos,
  public.cautelas,
  public.cautela_itens
from public, anon, authenticated;

grant all privileges on table
  public.policiais,
  public.equipamentos,
  public.cautelas,
  public.cautela_itens
to service_role;

alter table public.policiais enable row level security;
alter table public.equipamentos enable row level security;
alter table public.cautelas enable row level security;
alter table public.cautela_itens enable row level security;

do $$
declare
  tabela text;
  sequencia record;
begin
  foreach tabela in array array['policiais', 'equipamentos', 'cautelas', 'cautela_itens'] loop
    for sequencia in
      select seq_ns.nspname as schema_nome, seq.relname as sequencia_nome
      from pg_class seq
      join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
      join pg_depend dep on dep.objid = seq.oid and dep.deptype in ('a', 'i')
      join pg_class tbl on tbl.oid = dep.refobjid
      where seq.relkind = 'S'
        and tbl.oid = to_regclass(format('public.%I', tabela))
    loop
      execute format(
        'revoke all privileges on sequence %I.%I from public, anon, authenticated',
        sequencia.schema_nome,
        sequencia.sequencia_nome
      );
      execute format(
        'grant usage, select on sequence %I.%I to service_role',
        sequencia.schema_nome,
        sequencia.sequencia_nome
      );
    end loop;
  end loop;
end;
$$;

commit;
