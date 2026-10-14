# Orientações para o Codex — Log2CIA

## Antes de trabalhar

- Leia `Contrato_Colaboracao_Tecnica_Log2CIA.md` antes de cada tarefa relevante.
- Consulte `mapa_completo_projeto_log2cia.html` para localizar módulos e
  entender a arquitetura; confirme caminhos e comportamento nos arquivos reais.
- Inspecione o fluxo completo relacionado ao pedido antes de editar: tela,
  rotas, serviços, API e, quando relevante, informações de schema fornecidas ou
  autorizadas pelo usuário.

## Escopo e preservação

- Faça somente o que o pedido explícito solicita. Preserve layout e
  comportamento existentes; limite a alteração aos arquivos e trechos
  necessários. Não inclua refatorações ou melhorias não pedidas.
- Não invente tabelas, colunas, políticas, relacionamentos, regras de negócio,
  resultados de validação ou estado de publicação. Não consulte nem altere o
  banco sem autorização específica; confirme o schema antes de propor mudanças
  que dependam dele.
- Não exponha ou registre segredos. Não faça commit, push ou publicação sem
  autorização explícita.
- Siga os limites de validação pedidos pelo usuário. Relate apenas comandos e
  verificações realmente executados e seus resultados; presença no código não
  prova funcionamento.

## Precedência

Em caso de conflito, prevalece o pedido explícito mais recente do usuário,
respeitando as regras de segurança e os limites autorizados. Se faltar dado
essencial, explique o que precisa ser confirmado antes de executar a parte
dependente dessa informação.

## Regras complementares do projeto

Arquivos Markdown em `.codex/rules/` não devem ser presumidos como carregados
automaticamente pelo Codex CLI. Leia as regras pertinentes explicitamente:

- `.codex/rules/codex-rules.md` ao organizar, criar, revisar ou retirar regras.
- `.codex/rules/project-rules.md` antes de alterações relevantes na aplicação,
  especialmente em `src/` e `api/`.
- `.codex/rules/self-improvement.md` ao avaliar padrões recorrentes ou propor
  melhorias, atualizações ou descontinuação de regras.

Se a tarefa envolver mais de um desses contextos, consulte todos os documentos
aplicáveis. Não altere as regras automaticamente; apresente propostas e aguarde
aprovação explícita do usuário.
