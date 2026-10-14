# Melhoria contínua das regras — Log2CIA

## Propósito

Usar evidências do trabalho no Log2CIA para propor regras mais úteis e atuais,
sem transformar cada incidente em uma nova restrição. O agente deve identificar
padrões recorrentes, erros repetidos e oportunidades de melhoria, apresentando
propostas justificadas. Não pode alterar regras ou documentação de orientação
sem aprovação explícita do usuário.

## Gatilhos para avaliar melhorias

Considere uma avaliação quando:

- o usuário solicitar revisão ou aprimoramento das regras;
- o mesmo tipo de erro ou correção reaparecer em tarefas independentes;
- uma regra existente causar ambiguidade, conflito ou decisões inadequadas;
- uma mudança confirmada de arquitetura tornar uma regra desatualizada;
- houver oportunidade concreta de reduzir risco ou retrabalho recorrente.

Uma ocorrência isolada deve ser tratada dentro da tarefa, sem gerar
automaticamente uma regra permanente. Uma ocorrência de alto impacto pode
justificar uma proposta imediata, mas ainda exige evidência, justificativa e
aprovação antes de alterar as regras.

## Processo para analisar padrões

1. Descreva o padrão observado em termos concretos, sem inferir causas ainda
   não verificadas.
2. Reúna ocorrências independentes e contexto: tarefa, fluxo afetado, decisão
   tomada e resultado conhecido. Não exponha segredos nem dados operacionais
   sensíveis.
3. Avalie recorrência, relevância para o Log2CIA, qualidade da evidência e
   benefício esperado. Considere também custo, rigidez e possíveis conflitos
   com o contrato de colaboração.
4. Verifique se uma regra atual já cobre o caso ou se a solução adequada é
   esclarecer uma regra, atualizar documentação de arquitetura ou corrigir
   apenas o caso pontual.
5. Apresente uma proposta pequena, citando arquivo e seção sugeridos,
   evidências, benefício, riscos e impacto sobre regras existentes.
6. Aguarde aprovação explícita. Depois de aprovada, altere somente o escopo
   autorizado e informe o que mudou.

## Critérios para criar uma regra

Proponha uma regra nova quando o comportamento:

- aparece de forma recorrente em tarefas independentes ou representa risco
  relevante sustentado por evidência;
- afeta mais de um fluxo ou uma classe identificável de arquivos do Log2CIA;
- pode ser expresso com clareza e observado na prática;
- não é coberto de forma suficiente por `AGENTS.md`, pelo contrato ou por outra
  regra específica;
- traz benefício concreto maior que o custo de manutenção e de contexto.

Exemplos possíveis incluem distinguir autorização de rota no frontend da
validação de papel no endpoint, confirmar o schema antes de uma mudança de
persistência, ou preservar filtros ativos nos relatórios do Inventário. São
exemplos de assuntos, não afirmações de incidentes atuais.

## Critérios para atualizar regra existente

Prefira atualizar a regra quando o tema e o escopo já existirem, mas a redação
for ambígua, incompleta, contraditória ou desatualizada. Confirme a arquitetura
nos arquivos atuais antes de registrar caminhos ou comportamentos. Não amplie
o escopo sem necessidade e preserve o histórico útil em vez de reescrevê-lo
como se sempre tivesse sido atual.

## Qualidade e atualidade

Cada regra deve:

- explicar quando se aplica e qual comportamento espera;
- ser concisa, específica ao projeto e compatível com o contrato;
- separar fatos de código, validação funcional, confirmação do usuário,
  confirmação em produção e planejamento/pendência;
- evitar impor tecnologias ou processos que não existam no Log2CIA;
- apontar para a fonte de verdade pertinente sem duplicar documentação extensa.

Reavalie a atualidade após mudanças confirmadas em rotas, páginas, serviços,
endpoints, autenticação, persistência ou publicação. A presença de um arquivo
não prova que uma regra operacional foi validada.

## Melhoria contínua e descontinuação

Ao revisar regras, procure redundâncias, conflitos, instruções difíceis de
verificar e referências a caminhos inexistentes. Se uma regra parecer obsoleta,
não a apague silenciosamente: apresente a evidência, explique o que a substituiu
e proponha removê-la, revisá-la ou marcá-la como histórica. Preserve o histórico
quando ele explicar uma decisão ou mudança de estado.

## Atualização da documentação

Quando uma mudança relevante estiver confirmada, atualize a documentação
correspondente conforme o contrato de colaboração: contrato para mudanças
relevantes de arquitetura, regras, schema, fluxo ou padrão visual; mapa para
mudanças de estrutura, arquitetura e estado dos módulos. Preserve o histórico
útil com registro datado ou indicação clara de substituição, quando aplicável,
e marque incertezas como pendentes. Não peça aprovação adicional para cada
atualização documental já autorizada pelo contrato.

Essa orientação não autoriza alteração automática das próprias regras. Criar,
modificar ou remover arquivos de regras continua exigindo aprovação explícita
do usuário. Atualize `AGENTS.md` quando houver autorização para alterar suas
instruções de entrada ou referências às regras.
