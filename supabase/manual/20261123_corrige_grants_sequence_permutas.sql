-- Correção pontual dos privilégios da sequência do histórico de Permutas.
-- Remove acesso de PUBLIC, anon e authenticated; preserva service_role,
-- proprietário e todos os demais objetos/privilégios.

BEGIN;

REVOKE ALL PRIVILEGES
  ON SEQUENCE public.permutas_servico_historico_id_seq
  FROM PUBLIC, anon, authenticated;

COMMIT;
