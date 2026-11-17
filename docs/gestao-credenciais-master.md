# Gestão de credenciais pelo Master

## Comportamento

- Somente Master consulta `GET /api/credenciais` e redefine credenciais por `POST /api/credenciais`. O endpoint também protege a redefinição existente em `/api/policiais/:id/reset-senha`.
- P4 mantém o cadastro de policiais, mas o endpoint cria a conta sem senha e marca o acesso como não provisionado. O login recusa contas sem credencial provisionada. O Master provisiona o acesso pela redefinição administrativa.
- Cadastros feitos por Master recebem senha temporária aleatória; o banco recebe somente o hash e a resposta mostra a senha uma vez.
- Cadastro de conta DRSO também fica sem credencial até o Master provisionar. Contas DRSO existentes mantêm o login e o fluxo de primeiro acesso.
- O reset incrementa `auth_version`, força troca de senha e invalida sessões existentes. O backend chama `master_set_credential`, que grava hash, estado de primeiro acesso e versão, e o trigger registra o evento com o ID do Master na mesma transação.
- O painel mostra apenas metadados e indicadores. Não retorna senha, hash ou token.

## Schema e ativação

O código depende de `credencial_provisionada` em `policiais` e `drso_policiais_externos`, além da tabela `credential_audit_events`. O script [20261116_gestao_credenciais_master.sql](../supabase/manual/20261116_gestao_credenciais_master.sql) adiciona esses objetos, torna `drso_policiais_externos.senha` anulável para cadastros ainda sem credencial e instala triggers de auditoria.

O `DEFAULT TRUE` preserva inicialmente a marca de contas existentes. Na mesma migration, contas com senha nula ou vazia passam para `credencial_provisionada = false`; contas antigas com senha armazenada preservam `true`. O default é alterado para `false` antes de novos cadastros. O login aceita somente senha armazenada: hash validado pelo verificador ou, durante a migração legada, valor não vazio efetivamente armazenado. Numeral, matrícula e seus dígitos não são credenciais.

Cadastros sem acesso recebem `credencial_provisionada = false`. No cadastro pelo Master, o registro é criado sem senha e só é provisionado pela RPC transacional `master_set_credential`; se a segunda etapa falhar, a conta continua sem acesso e a senha temporária não é devolvida. No cadastro P4, a conta permanece sem acesso até ação do Master. O script não altera contas reais e não foi executado.

O script acrescenta `ator_id` ao histórico, uma RPC de provisionamento/reset exclusiva ao `service_role` e uma RPC de histórico indexada por origem/usuário/evento/data. O trigger captura o ator definido na transação de provisionamento/reset. O backend deriva esse ID da sessão Master validada; não aceita o ator do payload do cliente. Senhas, hashes e tokens não são gravados no histórico.

**Ativação:** confirmar o schema remoto e autorizar a execução do script antes de publicar as rotas dependentes. A migração é aditiva para o código publicado: os defaults atendem inserts antigos e a nulabilidade relaxada do DRSO aceita tanto inserts antigos com senha quanto o novo cadastro pendente. Ainda assim, validar previamente nomes, assinatura/ACL de funções preexistentes, triggers e grants. Sem a migration, as RPCs não existem e cadastro Master/reset/gestão respondem como dependência pendente.

## Histórico

Triggers registram senha inicial, troca, reset administrativo e migração de senha legada; login bem-sucedido é registrado pelo handler após validar a senha. Eventos de alteração ficam na mesma transação da escrita da credencial. Login permanece best-effort e uma falha pode deixar esse acesso sem evento. A RPC do painel busca o login e a alteração mais recentes por usuário, usando o índice, sem paginação pelo histórico inteiro. A ausência de evento anterior à ativação não indica ausência de acesso.

## Contas antigas sem senha

O inventário confirmado apontou 74 policiais com senha nula e primeiro acesso pendente. A migration os marca como não provisionados, sem alterar a senha ou outros dados. Eles não poderão entrar até que um Master gere uma credencial temporária individualmente pelo fluxo administrativo. A senha temporária é exibida uma vez, deve ser entregue diretamente ao policial e exige troca no primeiro acesso. Não gerar nem exportar credenciais em lote. O cadastro P4 continua criando contas sem senha e sem acesso até provisionamento Master. As contas DRSO existentes com senha armazenada continuam autenticando somente pela senha armazenada.
