-- Controle operacional da atualização de serviços de Permutas na escala.
-- Aplicar manualmente após as migrations base, notificações e cancelamento.
begin;

do $$
begin
  if to_regclass('public.permutas_servico') is null
    or to_regclass('public.permutas_servico_manifestacoes') is null
    or to_regclass('public.permutas_servico_historico') is null
    or to_regclass('public.notificacoes_internas') is null
    or to_regclass('public.policiais') is null then
    raise exception 'Pré-condições ausentes para o Controle de Escala de Permutas.';
  end if;
  if to_regclass('public.permutas_servico_escala') is not null
    or to_regclass('public.permutas_servico_escala_historico') is not null
    or to_regprocedure('public.permutas_servico_escala_atualizar_v1(uuid,uuid,text)') is not null then
    raise exception 'Colisão com objetos do Controle de Escala; revisar manualmente.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.notificacoes_internas'::regclass and attname='tipo' and not attisdropped)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.notificacoes_internas'::regclass and attname='permuta_id' and not attisdropped)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.notificacoes_internas'::regclass and attname='destinatario_id' and not attisdropped)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.permutas_servico'::regclass and attname='status' and not attisdropped) then
    raise exception 'Estrutura incompatível nas tabelas de Permutas ou notificações.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.notificacoes_internas'::regclass and attname='banco_horas_solicitacao_id' and not attisdropped) then
    raise exception 'Dependência ausente: aplique 20261124_notificacoes_banco_horas.sql antes do Controle de Escala.';
  end if;
  if to_regprocedure('public.permutas_servico_cancelar_v1(uuid,uuid,text)') is null
    or pg_catalog.pg_get_functiondef('public.permutas_servico_cancelar_v1(uuid,uuid,text)'::regprocedure) not ilike '%AGUARDANDO_CONFIRMACAO%' then
    raise exception 'Dependência ausente: aplique 20261124_permutas_cancelamento_solicitante.sql antes do Controle de Escala.';
  end if;
end;
$$;

create table public.permutas_servico_escala (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  manifestacao_id uuid not null unique references public.permutas_servico_manifestacoes(id) on delete restrict,
  permuta_id uuid not null references public.permutas_servico(id) on delete restrict,
  situacao text not null default 'PENDENTE_NA_ESCALA'
    check (situacao in ('PENDENTE_NA_ESCALA','APLICADA_NA_ESCALA','REVISAO_NECESSARIA')),
  criada_em timestamptz not null default pg_catalog.clock_timestamp(),
  atualizada_em timestamptz not null default pg_catalog.clock_timestamp(),
  responsavel_id uuid references public.policiais(id) on delete restrict,
  encerrada_em timestamptz,
  revisao_concluida_em timestamptz
);
create index permutas_servico_escala_situacao_idx on public.permutas_servico_escala (situacao, atualizada_em desc);
create index permutas_servico_escala_permuta_idx on public.permutas_servico_escala (permuta_id);

create table public.permutas_servico_escala_historico (
  id bigint generated always as identity primary key,
  escala_id uuid not null references public.permutas_servico_escala(id) on delete restrict,
  permuta_id uuid not null references public.permutas_servico(id) on delete restrict,
  manifestacao_id uuid not null references public.permutas_servico_manifestacoes(id) on delete restrict,
  ator_id uuid references public.policiais(id) on delete restrict,
  acao text not null check (acao in ('PENDENCIA_CRIADA','APLICADA','REABERTA','REVISAO_NECESSARIA','REVISAO_CONCLUIDA','ENCERRADA_SEM_APLICACAO')),
  situacao_anterior text,
  situacao_nova text not null,
  ocorrido_em timestamptz not null default pg_catalog.clock_timestamp()
);
create index permutas_servico_escala_historico_idx on public.permutas_servico_escala_historico (escala_id, ocorrido_em, id);

alter table public.permutas_servico_escala enable row level security;
alter table public.permutas_servico_escala_historico enable row level security;
revoke all on public.permutas_servico_escala, public.permutas_servico_escala_historico from public, anon, authenticated, service_role;
grant select, insert, update on public.permutas_servico_escala, public.permutas_servico_escala_historico to service_role;
grant usage, select on sequence public.permutas_servico_escala_historico_id_seq to service_role;

-- Permite avisos separados por serviço e por transição, inclusive reaplicações.
alter table public.notificacoes_internas add column escala_id uuid references public.permutas_servico_escala(id) on delete restrict;
alter table public.notificacoes_internas add column evento_chave text;
do $$
declare v_nome text;
begin
  for v_nome in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid='public.notificacoes_internas'::regclass and c.contype='u'
      and (select array_agg(a.attname order by u.ord)
        from unnest(c.conkey) with ordinality u(attnum,ord)
        join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)
        = array['destinatario_id','permuta_id','tipo']::name[]
  loop execute pg_catalog.format('alter table public.notificacoes_internas drop constraint %I', v_nome); end loop;
end;
$$;
create unique index notificacoes_internas_evento_uidx on public.notificacoes_internas (destinatario_id, evento_chave) where evento_chave is not null;
create unique index notificacoes_internas_legadas_uidx on public.notificacoes_internas (destinatario_id, permuta_id, tipo) where evento_chave is null;
do $$
declare v_nome text;
begin
  for v_nome in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid='public.notificacoes_internas'::regclass and c.contype='c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop execute pg_catalog.format('alter table public.notificacoes_internas drop constraint %I', v_nome); end loop;
end;
$$;
alter table public.notificacoes_internas add constraint notificacoes_internas_tipo_check check (tipo in (
  'PERMUTA_RECEBIDA','PERMUTA_AGUARDANDO_ANALISE','PERMUTA_DEFERIDA','PERMUTA_INDEFERIDA','PERMUTA_CANCELADA',
  'BANCO_HORAS_NOVA','BANCO_HORAS_DEFERIDA','BANCO_HORAS_INDEFERIDA',
  'PERMUTA_ESCALA_APLICADA','PERMUTA_ESCALA_REABERTA','PERMUTA_ESCALA_REVISAO_CONCLUIDA'
));

create function public.permutas_servico_escala_auditar_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_acao text; v_anterior text; v_destinatario uuid; v_key text;
begin
  if tg_op = 'INSERT' then v_acao := 'PENDENCIA_CRIADA'; v_anterior := null;
  else
    v_anterior := old.situacao;
    if old.situacao is not distinct from new.situacao then
      if old.situacao='REVISAO_NECESSARIA' and old.revisao_concluida_em is null and new.revisao_concluida_em is not null then
        v_acao := 'REVISAO_CONCLUIDA';
      else return new;
      end if;
    else
      v_acao := case when new.situacao='APLICADA_NA_ESCALA' then 'APLICADA'
        when new.situacao='PENDENTE_NA_ESCALA' then 'REABERTA'
        when new.situacao='REVISAO_NECESSARIA' then 'REVISAO_NECESSARIA' end;
    end if;
  end if;
  insert into public.permutas_servico_escala_historico
    (escala_id, permuta_id, manifestacao_id, ator_id, acao, situacao_anterior, situacao_nova)
  values (new.id, new.permuta_id, new.manifestacao_id, new.responsavel_id, v_acao, v_anterior, new.situacao)
  returning id into v_key;
  if tg_op = 'INSERT' then return new; end if;
  if v_acao in ('APLICADA','REABERTA','REVISAO_CONCLUIDA') then
    for v_destinatario in
      select distinct p.id from public.permutas_servico s
      join public.permutas_servico_manifestacoes m on m.permuta_id=s.id
      join public.policiais p on p.id in (m.policial_id,m.substituto_id)
      where s.id=new.permuta_id and m.id=new.manifestacao_id
    loop
      insert into public.notificacoes_internas (destinatario_id, permuta_id, escala_id, tipo, evento_chave)
      values (v_destinatario, new.permuta_id, new.id,
        case v_acao when 'APLICADA' then 'PERMUTA_ESCALA_APLICADA'
          when 'REABERTA' then 'PERMUTA_ESCALA_REABERTA' else 'PERMUTA_ESCALA_REVISAO_CONCLUIDA' end,
        'ESCALA:' || v_key::text)
      on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$$;
create trigger permutas_servico_escala_auditar_v1 after insert or update on public.permutas_servico_escala
for each row execute function public.permutas_servico_escala_auditar_v1();

create function public.permutas_servico_escala_transicao_permuta_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_manifestacao record;
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status = 'DEFERIDA' then
    for v_manifestacao in select id from public.permutas_servico_manifestacoes where permuta_id=new.id loop
      insert into public.permutas_servico_escala (manifestacao_id, permuta_id)
      values (v_manifestacao.id, new.id) on conflict (manifestacao_id) do nothing;
    end loop;
  end if;
  return new;
end;
$$;
create trigger permutas_servico_escala_criar_pendencias_v1 after update of status on public.permutas_servico
for each row execute function public.permutas_servico_escala_transicao_permuta_v1();

-- A RPC de cancelamento escreve o histórico na mesma transação. O trigger
-- abaixo usa esse registro para distinguir serviços já aplicados dos pendentes.
create function public.permutas_servico_escala_cancelamento_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_escala record; v_nova text;
begin
  if new.tipo_evento <> 'CANCELADA' or new.estado_anterior <> 'DEFERIDA' or new.estado_novo <> 'CANCELADA' then return new; end if;
  for v_escala in select * from public.permutas_servico_escala where permuta_id=new.permuta_id and encerrada_em is null for update loop
    if v_escala.situacao='APLICADA_NA_ESCALA' then
      update public.permutas_servico_escala set situacao='REVISAO_NECESSARIA', responsavel_id=new.ator_id,
        atualizada_em=pg_catalog.clock_timestamp() where id=v_escala.id;
    else
      update public.permutas_servico_escala set encerrada_em=pg_catalog.clock_timestamp(), responsavel_id=new.ator_id,
        atualizada_em=pg_catalog.clock_timestamp() where id=v_escala.id;
      insert into public.permutas_servico_escala_historico
        (escala_id,permuta_id,manifestacao_id,ator_id,acao,situacao_anterior,situacao_nova)
      values (v_escala.id,new.permuta_id,v_escala.manifestacao_id,new.ator_id,'ENCERRADA_SEM_APLICACAO',v_escala.situacao,v_escala.situacao);
    end if;
  end loop;
  return new;
end;
$$;
create trigger permutas_servico_escala_cancelamento_v1 after insert on public.permutas_servico_historico
for each row execute function public.permutas_servico_escala_cancelamento_v1();

create function public.permutas_servico_escala_atualizar_v1(
  p_escala_id uuid, p_ator_id uuid, p_acao text
) returns text language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_escala public.permutas_servico_escala%rowtype; v_role text;
begin
  if p_ator_id is null then raise exception using errcode='42501', message='Responsável operacional inválido.'; end if;
  select pg_catalog.lower(pg_catalog.btrim(coalesce(role,''))) into v_role from public.policiais where id=p_ator_id;
  if not found or v_role not in ('p1','p1_escalante_servico_ordinario','master')
    and not coalesce((select (pg_catalog.to_jsonb(p)->>'is_master')::boolean from public.policiais p where p.id=p_ator_id),false) then
    raise exception using errcode='42501', message='Somente P1 ou Master pode atualizar o Controle de Escala.';
  end if;
  select * into v_escala from public.permutas_servico_escala where id=p_escala_id for update;
  if not found then raise exception using errcode='P0002', message='Serviço do Controle de Escala não encontrado.'; end if;
  if p_acao='APLICAR' and v_escala.situacao='PENDENTE_NA_ESCALA' and v_escala.encerrada_em is null then
    if not exists(select 1 from public.permutas_servico where id=v_escala.permuta_id and status='DEFERIDA') then raise exception using errcode='40001', message='Somente permuta deferida pode ser aplicada à escala.'; end if;
    update public.permutas_servico_escala set situacao='APLICADA_NA_ESCALA',responsavel_id=p_ator_id,encerrada_em=null,atualizada_em=pg_catalog.clock_timestamp() where id=p_escala_id;
  elsif p_acao='REABRIR' and v_escala.situacao='APLICADA_NA_ESCALA' and v_escala.encerrada_em is null then
    if not exists(select 1 from public.permutas_servico where id=v_escala.permuta_id and status='DEFERIDA') then raise exception using errcode='40001', message='Somente serviço de permuta deferida pode ser reaberto.'; end if;
    update public.permutas_servico_escala set situacao='PENDENTE_NA_ESCALA',responsavel_id=p_ator_id,atualizada_em=pg_catalog.clock_timestamp() where id=p_escala_id;
  elsif p_acao='CONCLUIR_REVISAO' and v_escala.situacao='REVISAO_NECESSARIA' and v_escala.revisao_concluida_em is null then
    update public.permutas_servico_escala set revisao_concluida_em=pg_catalog.clock_timestamp(),responsavel_id=p_ator_id,atualizada_em=pg_catalog.clock_timestamp() where id=p_escala_id;
  else raise exception using errcode='40001', message='Transição operacional inválida para a situação atual.';
  end if;
  return (select situacao from public.permutas_servico_escala where id=p_escala_id);
end;
$$;

-- Compatibilidade: substitui o índice único antigo sem alterar as notificações
-- existentes nem o estado de leitura. Eventos legados continuam idempotentes.
create or replace function public.permutas_servico_notificar_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_destinatario uuid; v_tipo text; v_ator_id uuid;
begin
  if tg_op='INSERT' then
    if new.status='AGUARDANDO_CONFIRMACAO' then
      insert into public.notificacoes_internas(destinatario_id,permuta_id,tipo)
      values(new.destinatario_id,new.id,'PERMUTA_RECEBIDA') on conflict do nothing;
    end if; return new;
  end if;
  if old.status is not distinct from new.status then return new; end if;
  v_tipo:=case new.status when 'AGUARDANDO_ANALISE' then 'PERMUTA_AGUARDANDO_ANALISE' when 'DEFERIDA' then 'PERMUTA_DEFERIDA' when 'INDEFERIDA' then 'PERMUTA_INDEFERIDA' when 'CANCELADA' then 'PERMUTA_CANCELADA' else null end;
  if v_tipo is null then return new; end if;
  if new.status='CANCELADA' then
    select h.ator_id into v_ator_id from public.permutas_servico_historico h where h.permuta_id=new.id and h.tipo_evento='CANCELADA' and h.estado_novo='CANCELADA' order by h.ocorrido_em desc,h.id desc limit 1;
    update public.notificacoes_internas n set lida_em=coalesce(n.lida_em,pg_catalog.clock_timestamp()) where n.permuta_id=new.id and n.tipo in ('PERMUTA_RECEBIDA','PERMUTA_AGUARDANDO_ANALISE');
    for v_destinatario in select distinct ids.id from (
      select p.id from public.policiais p where p.id is distinct from v_ator_id and
        ((old.status='AGUARDANDO_ANALISE' and (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role,''))) in ('oficial','master') or pg_catalog.to_jsonb(p)->>'is_master'='true'))
        or (old.status='DEFERIDA' and (pg_catalog.lower(pg_catalog.btrim(coalesce(p.role,''))) in ('p1','p1_escalante_servico_ordinario','master') or pg_catalog.to_jsonb(p)->>'is_master'='true')))
      union all select new.solicitante_id where v_ator_id is distinct from new.solicitante_id
      union all select new.destinatario_id where v_ator_id is distinct from new.destinatario_id) ids loop
      insert into public.notificacoes_internas(destinatario_id,permuta_id,tipo) values(v_destinatario,new.id,v_tipo) on conflict do nothing;
    end loop; return new;
  end if;
  if new.status='AGUARDANDO_ANALISE' then
    for v_destinatario in select distinct p.id from public.policiais p where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role,''))) in ('oficial','master') or pg_catalog.to_jsonb(p)->>'is_master'='true' loop
      insert into public.notificacoes_internas(destinatario_id,permuta_id,tipo) values(v_destinatario,new.id,v_tipo) on conflict do nothing;
    end loop;
  else
    for v_destinatario in select distinct ids.id from (
      select p.id from public.policiais p where pg_catalog.lower(pg_catalog.btrim(coalesce(p.role,''))) in ('p1','p1_escalante_servico_ordinario','master') or pg_catalog.to_jsonb(p)->>'is_master'='true'
      union all select new.solicitante_id union all select new.destinatario_id) ids loop
      insert into public.notificacoes_internas(destinatario_id,permuta_id,tipo) values(v_destinatario,new.id,v_tipo) on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$$;

-- Gera pendências para deferimentos anteriores sem assumir que a escala foi
-- atualizada. A chave única da manifestação torna a reconciliação idempotente.
insert into public.permutas_servico_escala(manifestacao_id,permuta_id)
select m.id,m.permuta_id from public.permutas_servico_manifestacoes m
join public.permutas_servico p on p.id=m.permuta_id and p.status='DEFERIDA'
on conflict (manifestacao_id) do nothing;

revoke all on function public.permutas_servico_escala_auditar_v1() from public,anon,authenticated,service_role;
revoke all on function public.permutas_servico_escala_transicao_permuta_v1() from public,anon,authenticated,service_role;
revoke all on function public.permutas_servico_escala_cancelamento_v1() from public,anon,authenticated,service_role;
revoke all on function public.permutas_servico_escala_atualizar_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.permutas_servico_escala_atualizar_v1(uuid,uuid,text) to service_role;

commit;
