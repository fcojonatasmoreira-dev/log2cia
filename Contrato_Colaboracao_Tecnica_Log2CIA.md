# CONTRATO DE COLABORAÇÃO TÉCNICA --- LOG2CIA

**Versão:** 1.6\
**Data de atualização:** 02/10/2026\
**Finalidade:** servir como documento de recuperação de contexto para
retomar o trabalho sobre o sistema Log2CIA caso o histórico da conversa
não esteja disponível.

> Este documento registra o contexto conhecido e as regras de
> colaboração. Ele não substitui o código-fonte, o banco de dados ou a
> documentação técnica atualizada. Quando houver divergência, deve-se
> verificar o estado real do projeto antes de implementar.

## 1. Identificação do projeto

- **Projeto:** Log2CIA
- **Uso:** sistema desenvolvido para apoiar atividades administrativas
  e operacionais da unidade de trabalho do usuário.
- **Unidade mencionada na documentação:** 2ª CIA / 15º BPM
  (Cascavel-CE).
- **Fluxo de publicação:** o usuário realiza commits no Git; o código
  é sincronizado com a Vercel para implantação.
- **Forma de trabalho:** colaboração contínua. O usuário entende
  desenvolvimento de software, mas tem pouca familiaridade técnica com
  detalhes da linguagem e pode solicitar explicações, correções e
  novas funcionalidades.

## 2. Tecnologias identificadas

Conforme o `package.json` enviado pelo usuário:

---

Tecnologia/pacote Versão declarada Uso conhecido ou
provável no projeto

---

React \^19.2.8 Interface baseada em
componentes

React DOM \^19.2.8 Renderização da
aplicação

Vite \^8.3.0 Servidor de
desenvolvimento e
build

@vitejs/plugin-react \^6.1.1 Integração do React
com Vite

@supabase/supabase-js \^2.116.0 Cliente para
integração com
Supabase

react-router-dom \^7.18.3 Rotas e navegação

tailwindcss \^4.3.3 Estilização

@tailwindcss/vite \^4.3.3 Integração do
Tailwind com Vite

lucide-react \^1.45.0 Ícones

jspdf \^4.2.1 Geração de PDF

jspdf-autotable \^5.0.8 Tabelas em PDF

html2canvas \^1.4.1 Captura de elementos
HTML

html2canvas-pro \^2.4.5 Captura de elementos
HTML

html2pdf.js \^0.14.0 Geração de PDF a
partir de HTML

html5-qrcode \^2.3.8 Leitura de QR Code

qrcode.react \^4.2.0 Geração de QR Code

xlsx \^0.18.5 Manipulação de
planilhas

oxlint \^1.81.0 Lint

---

Scripts declarados: - `npm run dev`: inicia o ambiente de
desenvolvimento com Vite. - `npm run build`: gera a versão de
produção. - `npm run lint`: executa o Oxlint. - `npm run preview`:
pré-visualiza o build.

As versões acima são as declaradas no arquivo compartilhado; não
significam que tenham sido verificadas no ambiente instalado.

## 3. Estrutura de pastas observada

A estrutura abaixo foi identificada nas capturas de tela e no mapa de
arquitetura fornecidos. Ela pode estar incompleta ou ter mudado desde
então.

```text
src/
├── assets/
├── components/
│   ├── layout/
│   │   └── AppLayout.jsx
│   ├── p1/
│   │   └── (componentes do módulo P1)
│   ├── qr/
│   ├── ui/
│   ├── EtiquetaArmamento.jsx
│   └── ModalDetalhesArma.jsx
├── contexts/
├── hooks/
├── lib/
│   └── supabaseClient.js
├── pages/
│   ├── p1/
│   │   └── LivroPermanencia.jsx
│   ├── AlterarSenhaObrigatoria.jsx
│   ├── Cautelas.jsx
│   ├── Dashboard.jsx
│   ├── Devolucao.jsx
│   ├── Inventario.jsx
│   ├── Login.jsx
│   ├── MinhasCautelas.jsx
│   ├── NovaCautela.jsx
│   ├── Onboarding.jsx
│   ├── PainelMaster.jsx
│   └── Policiais.jsx
├── routes/
│   └── AppRoutes.jsx
├── services/
│   ├── authService.js
│   ├── cautelaService.js
│   ├── dashboardService.js
│   ├── equipamentoService.js
│   ├── masterService.js
│   ├── policiaisService.js
│   └── storageService.js
├── utils/
├── App.jsx
├── index.css
└── main.jsx
```

Observações: - `AppLayout.jsx` foi descrito no mapa como responsável
pela estrutura de layout e restrição de acesso/RBAC na navegação
lateral. - `supabaseClient.js` é o conector do Supabase. -
`AppRoutes.jsx` concentra as rotas da aplicação. - Os arquivos e
subpastas reais devem ser conferidos antes de assumir que esse mapa
permanece atualizado.

## 4. Módulos e funcionalidades conhecidos

### 4.1 P4, inventário e cautelas

A documentação descreve funcionalidades de gestão de acervo e cautelas,
incluindo: - armamentos, coletes, munições e rádios; - controle de
cautelas e devoluções; - registro de aceite digital; - duplo controle de
armeiros (responsável pela saída e responsável pela baixa); - geração de
documentos PDF e uso de hashes SHA-256 em etapas de
emissão/aceite/devolução; - gestão de efetivo e papéis de acesso.

### 4.2 P1 --- Livro Digital da Permanência

O módulo P1 digitaliza o Livro da Permanência e contempla, conforme os
mapas fornecidos: - turnos A (06h--18h) e B (18h--06h); - identificação
do permanente, antecessor e substituto; - busca de efetivo por nome de
guerra ou matrícula; - partes do livro: cabeçalho/turno, escala de
serviço, controle de quilometragem de viaturas, justiça e disciplina,
ocorrências e passagem de serviço; - geração de PDF; - assinatura
externa via Gov.br; - anexação/upload do PDF assinado e referência ao
arquivo para consulta; - acompanhamento/auditoria por perfis
autorizados.

Os mapas citam os arquivos `LivroPermanencia.jsx` e
`ModalNovoLivro.jsx`. A localização exata deve ser confirmada no projeto
atual.

### 4.3 Outros módulos

Também foram identificados: - Dashboard; - gestão de
policiais/efetivo; - Login e alteração obrigatória de senha; - Painel
Master; - rotas protegidas e controle de acesso por papéis.

## 5. Banco de dados --- conhecimento inicial

O backend de dados utiliza Supabase/PostgreSQL. Os mapas fornecidos
mencionam estas tabelas:

**P1** - `public.livros_permanencia`: dados do livro, data do serviço,
turno, nomes do permanente/antecessor/substituto, status e referência do
PDF assinado. - `public.livro_viaturas`: registros de viaturas
associados ao livro, quilometragem, abastecimento, status, motorista e
destino. - `public.livro_ocorrencias`: horário e descrição de
ocorrências associadas ao livro.

**P4 e efetivo** - `public.cautelas`: cautelas, status, aceite e
hashes. - `public.policiais`: efetivo, credenciais e papéis RBAC. -
`public.equipamentos` e `radios`: acervo de equipamentos e rádios,
conforme o mapa.

A lista é apenas o que consta nos mapas; não é um inventário completo
nem uma confirmação do schema atual. Não presumir nomes de colunas,
tipos, constraints, políticas RLS, triggers, funções ou relacionamentos
que não tenham sido verificados.

Quando uma tarefa depender do banco: 1. solicitar o SQL/schema relevante
ou os arquivos de serviço que acessam as tabelas; e/ou 2. preparar uma
consulta SQL de leitura para o usuário executar no Supabase; 3.
interpretar o resultado antes de propor alterações. Nunca solicitar ou
expor chaves secretas, tokens ou credenciais. Se o usuário compartilhar
acidentalmente um segredo, orientar a revogação/rotação.

## 6. Contrato de colaboração e regras obrigatórias

Estas regras devem ser seguidas em todas as futuras tarefas do Log2CIA:

1.  **Implementar estritamente o pedido.** Não adicionar
    funcionalidades, mudanças de comportamento ou melhorias não
    solicitadas.
2.  **Não alterar o layout sem autorização.** Preservar estrutura
    visual, cores, espaçamentos, dimensões, textos, posicionamentos,
    componentes e responsividade existentes, exceto quando a solicitação
    exigir explicitamente uma alteração.
3.  **Alteração mínima.** Modificar apenas os arquivos e trechos
    necessários. Não fazer refatorações paralelas ou reorganizações
    espontâneas.
4.  **Preservar o comportamento existente.** Considerar chamadas,
    dependências, estados, permissões e fluxos já presentes no sistema.
5.  **Entender antes de editar.** Se o contexto do arquivo ou da
    arquitetura for insuficiente, pedir os arquivos relacionados ou
    fazer perguntas objetivas antes de implementar.
6.  **Não inventar o schema.** Confirmar tabelas, colunas,
    relacionamentos e políticas do Supabase quando forem relevantes.
7.  **Explicar de forma didática.** Apresentar o que foi alterado e por
    quê, em linguagem clara, sem presumir domínio profundo da sintaxe.
8.  **Ser explícito sobre limites.** Não afirmar que algo foi testado,
    executado, implantado ou validado se isso não tiver ocorrido.
9.  **Respeitar o fluxo Git/Vercel.** Não presumir acesso ao repositório
    ou à Vercel. O usuário normalmente faz os commits e a implantação
    ocorre pela integração configurada.
10. **Documentar mudanças relevantes.** Quando houver alteração
    significativa de arquitetura, regras, schema, fluxo ou padrão
    visual, atualizar este contrato/mapa de contexto após confirmar os
    detalhes.

## 7. Fluxo recomendado para cada implementação

1.  O usuário descreve o resultado desejado e, quando possível, envia o
    arquivo atual.
2.  Analisar o código e identificar dependências e possíveis efeitos
    colaterais.
3.  Se faltar informação essencial, perguntar ou solicitar arquivos/SQL.
4.  Implementar somente o escopo solicitado.
5.  Entregar o arquivo completo ou um patch claramente delimitado,
    conforme o tamanho e a natureza da mudança.
6.  Explicar os pontos alterados e indicar comandos de validação, quando
    pertinentes.
7.  Não declarar sucesso de build/testes sem resultado real.
8.  Se a mudança for relevante e estiver confirmada, atualizar este
    documento e incrementar sua versão.

## 8. Como usar este contrato para recuperar o contexto

Quando o usuário anexar este arquivo em uma conversa futura: - tratá-lo
como a referência inicial do projeto e das regras de colaboração; - não
pedir novamente informações já registradas, salvo se houver dúvida sobre
sua atualidade; - conferir os arquivos atuais enviados pelo usuário
antes de editar; - perguntar sobre mudanças ocorridas desde a versão
deste documento; - manter as regras da seção 6 como padrão de trabalho.

Este documento pode ser atualizado ao longo do projeto. A versão e a
data devem ser alteradas a cada atualização relevante. Registre somente
informações confirmadas; marque como "a confirmar" aquilo que ainda não
foi verificado.

## 9. Registro de alterações — 29/09/2026

Nesta atualização, foram registradas as alterações realizadas no módulo P1
e no controle de acesso do Log2CIA:

- **Perfil Permanente da Guarda:** foi incluída a opção `permanente da guarda`
  nos seletores de perfil do Painel Master e da tela de gestão de policiais.
- **Menu e rotas:** o `AppLayout.jsx` foi ajustado para reconhecer o perfil
  `permanente da guarda` e exibir o menu correspondente. O `AppRoutes.jsx`
  foi ajustado para permitir o acesso às rotas pertinentes.
- **Livro Digital da Permanência:** foram corrigidas as normalizações do
  perfil nos arquivos relacionados, evitando que a navegação para o módulo
  provocasse o comportamento de piscar relatado pelo usuário.
- **Ações do livro:** na listagem do Livro da Permanência, foram removidos
  os botões de baixar PDF e upload que apareciam ao lado do ícone de
  visualização, mantendo o ícone de visualização.
- **Cadastro/seleção de armeiros:** foi ajustada a busca para considerar
  nome de guerra, nome completo, numeral, matrícula e diferenças de acentuação.
- **Novo livro:** foi preparado ajuste para verificar duplicidade e permitir
  clonagem do turno oposto (A/B), conforme o arquivo específico entregue.

### Arquivos relacionados

- `AppLayout.jsx`
- `AppRoutes.jsx`
- `LivroPermanencia.jsx`
- `Policiais.jsx`
- `PainelMaster.jsx`
- `ModalNovoLivro_clonagem_turno_oposto.jsx`
- `ModalNovoLivro_lista_armeiros_corrigido.jsx`

### Validação e observações

O usuário confirmou que o menu do perfil `permanente da guarda` passou a
aparecer e que a navegação para o Livro da Permanência ficou funcionando
adequadamente após os ajustes. Não há registro de execução de testes
automatizados ou de build nesta atualização.

A inclusão do perfil foi realizada na aplicação sem necessidade de alteração
do banco de dados, conforme verificação relatada pelo usuário. As alterações
devem ser consideradas referentes aos arquivos entregues; a implantação em
produção não é afirmada por este registro.

## 10. Planejamento do módulo P4 — Gestão de Viaturas (01/10/2026)

**Status:** planejamento funcional; ainda depende de levantamento do código e do schema real do Supabase. Os itens desta seção não devem ser interpretados como funcionalidades já implementadas.

### 10.1 Objetivo e escopo inicial

O módulo P4 — Gestão de Viaturas deverá permitir:

- cadastrar e manter os dados administrativos das viaturas;
- consultar informações operacionais provenientes do P1 — Livro Digital da Permanência;
- acompanhar situação, pendências e demandas de manutenção;
- registrar manutenções básicas e agendamentos;
- disponibilizar relatórios individuais, da frota e de emprego operacional.

O escopo inicial não inclui a implementação do futuro módulo Escalas.

### 10.2 Integração entre P1 e P4

- O P1 permanece responsável pelo registro do serviço e das informações lançadas no Livro da Permanência.
- O P4 deverá consultar os registros do P1 relacionados às viaturas, conforme os dados efetivamente existentes no banco.
- O P4 poderá permitir ajustes manuais de informações administrativas ou de referência, mantendo histórico do ajuste, autoria e momento da alteração, após definição técnica do modelo.
- Um livro com status fechado não deverá aceitar o registro de novas constatações. A notificação para o P4 deverá ser criada somente quando a constatação for registrada enquanto o livro estiver aberto.
- Notificações já criadas deverão continuar acessíveis no P4 após o fechamento do livro. O P4 poderá analisar e dar prosseguimento à demanda sem modificar o registro original do P1.
- Uma constatação não deverá tornar a viatura automaticamente indisponível. A avaliação e a decisão sobre as providências caberão ao P4, conforme as regras que forem definidas.

### 10.3 Situação, manutenção e agendamentos

O P4 deverá concentrar o acompanhamento administrativo das viaturas, incluindo demandas de manutenção, pendências e manutenções agendadas. O modelo poderá contemplar, conforme validação técnica, situação operacional e situação da manutenção como informações distintas.

A primeira versão da manutenção será básica e poderá evoluir posteriormente. Os campos definitivos (por exemplo, tipo de serviço, datas, quilometragem, responsável, oficina, peças e custos) dependerão do levantamento do schema e da definição funcional.

Os lembretes de troca de óleo poderão ser baseados em quilometragem ou data; o critério ainda precisa ser definido. Manutenções agendadas deverão poder apresentar, no mínimo conceitual, data/horário, tipo e observações.

### 10.4 Painel do Permanente da Guarda

O painel do perfil **Permanente da Guarda** deverá oferecer uma visão geral, inicialmente apenas para consulta, da situação de cada viatura. A visualização deverá considerar os registros administrativos do P4, incluindo manutenções, pendências, lembretes de troca de óleo e manutenções agendadas.

O agendamento e as alterações administrativas permanecerão sob responsabilidade do P4. O painel não deverá permitir que o permanente altere esses registros, salvo decisão futura expressa.

### 10.5 Relatórios

Foram definidos três tipos de relatório para o módulo:

- ficha individual da viatura;
- visão geral da frota;
- relatório de emprego operacional.

Filtros, indicadores, formato de exportação e campos dependerão dos dados disponíveis e da validação durante o levantamento técnico.

### 10.6 Diretriz para o futuro módulo Escalas

O módulo Escalas é uma possibilidade futura e não faz parte da implementação atual. A arquitetura do P4 deverá, entretanto, favorecer o reaproveitamento dos dados cadastrados, especialmente a identificação consistente das viaturas.

No futuro, uma composição poderá receber uma viatura e consultar os dados administrativos mantidos pelo P4, além de determinações do comando e outras informações necessárias ao serviço. Deve-se evitar duplicação desnecessária de dados e considerar a preservação de uma fotografia do estado da viatura no momento da elaboração da escala, para que alterações posteriores no cadastro não modifiquem silenciosamente registros históricos.

### 10.7 Próxima etapa técnica

Antes de implementar, conferir o estado atual do projeto e analisar progressivamente:

1. `LivroPermanencia.jsx` e os serviços que carregam/salvam livros, viaturas e ocorrências;
2. `Inventario.jsx` e os padrões atuais de listagem e relatórios;
3. schema real do Supabase, incluindo colunas, relacionamentos, constraints, políticas RLS, triggers e funções pertinentes;
4. bloqueio de novas constatações após o fechamento e fluxo atual de notificações;
5. permissões e dados necessários ao painel do permanente.

A primeira implementação deverá ser delimitada somente após esse levantamento. Não presumir nomes de campos ou estruturas do banco, nem declarar testes, build ou deploy sem execução e confirmação.

### Registro da atualização — 01/10/2026

- Atualizada a versão do contrato para 1.2.
- Registrado o planejamento do P4 — Gestão de Viaturas e suas regras de integração com o P1.
- Registrados os limites do painel do Permanente da Guarda e a diretriz de compatibilidade futura com o módulo Escalas.
- Os itens novos são planejamento, não confirmação de implementação.

## 11. Autenticação própria e endurecimento de sessões — 01/10/2026

**Status:** autenticação própria e funcionamento local do sistema foram confirmados pelo usuário com `npx vercel dev --local-config vercel.local.json`. A revisão das demais APIs protegidas permanece pendente. Não há confirmação de implantação em produção.

### 11.1 Diretriz arquitetural

- O projeto não utilizará Supabase Auth para autenticar os usuários.
- A autenticação é própria, com endpoints no backend e sessão mantida por cookie `HttpOnly`.
- O frontend utiliza `src/services/sessionService.js` para chamar `/api/auth/login`, `/api/auth/me` e `/api/auth/logout`, enviando credenciais com `credentials: 'include'`.
- O backend utiliza Supabase/PostgreSQL para consultar e atualizar os registros de policiais, por meio da chave de serviço mantida exclusivamente no ambiente servidor.
- A autenticação deve ser validada no servidor. O estado do frontend ou dados armazenados no navegador não são prova suficiente de identidade.

### 11.2 Sessão e senha

- O arquivo `api/auth/_session.js` assina tokens com HMAC-SHA256 e define validade de oito horas.
- O cookie de sessão utiliza `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`.
- As senhas são armazenadas com hash scrypt, conforme `api/auth/_password.js`; o login mantém compatibilidade de migração de senhas legadas para hash.
- A troca de senha valida critérios de complexidade, grava o hash e desativa a condição de primeiro acesso.
- Foi atualizado o fluxo de troca de senha para incrementar `auth_version`, condicionando a atualização à versão presente na sessão. O usuário confirmou que alterou a senha, foi deslogado e conseguiu entrar com a nova senha.

### 11.3 Controle de versão e revogação

- Foi proposto adicionar `public.policiais.auth_version` como inteiro não nulo, padrão `0`, para permitir revogação de tokens.
- A implementação de troca de senha pressupõe que essa coluna exista e que o token contenha `ver`.
- O logout básico apaga o cookie do navegador. A revogação efetiva no servidor depende de todas as APIs protegidas compararem a versão do token com a versão atual do banco.
- A alteração de senha incrementa a versão e, portanto, invalida os tokens anteriores quando a API consultada aplica essa verificação.
- A existência da coluna no banco e a aplicação da validação em todas as APIs ainda precisam ser confirmadas. Não presumir que todas as rotas estejam protegidas.

### 11.4 Pendências de segurança

1. Conferir o schema real de `public.policiais`, incluindo o campo que representa a situação ativa/inativa do policial.
2. Verificar se `/api/auth/me` consulta a versão atual e rejeita sessões revogadas e usuários inativos.
3. Atualizar e auditar as demais APIs para validar sessão, versão e permissões no servidor.
4. Revisar o logout para confirmar que o incremento de versão está implementado e testado; apagar apenas o cookie não revoga um token copiado.
5. Avaliar controles adicionais, como limitação de tentativas no pedido de redefinição de senha e tratamento de erros que possam revelar a existência de matrículas.
6. Executar testes locais e build após a integração dos arquivos; não declarar deploy sem confirmação.

### 11.5 Arquivos relacionados

- `api/auth/_session.js`
- `api/auth/_password.js`
- `api/auth/login.js`
- `api/auth/me.js`
- `api/auth/logout.js`
- `api/auth/change-password.js`
- `src/services/sessionService.js`
- `src/pages/Login.jsx`
- `src/routes/AppRoutes.jsx`

### Registro da atualização — 01/10/2026

- Atualizada a versão do contrato para 1.3.
- Registrado o uso de autenticação própria, sem Supabase Auth.
- Registrado o hash scrypt e o uso de cookie assinado com HMAC-SHA256.
- Registrado o teste relatado pelo usuário de alteração de senha, encerramento da sessão e novo login com a senha atualizada.
- Registrada a estratégia de `auth_version` e as pendências de validação abrangente das APIs.
- Não há confirmação de build final, auditoria integral das APIs ou implantação em produção.

## 12. Ambiente local e preparação do deploy — 01/10/2026

**Status:** o usuário confirmou que o sistema está funcionando localmente após iniciar o Vercel Dev com uma configuração local separada. O deploy de produção ainda não foi confirmado.

### 12.1 Execução local

- `npm run dev` inicia o frontend pelo Vite. Esse comando, isoladamente, não executa as funções serverless da Vercel; chamadas para `/api/auth/login` no endereço do Vite retornaram `404 (Not Found)`.
- O usuário executou `npx vercel dev --local-config vercel.local.json` e confirmou que tudo funcionou.
- `vercel.local.json` é uma configuração de apoio ao desenvolvimento local e não deve ser incluída no commit de produção sem necessidade e decisão expressa.
- O `vercel.json` original contém o rewrite para `index.html`, usado para suportar as rotas do SPA no Preview. Deve ser preservado no fluxo de publicação, pois já foi validado pelo usuário no Preview. Não substituir por `{}` como alteração permanente.

### 12.2 Build e avisos

- O usuário executou `npm run build`; a saída compartilhada terminou com `built` e código de sucesso.
- Foram apresentados avisos sobre importação dinâmica e estática de `jspdf` e sobre chunks maiores que 500 kB. Na execução relatada, esses avisos não impediram a conclusão do build.
- Não afirmar que o build de um commit posterior ou a implantação em produção foi validado sem novo resultado.

### 12.3 Publicação

- O fluxo previsto continua sendo GitHub integrado à Vercel, com commit e push para a branch configurada.
- Antes de publicar, conferir `git status` e `git diff`; não incluir `vercel.local.json`, arquivos `.env`, credenciais ou outros artefatos locais.
- O usuário ainda não confirmou que realizou o commit/push nem que o deploy de produção foi concluído.
- Após o deploy, verificar o estado `Ready` na Vercel e testar login e funcionalidades relevantes em produção.

### 12.4 Estado das alterações de rádios

- O trabalho recente envolveu o módulo de rádios, incluindo a necessidade de edição e exclusão para os perfis Master e P4.
- A edição/exclusão não deve ser considerada implantada ou validada em produção sem confirmação do usuário e verificação do código efetivamente integrado.
- Manter as mutações de rádio na API própria, com autenticação e autorização no servidor; não contornar a RLS com políticas abertas.
- Preservar a regra de que o status `cautelado` deve decorrer do fluxo de cautela, não de alteração manual isolada.

### Registro da atualização — 01/10/2026

- Atualizada a versão do contrato para 1.4.
- Registrado o funcionamento local confirmado com Vercel Dev e configuração separada.
- Registrada a diferença entre `npm run dev` (frontend) e `npx vercel dev` (frontend e funções locais).
- Registrado o build concluído com sucesso, mantendo anotados os avisos apresentados.
- Reforçada a preservação do `vercel.json` validado no Preview e a exclusão da configuração local do commit.
- Deploy de produção e integração final das alterações de edição/exclusão de rádios permanecem sem confirmação.

## 13. Relatórios do Inventário — PDF e Excel — 02/10/2026

**Status:** alterações preparadas no arquivo `src/pages/Inventario.jsx` e entregues para teste local. Build, commit, push e deploy desta atualização ainda não foram confirmados.

### 13.1 Relatórios por categoria

A exportação deve respeitar a categoria ativa e os filtros aplicados no Inventário. As colunas definidas são:

- **Armamentos:** modelo, número de série, calibre, localização e status.
- **Coletes:** modelo, número de série, gênero, tamanho, data de validade, localização e status.
- **Rádios comunicadores:** marca, modelo, número de série, número de identificação, localização e status.
- **Munições:** relatório próprio; conferir os campos efetivamente disponíveis no código/schema antes de ampliar ou alterar suas colunas.

O título do relatório deve identificar a categoria (armamentos, coletes, munições ou rádios), acompanhado de data e hora de emissão.

### 13.2 Identificação do operador

A identificação pretendida no cabeçalho dos relatórios PDF e Excel segue o formato:

**Posto/graduação + numeral + nome de guerra + matrícula.**

O código entregue procura os campos `posto_graduacao`/`posto`/`graduacao`, `numeral`/`numero`/`numero_operacional`, `nome_guerra`/`nome_de_guerra` e `matricula` no objeto `log2cia_user`. A correspondência desses nomes com os dados reais da sessão deve ser conferida no teste; se algum campo não estiver disponível, a identificação poderá ficar incompleta.

### 13.3 Formatação e dependência do Excel

- A tabela do PDF deve centralizar cabeçalhos e dados.
- A planilha Excel foi preparada para centralizar cabeçalhos e dados e aplicar estilo ao cabeçalho.
- O arquivo entregue importa `xlsx-js-style` para gravar estilos de célula. A dependência precisa estar instalada no projeto (`npm install xlsx-js-style`) antes do build.
- Não há alteração de schema do banco prevista para essas melhorias de exportação.

### Registro da atualização — 02/10/2026

- Atualizada a versão do contrato para 1.5.
- Registradas as colunas específicas dos relatórios por categoria e a identificação do operador com numeral.
- Registrada a centralização das tabelas PDF/Excel e a dependência `xlsx-js-style`.
- As alterações estão preparadas, mas devem ser testadas localmente antes do commit e do deploy.

## 14. Entrega incremental — Consultas e cadastro/edição de coletes — 02/10/2026

**Versão documental:** 1.6  
**Arquivo de referência entregue:** `Inventario_atualizado_2026-10-02_v2.jsx` (substitui `src/pages/Inventario.jsx`).  
**Status:** alteração preparada e entregue para validação local. Não há confirmação de build, teste funcional, commit, push ou deploy desta revisão.

### 14.1 Consultas do inventário

- As abas de armamentos, coletes, munições e rádios devem apresentar o número de registros que correspondem aos filtros ativos e o total cadastrado para a categoria selecionada.
- A indicação adotada é “Registros exibidos: X de Y”, acompanhada de texto informando que o resultado considera os filtros aplicados.
- As tabelas dessas quatro categorias foram ajustadas para centralizar os cabeçalhos e os conteúdos das células.
- Em coletes, a listagem apresenta gênero e tamanho em colunas distintas, em substituição à coluna conjunta “Especificações”.

### 14.2 Cadastro e edição de coletes

- O formulário de cadastro já continha campos independentes para gênero e tamanho.
- O formulário de edição foi alinhado ao cadastro: gênero com opções Masculino, Feminino e Unissex; tamanho com opções PP, P, M, G e GG.
- A persistência no componente utiliza `detalhes.genero` e `detalhes.tamanho`.
- Não foi incluída migração SQL nesta entrega. A ausência de necessidade de alteração no banco depende de a coluna `detalhes` existente aceitar e armazenar esses atributos (por exemplo, como JSON/JSONB) e de a API preservar o objeto. Confirmar o schema e o fluxo de gravação antes de concluir a validação.

### 14.3 Identificação e continuidade das entregas

- O componente exibe a identificação `Inventario.jsx · Entrega incremental 2026-10-02 · v2`.
- O comentário no início do arquivo também identifica a entrega incremental e seu escopo.
- Essa identificação visual facilita reconhecer o arquivo, mas o histórico oficial das alterações deve continuar sendo mantido por commits no Git.
- As entregas futuras devem partir do arquivo mais recente confirmado pelo usuário, preservando as alterações anteriores e registrando versão, data, escopo e estado de validação.

### 14.4 Validação antes da publicação

1. Substituir o arquivo em `src/pages/Inventario.jsx`.
2. Testar cadastro de colete e conferir se gênero e tamanho são gravados separadamente.
3. Editar um colete existente e confirmar que os valores são carregados e salvos corretamente.
4. Conferir a contagem de registros em cada categoria, com filtros vazios e ativos.
5. Conferir a centralização das quatro tabelas e verificar os relatórios PDF/Excel já existentes.
6. Executar `npm run build` e revisar `git diff` antes do commit e do push.

### Registro da atualização — 02/10/2026

- Atualizada a versão do contrato de cooperação técnica para 1.6.
- Documentados os contadores de registros filtrados e totais nas quatro categorias.
- Documentada a separação de gênero e tamanho na listagem de coletes e o alinhamento do cadastro/edição.
- Registrada a identificação incremental do arquivo e o estado ainda pendente de validação.
