\set ON_ERROR_STOP on
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'permutas_servico' and column_name = 'motivo'
  ) then raise exception 'rollback deixou a coluna motivo parcialmente criada'; end if;
  if to_regprocedure('public.permutas_servico_criar_v1(text,uuid,uuid,date,text,time,time,text)') is null then
    raise exception 'rollback removeu a assinatura original da RPC';
  end if;
end $$;
