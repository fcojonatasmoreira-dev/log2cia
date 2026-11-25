#!/usr/bin/env bash
set -euo pipefail

container_name="${1:-log2cia-permutas-pg-test}"
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
imagem="$(podman inspect --format '{{.Config.Image}}' "$container_name")"
modo_rede="$(podman inspect --format '{{.HostConfig.NetworkMode}}' "$container_name")"
portas="$(podman port "$container_name" 5432/tcp 2>/dev/null || true)"

if [[ "$imagem" != *"postgres:17.6" ]]; then
  printf 'Container rejeitado: esperava PostgreSQL 17.6, encontrei %s\n' "$imagem" >&2
  exit 2
fi
if [[ "$modo_rede" != "none" || -n "$portas" ]]; then
  printf 'Container rejeitado: o teste requer rede none e nenhuma porta publicada.\n' >&2
  exit 2
fi

versao_num="$(podman exec "$container_name" psql -U postgres -d postgres -Atqc "select current_setting('server_version_num')::integer")"
if [[ "$versao_num" != "170006" ]]; then
  printf 'Container rejeitado: esperava server_version_num=170006, encontrei %s\n' "$versao_num" >&2
  exit 2
fi

psql_db() {
  local banco="$1"
  shift
  podman exec -i "$container_name" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 "$@"
}

esperar_falha_comando() {
  local banco="$1"
  local comando="$2"
  local mensagem_esperada="$3"
  local saida
  if saida="$(podman exec "$container_name" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 -c "$comando" 2>&1)"; then
    printf 'Falha: o comando restrito terminou com sucesso.\n' >&2
    return 1
  fi
  if [[ "$saida" != *"$mensagem_esperada"* ]]; then
    printf 'Falha: erro de permissão inesperado. Saída:\n%s\n' "$saida" >&2
    return 1
  fi
}

esperar_falha_sql() {
  local banco="$1"
  local arquivo_sql="$2"
  local mensagem_esperada="$3"
  local saida
  if saida="$(psql_db "$banco" < "$arquivo_sql" 2>&1)"; then
    printf 'Falha: migration terminou sem o erro esperado: %s\n' "$mensagem_esperada" >&2
    return 1
  fi
  if [[ "$saida" != *"$mensagem_esperada"* ]]; then
    printf 'Falha: erro SQL diferente do esperado. Saída:\n%s\n' "$saida" >&2
    return 1
  fi
  printf 'Falha esperada confirmada; verificando rollback transacional.\n'
}

criar_banco_novo() {
  podman exec "$container_name" createdb -U postgres "$1"
}

banco="log2cia_permutas_validation"
criar_banco_novo "$banco"
psql_db "$banco" < "$raiz/tests/postgres/fixture-permutas-schema.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261123_permutas_servico.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261123_permutas_motivo.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas-motivo.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261123_permutas_concordancia_solicitante.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas-auto-confirm.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_permutas_mensagens_decisao.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas-mensagens.sql"
psql_db "$banco" -c "insert into public.permutas_servico (id,tipo,status,solicitante_id,destinatario_id,motivo) values ('80000000-0000-4000-8000-000000000001','SUBSTITUICAO_SIMPLES','AGUARDANDO_ANALISE','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Pendência preexistente');"
psql_db "$banco" < "$raiz/supabase/manual/20261124_notificacoes_permutas.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-notificacoes-permutas.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_permutas_notificacoes_reconciliacao.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-notificacoes-reconciliacao.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_permutas_edicao_solicitante.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas-edicao.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_presenca_master.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-presenca-master.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_permutas_cancelamento_solicitante.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas-cancelamento-solicitante.sql"
psql_db "$banco" < "$raiz/tests/postgres/fixture-admin-bank.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_master_administracao_contas.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261124_notificacoes_banco_horas.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-admin-bank.sql"
psql_db "$banco" < "$raiz/supabase/manual/20261125_permutas_controle_escala.sql"
psql_db "$banco" < "$raiz/tests/postgres/assert-permutas-controle-escala.sql"
esperar_falha_comando "$banco" "set role anon; select * from public.permutas_servico" 'permission denied'
esperar_falha_comando "$banco" "set role authenticated; select public.permutas_servico_criar_v1('SUBSTITUICAO_SIMPLES','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2027-06-01','A','08:00','09:00','Sem acesso','Sem motivo')" 'permission denied'
esperar_falha_comando "$banco" "set role authenticated; select public.permutas_servico_decidir_v2('33333333-3333-4333-8333-333333333333','10000000-0000-4000-8000-000000000003',true,true,null,null,null)" 'permission denied'
esperar_falha_comando "$banco" "set role authenticated; select public.permutas_servico_editar_v1('33333333-3333-4333-8333-333333333333','10000000-0000-4000-8000-000000000001','2026-11-24T15:00:00Z','10000000-0000-4000-8000-000000000002','Motivo','2027-06-01','A','08:00','16:00','Serviço')" 'permission denied'
esperar_falha_comando "$banco" "set role anon; select public.permutas_notificacoes_reconciliar_v1('10000000-0000-4000-8000-000000000003')" 'permission denied'
esperar_falha_comando "$banco" "set role authenticated; select public.presenca_registrar_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003')" 'permission denied'
esperar_falha_comando "$banco" "set role service_role; select public.permutas_servico_bloquear_policial_v1(array['10000000-0000-4000-8000-000000000001'::uuid])" 'permission denied'
printf 'Isolamento direto confirmado: anon/authenticated não leem tabelas nem executam RPCs; service_role não executa helpers internos.\n'

# Duas conexões disputam horários sobrepostos. A primeira segura o advisory
# lock antes da criação para garantir que a segunda aguarde a reserva.
saida_a="$(mktemp /tmp/log2cia-permutas-concorrencia-a.XXXXXX)"
saida_b="$(mktemp /tmp/log2cia-permutas-concorrencia-b.XXXXXX)"
trap 'rm -f "$saida_a" "$saida_b"' EXIT
set +e
podman exec "$container_name" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 -c \
  "set role service_role; begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('permutas:' || '10000000-0000-4000-8000-000000000003'::uuid::text, 0)); select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('permutas:' || '10000000-0000-4000-8000-000000000004'::uuid::text, 0)); select pg_sleep(1); select public.permutas_servico_criar_v1('SUBSTITUICAO_SIMPLES','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','2027-05-01','A','08:00','12:00','Concorrência A','Motivo A'); commit;" > "$saida_a" 2>&1 &
pid_a=$!
sleep 0.2
podman exec "$container_name" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 -c \
  "set role service_role; select public.permutas_servico_criar_v1('SUBSTITUICAO_SIMPLES','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','2027-05-01','B','10:00','14:00','Concorrência B','Motivo B');" > "$saida_b" 2>&1 &
pid_b=$!
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e
if [[ "$status_a" -eq "$status_b" ]]; then
  printf 'Falha no teste concorrente: esperava um sucesso e um conflito.\nA:\n%s\nB:\n%s\n' "$(cat "$saida_a")" "$(cat "$saida_b")" >&2
  exit 1
fi
saida_a_conteudo="$(cat "$saida_a")"
saida_b_conteudo="$(cat "$saida_b")"
if [[ "$status_a" -ne 0 && "$saida_a_conteudo" != *"Há conflito de horário"* ]]; then
  printf 'Primeira conexão falhou inesperadamente:\n%s\n' "$(cat "$saida_a")" >&2
  exit 1
fi
if [[ "$status_b" -ne 0 && "$saida_b_conteudo" != *"Há conflito de horário"* ]]; then
  printf 'Segunda conexão falhou inesperadamente:\n%s\n' "$(cat "$saida_b")" >&2
  exit 1
fi
quantidade="$(podman exec "$container_name" psql -U postgres -d "$banco" -Atqc \
  "select count(distinct p.id) from public.permutas_servico p join public.permutas_servico_manifestacoes m on m.permuta_id=p.id where p.solicitante_id='10000000-0000-4000-8000-000000000003' and m.data_servico='2027-05-01'")"
if [[ "$quantidade" != "1" ]]; then
  printf 'Falha concorrente: esperava exatamente uma permuta ativa criada; encontrei %s.\n' "$quantidade" >&2
  exit 1
fi
printf 'Concorrência confirmada: uma operação reservou o horário e a outra encontrou conflito.\n'

banco_rollback="log2cia_permutas_rollback"
criar_banco_novo "$banco_rollback"
esperar_falha_sql "$banco_rollback" "$raiz/supabase/manual/20261123_permutas_servico.sql" 'relation "public.policiais" does not exist'
psql_db "$banco_rollback" < "$raiz/tests/postgres/assert-permutas-rollback.sql"

banco_rollback_motivo="log2cia_permutas_motivo_rollback"
criar_banco_novo "$banco_rollback_motivo"
psql_db "$banco_rollback_motivo" < "$raiz/tests/postgres/fixture-permutas-schema.sql"
psql_db "$banco_rollback_motivo" < "$raiz/supabase/manual/20261123_permutas_servico.sql"
psql_db "$banco_rollback_motivo" < "$raiz/tests/postgres/prepare-permutas-motivo-rollback.sql"
esperar_falha_sql "$banco_rollback_motivo" "$raiz/supabase/manual/20261123_permutas_motivo.sql" 'cannot drop function'
psql_db "$banco_rollback_motivo" < "$raiz/tests/postgres/assert-permutas-motivo-rollback.sql"

printf 'Validação PostgreSQL 17.6 concluída no container descartável %s.\n' "$container_name"
