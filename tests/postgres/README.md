# Teste local das migrations em PostgreSQL 17.6

Os arquivos deste diretório contêm somente schema e IDs fictícios. O runner
exige um container já iniciado, verifica imagem/versão/porta loopback e recusa
autenticação TCP `trust`. Não inicia nem remove containers. Rode apenas em um
container novo e descartável: o runner cria bancos com nomes fixos e falha se
já existirem.

## Criar senha descartável e iniciar o banco

Com Podman disponível e após autorização explícita para iniciar o container:

```bash
umask 077
pg_passfile="$(mktemp /tmp/log2cia-pg176-password.XXXXXX)"
chmod 600 "$pg_passfile"
openssl rand -base64 36 > "$pg_passfile"
podman run --rm --name log2cia-pg176-test \
  --publish 127.0.0.1:55432:5432 \
  --volume "$pg_passfile:/run/secrets/pg-password:ro" \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/pg-password \
  --env POSTGRES_DB=postgres \
  postgres:17.6
rm -f "$pg_passfile"
```

A senha é aleatória, local e temporária; não reutilize uma senha de serviço.
O bind limita a porta ao loopback. O runner usa `psql` pelo socket local do
container e exige autenticação por senha nas conexões TCP. A senha não é
impressa nem inserida nos arquivos do projeto.

## Rodar os testes

Em outro terminal, dentro deste snapshot:

```bash
bash tests/postgres/run-migration-tests.sh
```

O runner confirma a imagem/tag `postgres:17.6`, `server_version_num = 170006`, a
porta `127.0.0.1:55432` e ausência de regras TCP `trust`. Em seguida cria
`log2cia_migration_test` e `log2cia_migration_rollback_test`, sem apagar
bancos existentes, e executa fixture, migrations e assertions com
`ON_ERROR_STOP`. Nos dois cenários negativos, captura saída e código de saída,
exige a mensagem específica esperada e interrompe diante de qualquer erro
diferente; em seguida, as assertions verificam grants, RLS, sequences e objetos
que deveriam ter sido revertidos.

### Repetir após uma execução parcial ou concluída

Os bancos usam nomes fixos e não são reutilizados. Se o runner já criou algum
deles, não o execute novamente nesse container: o `createdb` deve falhar para
evitar reaproveitamento de estado. Para repetir com segurança, inicie um **novo
container descartável e vazio** com o procedimento acima, mantendo o bind
`127.0.0.1:55432`, imagem `postgres:17.6` e autenticação por senha. Execute o
runner apontando para esse container, por exemplo:

```bash
bash tests/postgres/run-migration-tests.sh log2cia-pg176-test-clean
```

Use um nome que identifique o container novo. Não apague bancos nem reutilize o
container anterior. Ao criar o container novo, use o mesmo nome novo em
`podman run --name` (por exemplo, `log2cia-pg176-test-clean`) e no argumento do
runner acima. Encerre o novo container descartável ao terminar para que `--rm`
descarte seus bancos. O runner não cria, para ou remove containers.
Se o container anterior ainda estiver em execução e ocupando a porta, não inicie
outro em paralelo; encerre o descartável anterior pelo terminal que o iniciou
antes de iniciar o novo.

Ao terminar, interrompa o container com `Ctrl-C`; `--rm` descarta seu banco.
O comando seguinte remove o arquivo de senha gerado por `mktemp`; ele não toca
arquivos do projeto.

## Cobertura SQL

- Compatibilidade com linhas antigas, default `FALSE` para inserts novos e
  trigger que força novos registros a não provisionados.
- Hash e troca administrativa via RPC, `auth_version`, primeiro acesso e
  `ator_id` em eventos.
- Reset DRSO, reset legado para senha nula e `credential_audit_latest`.
- Auditoria sem colunas de senha/hash/token e rollback atômico de mutação e
  evento.
- RLS/grants das quatro tabelas e sequences, negação a `anon` e
  `authenticated`, e acesso mantido para `service_role`.
- Falha de preflight da contenção sem alteração parcial.
- Atomicidade da migration de credenciais num fixture propositalmente
  incompatível.

Os testes SQL exercitam banco e permissões. A regra de que apenas Master inicia
provisionamento/reset e a invalidação efetiva de cookies são validadas pelos
testes Node existentes, não pela RPC isolada: `service_role` é a identidade
técnica e recebe o `ator_id` validado no backend.

## Validação local de Permutas

`run-permutas-validation.sh` aplica a fixture `fixture-permutas-schema.sql`, a
migration manual de Permutas e as assertions de `assert-permutas.sql` em um
banco novo. Também testa concorrência com duas conexões e rollback da migration
em outro banco vazio. O script exige uma imagem `postgres:17.6` em container
com `--network=none`, sem portas publicadas; executa tudo por `podman exec` e
recusa bancos com nomes já existentes.

Inicie um container descartável com a mesma credencial temporária descrita
acima, retirando `--publish` e acrescentando `--network=none`. Depois rode:

```bash
bash tests/postgres/run-permutas-validation.sh NOME_DO_CONTAINER
```

Não reutilize o container após a criação dos bancos de teste. Para repetir,
inicie outro PostgreSQL 17.6 vazio. Nenhuma instrução desta seção acessa o
Supabase.
