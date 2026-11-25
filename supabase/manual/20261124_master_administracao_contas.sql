-- Administração de sessões, suspensão e perfil de acesso no Painel Master.
-- Depende das colunas auth_version de public.policiais e
-- public.drso_policiais_externos, adicionadas pela gestão de credenciais.
begin;

do $$
begin
  if to_regclass('public.policiais') is null
     or to_regclass('public.drso_policiais_externos') is null then
    raise exception 'Pré-condição ausente: tabelas de usuários do Log2CIA.';
  end if;
  if to_regprocedure('public.master_administrar_conta_v1(uuid,text,text,text,text)') is not null
     or to_regprocedure('public.master_proteger_ultimo_ativo_v1()') is not null
     or to_regclass('public.master_contas_auditoria') is not null then
    raise exception 'Colisão: objetos de administração de contas já existem.';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute where attrelid in ('public.policiais'::regclass, 'public.drso_policiais_externos'::regclass) and attname = 'conta_suspensa' and not attisdropped) then
    raise exception 'Colisão: conta_suspensa já existe em uma tabela de usuários; revisar sua semântica antes de continuar.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.policiais'::regclass and attname = 'auth_version' and not attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.drso_policiais_externos'::regclass and attname = 'auth_version' and not attisdropped) then
    raise exception 'Pré-condição ausente: auth_version nas duas tabelas de usuários.';
  end if;
end;
$$;

alter table public.policiais
  add column conta_suspensa boolean not null default false;
alter table public.drso_policiais_externos
  add column conta_suspensa boolean not null default false;

create table public.master_contas_auditoria (
  id bigint generated always as identity primary key,
  ator_id uuid not null references public.policiais(id) on delete restrict,
  alvo_origem text not null check (alvo_origem in ('policiais', 'drso_policiais_externos')),
  alvo_id text not null,
  acao text not null check (acao in ('encerrar_sessoes', 'suspender', 'reativar', 'alterar_perfil')),
  perfil_anterior text,
  perfil_novo text,
  suspensao_anterior boolean not null,
  suspensao_nova boolean not null,
  registrado_em timestamptz not null default pg_catalog.clock_timestamp()
);
create index master_contas_auditoria_alvo_idx
  on public.master_contas_auditoria (alvo_origem, alvo_id, registrado_em desc);

alter table public.master_contas_auditoria enable row level security;
revoke all on table public.master_contas_auditoria from public, anon, authenticated, service_role;
revoke all on sequence public.master_contas_auditoria_id_seq from public, anon, authenticated, service_role;

create function public.master_administrar_conta_v1(
  p_ator_id uuid,
  p_origem text,
  p_usuario_id text,
  p_acao text,
  p_novo_role text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ator public.policiais%rowtype;
  v_alvo public.policiais%rowtype;
  v_ator_master boolean;
  v_alvo_master boolean;
  v_suspensa boolean;
  v_suspensa_anterior boolean;
  v_role_anterior text;
  v_role_nova text;
  v_auth_version integer;
  v_masters_ativos integer;
  v_alvo_id text;
begin
  if p_origem is null or p_origem not in ('policiais', 'drso_policiais_externos')
     or nullif(pg_catalog.btrim(p_usuario_id), '') is null
     or p_acao is null or p_acao not in ('encerrar_sessoes', 'suspender', 'reativar', 'alterar_perfil') then
    raise exception using errcode = '22023', message = 'Parâmetros de administração inválidos.';
  end if;

  -- Serializa mudanças de perfil/suspensão para proteger o último Master.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('log2cia:last_master_admin', 0));

  select * into v_ator from public.policiais where id = p_ator_id for share;
  if not found then
    raise exception using errcode = '42501', message = 'Operador não autorizado.';
  end if;
  v_ator_master := pg_catalog.lower(pg_catalog.btrim(coalesce(v_ator.role, ''))) = 'master'
    or coalesce((pg_catalog.to_jsonb(v_ator)->>'is_master')::boolean, false);
  if not v_ator_master or v_ator.conta_suspensa then
    raise exception using errcode = '42501', message = 'Somente Master pode administrar contas.';
  end if;

  if p_origem = 'policiais' then
    select * into v_alvo from public.policiais where id::text = p_usuario_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Conta não encontrada.'; end if;
    v_role_anterior := v_alvo.role;
    v_role_nova := v_alvo.role;
    v_suspensa_anterior := v_alvo.conta_suspensa;
    v_suspensa := v_alvo.conta_suspensa;
    v_alvo_master := pg_catalog.lower(pg_catalog.btrim(coalesce(v_alvo.role, ''))) = 'master'
      or coalesce((pg_catalog.to_jsonb(v_alvo)->>'is_master')::boolean, false);

    if p_acao = 'suspender' then
      if p_usuario_id = p_ator_id::text then
        raise exception using errcode = '42501', message = 'O Master não pode suspender a própria conta.';
      end if;
      if v_alvo_master and not v_suspensa then
        select pg_catalog.count(*) into v_masters_ativos from public.policiais p
        where (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) = 'master'
               or coalesce((pg_catalog.to_jsonb(p)->>'is_master')::boolean, false))
          and not p.conta_suspensa;
        if v_masters_ativos <= 1 then raise exception using errcode = '23514', message = 'Não é permitido suspender o último Master ativo.'; end if;
      end if;
      v_suspensa := true;
    elsif p_acao = 'reativar' then
      v_suspensa := false;
    elsif p_acao = 'alterar_perfil' then
      if p_novo_role is null or p_novo_role not in ('master', 'p4', 'armeiro', 'oficial', 'p1', 'p1_escalante_servico_ordinario', 'policial', 'permanente', 'permanente da guarda') then
        raise exception using errcode = '22023', message = 'Perfil de acesso inválido.';
      end if;
      if coalesce((pg_catalog.to_jsonb(v_alvo)->>'is_master')::boolean, false) and p_novo_role <> 'master' then
        raise exception using errcode = '23514', message = 'Esta conta possui concessão Master adicional e exige revisão cadastral.';
      end if;
      if v_alvo_master and p_novo_role <> 'master' and not v_suspensa then
        select pg_catalog.count(*) into v_masters_ativos from public.policiais p
        where (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) = 'master'
               or coalesce((pg_catalog.to_jsonb(p)->>'is_master')::boolean, false))
          and not p.conta_suspensa;
        if v_masters_ativos <= 1 then raise exception using errcode = '23514', message = 'Não é permitido remover o último Master ativo.'; end if;
      end if;
      v_role_nova := p_novo_role;
    end if;

    update public.policiais
      set role = v_role_nova,
          conta_suspensa = v_suspensa,
          auth_version = coalesce(auth_version, 0) + 1
      where id = v_alvo.id
      returning auth_version into v_auth_version;
  else
    if p_acao = 'alterar_perfil' then
      raise exception using errcode = '22023', message = 'Contas DRSO externas não possuem perfil RBAC do efetivo.';
    end if;
    if p_usuario_id = p_ator_id::text and p_acao = 'suspender' then
      raise exception using errcode = '42501', message = 'O Master não pode suspender a própria conta.';
    end if;
    select id::text, conta_suspensa, auth_version
      into v_alvo_id, v_suspensa_anterior, v_auth_version
      from public.drso_policiais_externos where id::text = p_usuario_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Conta não encontrada.'; end if;
    p_usuario_id := v_alvo_id;
    v_suspensa := case p_acao when 'suspender' then true when 'reativar' then false else v_suspensa_anterior end;
    update public.drso_policiais_externos
      set conta_suspensa = v_suspensa,
          auth_version = coalesce(auth_version, 0) + 1
      where id::text = p_usuario_id
      returning auth_version into v_auth_version;
  end if;

  insert into public.master_contas_auditoria (
    ator_id, alvo_origem, alvo_id, acao, perfil_anterior, perfil_novo,
    suspensao_anterior, suspensao_nova
  ) values (
    p_ator_id, p_origem, p_usuario_id, p_acao, v_role_anterior, v_role_nova,
    v_suspensa_anterior, v_suspensa
  );
  return pg_catalog.jsonb_build_object(
    'id', p_usuario_id, 'origem', p_origem, 'acao', p_acao,
    'role', v_role_nova, 'conta_suspensa', v_suspensa,
    'auth_version', v_auth_version
  );
end;
$$;

create function public.master_proteger_ultimo_ativo_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_master_ativo boolean;
  v_outros_masters integer;
begin
  v_master_ativo := pg_catalog.lower(pg_catalog.btrim(coalesce(old.role, ''))) = 'master'
    or coalesce((pg_catalog.to_jsonb(old)->>'is_master')::boolean, false);
  if not v_master_ativo or old.conta_suspensa then return old; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('log2cia:last_master_admin', 0));
  select pg_catalog.count(*) into v_outros_masters
  from public.policiais p
  where p.id <> old.id
    and not p.conta_suspensa
    and (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role, ''))) = 'master'
         or coalesce((pg_catalog.to_jsonb(p)->>'is_master')::boolean, false));
  if v_outros_masters = 0 then
    raise exception using errcode = '23514', message = 'Não é permitido excluir o último Master ativo.';
  end if;
  return old;
end;
$$;

revoke all on function public.master_proteger_ultimo_ativo_v1()
  from public, anon, authenticated, service_role;
create trigger policiais_proteger_ultimo_master_ativo
  before delete on public.policiais
  for each row execute function public.master_proteger_ultimo_ativo_v1();

revoke all on function public.master_administrar_conta_v1(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.master_administrar_conta_v1(uuid,text,text,text,text)
  to service_role;

commit;
