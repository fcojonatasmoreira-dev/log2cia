\set ON_ERROR_STOP on
begin;

insert into public.permutas_servico (id,tipo,status,solicitante_id,destinatario_id,motivo) values
 ('90000000-0000-4000-8000-000000000001','SUBSTITUICAO_SIMPLES','AGUARDANDO_ANALISE','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','fixture escala simples'),
 ('90000000-0000-4000-8000-000000000002','TROCA_RECIPROCA','AGUARDANDO_ANALISE','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','fixture escala recíproca'),
 ('90000000-0000-4000-8000-000000000003','SUBSTITUICAO_SIMPLES','AGUARDANDO_ANALISE','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','fixture cancelamento');
insert into public.permutas_servico_manifestacoes
 (id,permuta_id,policial_id,substituto_id,data_servico,turno,horario_inicio,horario_fim,descricao) values
 ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-12-01','A','08:00','16:00','Serviço simples'),
 ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-12-02','A','08:00','16:00','Serviço recíproco 1'),
 ('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','2026-12-03','B','20:00','06:00','Serviço noturno recíproco'),
 ('91000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-12-04','C','08:00','16:00','Serviço cancelado');
update public.permutas_servico set status='DEFERIDA' where id in (
 '90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003');

do $$ begin
  if (select count(*) from public.permutas_servico_escala where permuta_id='90000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Substituição simples não gerou um serviço.'; end if;
  if (select count(*) from public.permutas_servico_escala where permuta_id='90000000-0000-4000-8000-000000000002') <> 2 then raise exception 'Troca recíproca não gerou dois serviços.'; end if;
  if (select count(distinct m.data_servico) from public.permutas_servico_escala e join public.permutas_servico_manifestacoes m on m.id=e.manifestacao_id where e.permuta_id='90000000-0000-4000-8000-000000000002') <> 2 then raise exception 'Datas distintas da troca não foram preservadas.'; end if;
end $$;

set local role service_role;
select public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000004','APLICAR');
savepoint rollback_scale;
select public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000004','REABRIR');
rollback to savepoint rollback_scale;
release savepoint rollback_scale;
select public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000004','REABRIR');
select public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001'),'10000000-0000-4000-8000-000000000004','APLICAR');

do $$ begin
  if (select count(*) from public.permutas_servico_escala_historico h join public.permutas_servico_escala e on e.id=h.escala_id where e.manifestacao_id='91000000-0000-4000-8000-000000000001' and h.ator_id='10000000-0000-4000-8000-000000000004' and h.acao in ('APLICADA','REABERTA')) <> 3 then raise exception 'Responsável ou histórico das transições não foi registrado.'; end if;
  if (select count(*) from public.notificacoes_internas where escala_id=(select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001') and tipo='PERMUTA_ESCALA_APLICADA') <> 4 then raise exception 'Reaplicação não gerou um aviso por participante e transição.'; end if;
  if (select count(*) from public.notificacoes_internas where escala_id=(select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001') and tipo='PERMUTA_ESCALA_REABERTA') <> 2 then raise exception 'Rollback deixou notificação adicional de reabertura.'; end if;
  if (select status from public.permutas_servico where id='90000000-0000-4000-8000-000000000001') <> 'DEFERIDA' then raise exception 'Atualização operacional alterou a decisão administrativa.'; end if;
  if (select situacao from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000001') <> 'APLICADA_NA_ESCALA' then raise exception 'Rollback restaurou incorretamente a marcação da escala.'; end if;
end $$;

-- O cancelamento preserva o deferimento e converte somente o serviço aplicado
-- em revisão necessária; os demais registros operacionais permanecem intactos.
select public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000004'),'10000000-0000-4000-8000-000000000004','APLICAR');
insert into public.permutas_servico_historico (permuta_id,ator_id,tipo_evento,estado_anterior,estado_novo,justificativa)
values ('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','CANCELADA','DEFERIDA','CANCELADA','cancelamento fixture');
update public.permutas_servico set status='CANCELADA' where id='90000000-0000-4000-8000-000000000003';
do $$ begin
  if (select situacao from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000004') <> 'REVISAO_NECESSARIA' then raise exception 'Cancelamento aplicado não gerou revisão necessária.'; end if;
  if (select count(*) from public.permutas_servico_escala_historico where permuta_id='90000000-0000-4000-8000-000000000003' and acao='REVISAO_NECESSARIA') <> 1 then raise exception 'Histórico de revisão após cancelamento ausente.'; end if;
end $$;
do $$ begin
  begin
    perform public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000004'),'10000000-0000-4000-8000-000000000004','APLICAR');
    raise exception 'Transição inválida foi aceita.';
  exception when sqlstate '40001' then null;
  end;
end $$;
select public.permutas_servico_escala_atualizar_v1((select id from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000004'),'10000000-0000-4000-8000-000000000004','CONCLUIR_REVISAO');
do $$ begin
  if (select situacao from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000004') <> 'REVISAO_NECESSARIA' or (select revisao_concluida_em from public.permutas_servico_escala where manifestacao_id='91000000-0000-4000-8000-000000000004') is null then raise exception 'Conclusão da revisão não foi registrada.'; end if;
  if (select count(*) from public.permutas_servico_escala_historico where permuta_id='90000000-0000-4000-8000-000000000003' and acao='REVISAO_CONCLUIDA') <> 1 then raise exception 'Histórico da revisão concluída ausente.'; end if;
end $$;
insert into public.permutas_servico_historico (permuta_id,ator_id,tipo_evento,estado_anterior,estado_novo,justificativa)
values ('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','CANCELADA','DEFERIDA','CANCELADA','cancelamento pendente');
update public.permutas_servico set status='CANCELADA' where id='90000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.permutas_servico_escala where permuta_id='90000000-0000-4000-8000-000000000002' and encerrada_em is not null and situacao='PENDENTE_NA_ESCALA') <> 2 then raise exception 'Cancelamento de pendências não preservou os registros encerrados sem aplicação.'; end if;
  if (select count(*) from public.permutas_servico_escala where permuta_id='90000000-0000-4000-8000-000000000002') <> 2 then raise exception 'Cancelamento removeu o histórico operacional.'; end if;
end $$;
reset role;

do $$ begin
  if not has_function_privilege('service_role','public.permutas_servico_escala_atualizar_v1(uuid,uuid,text)','EXECUTE') then raise exception 'service_role sem EXECUTE na RPC.'; end if;
  if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.permutas_servico_escala_atualizar_v1(uuid,uuid,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') or has_function_privilege('anon','public.permutas_servico_escala_atualizar_v1(uuid,uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.permutas_servico_escala_atualizar_v1(uuid,uuid,text)','EXECUTE') then raise exception 'RPC exposta a role não autorizada.'; end if;
  if not (select relrowsecurity from pg_class where oid='public.permutas_servico_escala'::regclass) then raise exception 'RLS desabilitado na tabela operacional.'; end if;
  if has_table_privilege('anon','public.permutas_servico_escala','SELECT') or has_table_privilege('authenticated','public.permutas_servico_escala','SELECT') or exists (select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.permutas_servico_escala'::regclass and a.grantee=0 and a.privilege_type='SELECT') then raise exception 'Tabela operacional exposta diretamente.'; end if;
  if not has_table_privilege('service_role','public.permutas_servico_escala','SELECT') then raise exception 'service_role sem leitura da tabela operacional.'; end if;
end $$;
rollback;
