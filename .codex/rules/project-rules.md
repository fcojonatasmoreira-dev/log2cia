# Regras de desenvolvimento do projeto — Log2CIA

## Escopo e princípios

Estas orientações cobrem a aplicação Log2CIA existente. Leia o contrato e o
mapa indicados em `AGENTS.md` e confirme caminhos e comportamentos no código
antes de implementar. A arquitetura atual usa JavaScript/JSX com React, Vite,
Supabase, funções de API Node.js e configuração Vercel.

- Implemente o pedido estritamente. Faça a menor alteração que resolva o
  escopo autorizado.
- Preserve layout, textos, responsividade, estados e comportamento existentes,
  salvo quando a solicitação pedir uma mudança visual ou funcional.
- Não mova componentes nem faça reorganização ou refatoração paralela.
- Não trate estas regras como prova de que uma funcionalidade está pronta ou
  publicada. Consulte código e evidências de validação.

## Organização e responsabilidades

- `src/routes/AppRoutes.jsx`: composição da navegação e das rotas. A restrição
  de navegação no cliente não substitui autenticação e autorização no servidor.
- `src/pages/`: telas e composição dos fluxos de negócio, como Inventário,
  Cautelas, Livro da Permanência, Banco de Horas, Viaturas, DRSO e Ofícios.
- `src/components/`: elementos reutilizáveis. Mantenha componentes locais
  junto ao módulo quando não houver necessidade comprovada de compartilhamento;
  use componentes compartilhados onde o projeto já os organiza. Não mova
  componentes existentes sem pedido e análise de dependências.
- `src/services/`: integrações e operações de dados existentes, incluindo
  serviços de sessão, cautelas e APIs de módulos. Siga o padrão do fluxo
  relacionado; não introduza uma camada nova nem migre acessos sem solicitação.
- `src/utils/`: funções auxiliares reutilizáveis e, quando apropriado, sem
  efeitos colaterais. Mantenha regras específicas de um componente junto ao
  módulo, a menos que haja reutilização real.
- `src/lib/supabaseClient.js`: cliente Supabase usado no frontend. Não coloque
  chave de serviço ou outro segredo no cliente.
- `api/`: endpoints Node.js executados no servidor. `api/_server.js` contém
  utilitários compartilhados de sessão/acesso; inspecione o endpoint concreto
  antes de presumir que ele aplica todas as verificações necessárias.

Para toda nova operação protegida no servidor, valide no endpoint a sessão e o
papel/permissão do usuário antes de executar a leitura ou mutação. Esconder uma
rota ou um botão no frontend não protege a operação. Use os mecanismos de sessão
e autorização existentes, conferindo o endpoint e seu fluxo real. Analise os
acessos diretos existentes ao Supabase conforme o contexto da tarefa; não os
migre, refatore ou altere automaticamente.

Preserve a separação prática entre apresentação, regras do fluxo e acesso a
dados. Não reescreva telas para impor uma arquitetura nova. Existem acessos ao
Supabase no frontend e chamadas a APIs próprias; mantenha o padrão local e
avalie segurança antes de acrescentar ou alterar uma operação.

## Componentes, rotas e interface

- Use primeiro os componentes e estilos existentes. Mantenha padrões locais de
  Tailwind/CSS, ícones e componentes de interface.
- Preserve hierarquia e autorização de rotas existentes. Ao alterar uma rota,
  verifique o menu/layout relacionado e os perfis que usam o fluxo.
- Trate carregamento, resultado vazio, sucesso e erro conforme os padrões da
  tela. Não deixe falhas silenciosas nem exponha detalhes internos ao usuário.
- Evite estado duplicado quando o fluxo já possui uma fonte de verdade. Não
  remova estados, campos ou feedback existentes fora do escopo.
- Preserve filtros, ordenação, paginação e o conjunto de registros usado em
  exportações quando forem parte do comportamento definido do módulo.

## Nomenclatura e estilo

- Siga a linguagem e a convenção de nomes do arquivo e do módulo existente.
- Preserve `.js` para JavaScript e `.jsx` para componentes React conforme o
  padrão atual. Não converta para TypeScript sem aprovação.
- Use nomes que indiquem o papel do componente, serviço, endpoint ou função;
  evite abreviações novas quando os arquivos próximos usam termos completos.
- Mantenha imports, formatação e estilo compatíveis com arquivos vizinhos. Não
  faça formatação ampla como efeito colateral.

## Regras de negócio, persistência e schema

- Inspecione tela, rota, serviço e endpoint envolvidos antes de editar um
  fluxo. Procure chamadas, validações, efeitos colaterais e consumidores do
  mesmo dado.
- Não invente tabelas, colunas, tipos, chaves, relacionamentos, constraints,
  funções RPC ou políticas RLS. Confirme o schema relevante com material
  autorizado pelo usuário antes de depender dele.
- Não consulte ou altere o banco, nem execute migrações, sem autorização
  específica. Não corrija automaticamente dados históricos.
- Mantenha a fonte de dados e a semântica dos campos existentes. Não substitua
  localização cadastrada por classificação de cautela nem converta status
  históricos para contornar filtros.
- Para chamadas de API, trate erros de rede, respostas não-OK e dados ausentes
  conforme os padrões do serviço ou módulo.

## Segurança e validação de entrada

- O estado do frontend e `localStorage` não provam identidade nem autorizam
  operações. Use o fluxo de sessão existente e valide identidade e papel no
  servidor para operações protegidas.
- Valide método HTTP, formato, limites e valores da entrada no endpoint antes
  de persistir. Não confie em perfil, ID ou permissão enviados pelo cliente.
- Mantenha credenciais privilegiadas do Supabase apenas no ambiente servidor.
  Use variáveis de ambiente já previstas; nunca registre, documente ou inclua
  valores secretos em commit. Arquivos `.env*` e configurações locais não são
  material de entrega.
- Preserve cookies e verificações do fluxo de autenticação. Não introduza
  Supabase Auth, OAuth, outra biblioteca de autenticação ou estratégia nova sem
  aprovação.
- Evite mensagens de erro que revelem segredos, dados sensíveis ou detalhes
  internos desnecessários.

## Desempenho e consultas

- Evite consultas repetidas por item, carregamentos duplicados e buscas de
  colunas não utilizadas quando a alteração tocar essa operação.
- Use filtros e ordenação no servidor quando o padrão existente e a necessidade
  do fluxo justificarem; preserve o resultado esperado na interface.
- Não introduza cache, paginação, dependências ou otimizações arquiteturais sem
  evidência de necessidade e sem manter a semântica atual.
- Para PDFs e planilhas, preserve os filtros ativos e o conteúdo efetivamente
  apresentado quando esse for o comportamento definido para o relatório.

## Testes e validações

- Não presuma uma ferramenta de testes dedicada: use somente scripts e
  ferramentas existentes no projeto. Não introduza Jest, React Testing Library
  ou outra stack de testes sem aprovação.
- Faça a validação solicitada pelo usuário e compatível com a mudança. Não
  execute build, lint, testes, migrações ou publicação quando o pedido os
  proibir.
- Informe exatamente o que foi executado e o resultado. Não declare sucesso de
  build, teste, validação funcional ou produção sem evidência real.

## Documentação e manutenção

- Quando uma mudança relevante estiver confirmada, atualize a documentação
  correspondente conforme o contrato de colaboração: contrato para mudanças
  relevantes de arquitetura, regras, schema, fluxo ou padrão visual; mapa para
  mudanças de estrutura, arquitetura e estado dos módulos. Preserve o histórico
  útil com registro datado ou indicação clara de substituição, quando aplicável.
- A orientação do contrato autoriza essas atualizações documentais; não peça
  nova aprovação para cada atualização já abrangida por ele. Isso não autoriza
  alterar regras de agente: criar, modificar ou remover arquivos de regras
  exige aprovação explícita do usuário.
- Registre comportamento novo e pendências com seu estado correto; preserve
  histórico que explique decisões anteriores.
- Se identificar padrão recorrente que possa justificar nova regra, siga
  `self-improvement.md`: apresente evidências e proposta, sem editar regras
  automaticamente.
