-- Permutas de Serviço — mensagens opcionais separadas por destinatário.
-- Incremental e manual. Aplicar após a migration base e antes de publicar
-- o handler que chama permutas_servico_decidir_v2.

begin;

do $$
begin
  if to_regclass('public.permutas_servico_historico') is null then
    raise exception 'Pré-condição ausente: public.permutas_servico_historico';
  end if;
  if to_regprocedure('public.permutas_servico_decidir_v1(uuid,uuid,boolean,text,boolean)') is null then
    raise exception 'Pré-condição ausente: RPC atual public.permutas_servico_decidir_v1';
  end if;
  if to_regprocedure('public.permutas_servico_decidir_v2(uuid,uuid,boolean,boolean,text,text,text)') is not null then
    raise exception 'Colisão: public.permutas_servico_decidir_v2 já existe';
  end if;
  if exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.permutas_servico_historico'::regclass
      and a.attname in ('mensagem_escalante', 'mensagem_policial_1', 'mensagem_policial_2')
      and a.attnum > 0 and not a.attisdropped
  ) or exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.permutas_servico_historico'::regclass
      and c.conname in (
        'permutas_servico_historico_mensagem_escalante_limite',
        'permutas_servico_historico_mensagem_policial_1_limite',
        'permutas_servico_historico_mensagem_policial_2_limite'
      )
  ) then
    raise exception 'Colisão: campos ou constraints de mensagem já existem; revisar manualmente';
  end if;
end;
$$;

alter table public.permutas_servico_historico
  add column mensagem_escalante text,
  add column mensagem_policial_1 text,
  add column mensagem_policial_2 text,
  add constraint permutas_servico_historico_mensagem_escalante_limite
    check (mensagem_escalante is null or char_length(mensagem_escalante) <= 3000),
  add constraint permutas_servico_historico_mensagem_policial_1_limite
    check (mensagem_policial_1 is null or char_length(mensagem_policial_1) <= 3000),
  add constraint permutas_servico_historico_mensagem_policial_2_limite
    check (mensagem_policial_2 is null or char_length(mensagem_policial_2) <= 3000);

create function public.permutas_servico_decidir_v2(
  p_permuta_id uuid,
  p_ator_id uuid,
  p_deferir boolean,
  p_servicos_conferidos boolean,
  p_mensagem_escalante text,
  p_mensagem_policial_1 text,
  p_mensagem_policial_2 text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_permuta public.permutas_servico%rowtype;
  v_novo text;
  v_mensagem_escalante text := nullif(btrim(p_mensagem_escalante), '');
  v_mensagem_policial_1 text := nullif(btrim(p_mensagem_policial_1), '');
  v_mensagem_policial_2 text := nullif(btrim(p_mensagem_policial_2), '');
begin
  select * into v_permuta
  from public.permutas_servico
  where id = p_permuta_id
  for update;

  if not found or v_permuta.status <> 'AGUARDANDO_ANALISE' then
    raise exception using errcode = '40001', message = 'A permuta não está aguardando análise.';
  end if;
  if p_ator_id is null then
    raise exception using errcode = '22023', message = 'Responsável pela decisão inválido.';
  end if;
  if p_deferir is null then
    raise exception using errcode = '22023', message = 'Tipo de decisão inválido.';
  end if;
  if p_servicos_conferidos is distinct from true then
    raise exception using errcode = '22023', message = 'Confirme que os serviços foram conferidos antes da decisão.';
  end if;
  if char_length(coalesce(v_mensagem_escalante, '')) > 3000
    or char_length(coalesce(v_mensagem_policial_1, '')) > 3000
    or char_length(coalesce(v_mensagem_policial_2, '')) > 3000 then
    raise exception using errcode = '22023', message = 'As mensagens devem ter até 3000 caracteres cada.';
  end if;

  v_novo := case when p_deferir then 'DEFERIDA' else 'INDEFERIDA' end;
  update public.permutas_servico
  set status = v_novo, atualizada_em = clock_timestamp()
  where id = p_permuta_id;

  insert into public.permutas_servico_historico
    (permuta_id, ator_id, tipo_evento, estado_anterior, estado_novo,
     servicos_conferidos, mensagem_escalante, mensagem_policial_1, mensagem_policial_2)
  values
    (p_permuta_id, p_ator_id, v_novo, v_permuta.status, v_novo,
     p_servicos_conferidos, v_mensagem_escalante, v_mensagem_policial_1, v_mensagem_policial_2);

  return v_novo;
end;
$$;

revoke all on function public.permutas_servico_decidir_v2(uuid, uuid, boolean, boolean, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.permutas_servico_decidir_v2(uuid, uuid, boolean, boolean, text, text, text)
  to service_role;

commit;
