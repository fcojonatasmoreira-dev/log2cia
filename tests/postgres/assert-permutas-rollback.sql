\set ON_ERROR_STOP on
do $$
begin
  if to_regclass('public.permutas_servico') is not null
    or to_regclass('public.permutas_servico_manifestacoes') is not null
    or to_regclass('public.permutas_servico_historico_id_seq') is not null
    or to_regprocedure('public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)') is not null then
    raise exception 'a migration deixou objetos parciais após falhar';
  end if;
end $$;
