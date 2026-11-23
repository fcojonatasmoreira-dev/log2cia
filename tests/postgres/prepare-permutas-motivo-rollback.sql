\set ON_ERROR_STOP on
create view public.dependencia_rpg_permutas_criar as
select public.permutas_servico_criar_v1(
  'SUBSTITUICAO_SIMPLES',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '2027-11-01', 'A', '08:00', '12:00', 'Serviço legado'
) as id;
