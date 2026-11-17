#!/usr/bin/env bash
set -euo pipefail

container_name="${1:-log2cia-pg176-test}"
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
cred_sql="$raiz/supabase/manual/20261116_gestao_credenciais_master.sql"
contencao_sql="$raiz/supabase/manual/20261116_contencao_tabelas_core.sql"
fixture="$raiz/tests/postgres"

imagem="$(podman inspect --format '{{.Config.Image}}' "$container_name")"
if [[ "$imagem" != *"postgres:17.6" ]]; then
  printf 'Container rejeitado: esperava imagem PostgreSQL 17.6, encontrei %s\n' "$imagem" >&2
  exit 2
fi

portas="$(podman port "$container_name" 5432/tcp)"
if [[ "$portas" != *"127.0.0.1:55432" || "$portas" == *"0.0.0.0"* ]]; then
  printf 'Container rejeitado: a porta 5432 deve estar publicada somente em 127.0.0.1:55432.\n' >&2
  exit 2
fi

versao_num="$(podman exec "$container_name" psql -U postgres -d postgres -Atqc "select current_setting('server_version_num')::integer")"
if [[ "$versao_num" != "170006" ]]; then
  printf 'Container rejeitado: esperava PostgreSQL 17.6 (server_version_num=170006), encontrei %s\n' "$versao_num" >&2
  exit 2
fi
host_trust="$(podman exec "$container_name" psql -U postgres -d postgres -Atqc \
  "select count(*) from pg_hba_file_rules where type like 'host%' and auth_method = 'trust'")"
if [[ "$host_trust" != "0" ]]; then
  printf 'Container rejeitado: conexões TCP não podem usar autenticação trust.\n' >&2
  exit 2
fi

psql_db() {
  local banco="$1"
  shift
  podman exec -i "$container_name" psql -U postgres -d "$banco" -v ON_ERROR_STOP=1 "$@"
}

esperar_falha_sql() {
  local banco="$1"
  local arquivo_sql="$2"
  local mensagem_esperada="$3"
  local contexto="$4"
  local saida
  local codigo_saida

  if saida="$(psql_db "$banco" < "$arquivo_sql" 2>&1)"; then
    printf 'Falha: %s terminou com código zero; era esperado erro: %s\n' \
      "$contexto" "$mensagem_esperada" >&2
    return 1
  else
    codigo_saida=$?
  fi

  if [[ "$codigo_saida" -eq 0 ]]; then
    printf 'Falha: %s não retornou código diferente de zero.\n' "$contexto" >&2
    return 1
  fi
  if [[ "$saida" != *"$mensagem_esperada"* ]]; then
    printf 'Falha: %s retornou erro inesperado (código %s). Saída:\n%s\n' \
      "$contexto" "$codigo_saida" "$saida" >&2
    return 1
  fi

  printf 'Falha esperada confirmada em %s (código %s).\n' "$contexto" "$codigo_saida"
}

criar_banco_novo() {
  local banco="$1"
  podman exec "$container_name" createdb -U postgres "$banco"
}

# Cria bancos novos, sem apagar ou reutilizar bancos. Rode em container limpo.
criar_banco_novo log2cia_migration_test
psql_db log2cia_migration_test < "$fixture/fixture-schema.sql"
psql_db log2cia_migration_test < "$cred_sql"
psql_db log2cia_migration_test < "$fixture/assert-credentials.sql"

# Preflight da contenção precisa falhar antes de qualquer REVOKE/ALTER.
podman exec "$container_name" psql -U postgres -d log2cia_migration_test -v ON_ERROR_STOP=1 \
  -c 'ALTER ROLE service_role NOBYPASSRLS'
esperar_falha_sql log2cia_migration_test "$contencao_sql" \
  'service_role não possui BYPASSRLS; interrompendo para evitar indisponibilidade das APIs' \
  'preflight da contenção sem BYPASSRLS'
psql_db log2cia_migration_test < "$fixture/assert-preflight-rollback.sql"
podman exec "$container_name" psql -U postgres -d log2cia_migration_test -v ON_ERROR_STOP=1 \
  -c 'ALTER ROLE service_role BYPASSRLS'

psql_db log2cia_migration_test < "$contencao_sql"
psql_db log2cia_migration_test < "$fixture/assert-containment.sql"

# Testa atomicidade da migration em outro banco, preparado para falhar no GRANT
# da sequence de auditoria. A conexão encerra a transação abortada ao sair.
criar_banco_novo log2cia_migration_rollback_test
psql_db log2cia_migration_rollback_test < "$fixture/fixture-atomic-failure.sql"
esperar_falha_sql log2cia_migration_rollback_test "$cred_sql" \
  'relation "public.credential_audit_events_id_seq" does not exist' \
  'migration de credenciais no fixture sem sequence'
psql_db log2cia_migration_rollback_test < "$fixture/assert-atomic-failure.sql"

printf 'Testes PostgreSQL 17.6 concluídos no container descartável %s.\n' "$container_name"
