\set ON_ERROR_STOP on

set role service_role;
select public.master_administrar_conta_v1(
  '10000000-0000-4000-8000-000000000010', 'policiais',
  '10000000-0000-4000-8000-000000000005', 'suspender', null
);
reset role;

do $$
begin
  if not (select conta_suspensa from public.policiais where id = '10000000-0000-4000-8000-000000000005') then raise exception 'suspensão não foi registrada'; end if;
  if (select auth_version from public.policiais where id = '10000000-0000-4000-8000-000000000005') <> 1 then raise exception 'sessões existentes não foram invalidadas ao suspender'; end if;
  if not exists (select 1 from public.master_contas_auditoria where ator_id = '10000000-0000-4000-8000-000000000010' and alvo_id = '10000000-0000-4000-8000-000000000005' and acao = 'suspender' and suspensao_anterior = false and suspensao_nova = true and registrado_em is not null) then raise exception 'auditoria da suspensão incompleta'; end if;
end;
$$;

set role service_role;
select public.master_administrar_conta_v1(
  '10000000-0000-4000-8000-000000000010', 'policiais',
  '10000000-0000-4000-8000-000000000005', 'reativar', null
);
select public.master_administrar_conta_v1(
  '10000000-0000-4000-8000-000000000010', 'policiais',
  '10000000-0000-4000-8000-000000000005', 'encerrar_sessoes', null
);
select public.master_administrar_conta_v1(
  '10000000-0000-4000-8000-000000000010', 'policiais',
  '10000000-0000-4000-8000-000000000001', 'alterar_perfil', 'p1'
);
reset role;

do $$
begin
  if (select conta_suspensa from public.policiais where id = '10000000-0000-4000-8000-000000000005') then raise exception 'reativação não foi registrada'; end if;
  if (select auth_version from public.policiais where id = '10000000-0000-4000-8000-000000000005') <> 3 then raise exception 'reativação/encerramento não invalidou sessões antigas'; end if;
  if not exists (select 1 from public.master_contas_auditoria where ator_id = '10000000-0000-4000-8000-000000000010' and alvo_id = '10000000-0000-4000-8000-000000000005' and acao = 'encerrar_sessoes' and registrado_em is not null) then raise exception 'encerramento de sessões não foi auditado'; end if;
  if (select role from public.policiais where id = '10000000-0000-4000-8000-000000000001') <> 'p1' or (select auth_version from public.policiais where id = '10000000-0000-4000-8000-000000000001') <> 1 then raise exception 'alteração de perfil não foi aplicada e revogada'; end if;
end;
$$;

set role service_role;
select public.master_administrar_conta_v1(
  '10000000-0000-4000-8000-000000000010', 'drso_policiais_externos',
  '20000000-0000-4000-8000-000000000001', 'suspender', null
);
select public.master_administrar_conta_v1(
  '10000000-0000-4000-8000-000000000010', 'drso_policiais_externos',
  '20000000-0000-4000-8000-000000000001', 'reativar', null
);
reset role;

do $$
begin
  if (select conta_suspensa from public.drso_policiais_externos where id = '20000000-0000-4000-8000-000000000001') then raise exception 'reativação de conta externa não foi registrada'; end if;
  if (select auth_version from public.drso_policiais_externos where id = '20000000-0000-4000-8000-000000000001') <> 2 then raise exception 'suspensão/reativação não revogou sessão DRSO'; end if;
  if (select count(*) from public.master_contas_auditoria where alvo_origem = 'drso_policiais_externos' and alvo_id = '20000000-0000-4000-8000-000000000001' and acao in ('suspender', 'reativar')) <> 2 then raise exception 'auditoria das ações DRSO incompleta'; end if;
end;
$$;

set role service_role;
select public.master_administrar_conta_v1('10000000-0000-4000-8000-000000000010', 'policiais', '10000000-0000-4000-8000-000000000008', 'alterar_perfil', 'p1');
select public.master_administrar_conta_v1('10000000-0000-4000-8000-000000000010', 'policiais', '10000000-0000-4000-8000-000000000008', 'alterar_perfil', 'permanente');
reset role;

do $$
begin
  if (select role from public.policiais where id = '10000000-0000-4000-8000-000000000008') <> 'permanente' then raise exception 'perfil permanente preexistente não foi aceito pela gestão'; end if;
  begin
    perform public.master_administrar_conta_v1('10000000-0000-4000-8000-000000000010', 'policiais', '10000000-0000-4000-8000-000000000010', 'alterar_perfil', 'p1');
    raise exception 'a remoção do último Master ativo foi aceita';
  exception when check_violation then null;
  end;
  begin
    perform public.master_administrar_conta_v1('10000000-0000-4000-8000-000000000010', 'policiais', '10000000-0000-4000-8000-000000000010', 'suspender', null);
    raise exception 'autossuspensão foi aceita';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.master_administrar_conta_v1('10000000-0000-4000-8000-000000000003', 'policiais', '10000000-0000-4000-8000-000000000005', 'suspender', null);
    raise exception 'ator não Master foi aceito';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  begin
    delete from public.policiais where id = '10000000-0000-4000-8000-000000000010';
    raise exception 'a exclusão do último Master ativo foi aceita';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.policiais where id = '10000000-0000-4000-8000-000000000010') then
    raise exception 'proteção do último Master não preservou a conta';
  end if;
end;
$$;

set role service_role;
insert into public.banco_horas_solicitacoes (id, policial_id, tipo, status)
values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'inclusao_horas', 'pendente');
reset role;

do $$
begin
  if (select count(*) from public.notificacoes_internas where banco_horas_solicitacao_id = '40000000-0000-4000-8000-000000000001' and tipo = 'BANCO_HORAS_NOVA') <> 4 then raise exception 'nova solicitação não notificou todos os analistas exatamente uma vez'; end if;
  if exists (select 1 from public.notificacoes_internas n where n.banco_horas_solicitacao_id = '40000000-0000-4000-8000-000000000001' and n.destinatario_id not in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000010')) then raise exception 'destinatário não autorizado recebeu aviso'; end if;
end;
$$;

update public.banco_horas_solicitacoes set status = 'deferida' where id = '40000000-0000-4000-8000-000000000001';
update public.banco_horas_solicitacoes set status = 'deferida' where id = '40000000-0000-4000-8000-000000000001';

do $$
begin
  if (select count(*) from public.notificacoes_internas where banco_horas_solicitacao_id = '40000000-0000-4000-8000-000000000001' and tipo = 'BANCO_HORAS_DEFERIDA' and destinatario_id = '10000000-0000-4000-8000-000000000002') <> 1 then raise exception 'decisão não notificou o solicitante uma única vez'; end if;
  if has_function_privilege('anon', 'public.master_administrar_conta_v1(uuid,text,text,text,text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.master_administrar_conta_v1(uuid,text,text,text,text)', 'EXECUTE') or not has_function_privilege('service_role', 'public.master_administrar_conta_v1(uuid,text,text,text,text)', 'EXECUTE') then raise exception 'ACL da RPC administrativa incorreta'; end if;
  if has_function_privilege('anon', 'public.notificacoes_banco_horas_v1()', 'EXECUTE') or has_function_privilege('authenticated', 'public.notificacoes_banco_horas_v1()', 'EXECUTE') or has_function_privilege('service_role', 'public.notificacoes_banco_horas_v1()', 'EXECUTE') then raise exception 'função trigger ficou executável diretamente'; end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.master_contas_auditoria'::regclass) or has_table_privilege('anon', 'public.master_contas_auditoria', 'SELECT') or has_table_privilege('authenticated', 'public.master_contas_auditoria', 'SELECT') then raise exception 'auditoria de contas não está isolada'; end if;
end;
$$;

select 'administração, isolamento, deduplicação e eventos do Banco de Horas: OK' as resultado;
