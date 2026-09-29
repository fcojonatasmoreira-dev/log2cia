# CONTRATO DE COLABORAÇÃO TÉCNICA --- LOG2CIA

**Versão:** 1.0\
**Data de criação:** 29/09/2026\
**Finalidade:** servir como documento de recuperação de contexto para
retomar o trabalho sobre o sistema Log2CIA caso o histórico da conversa
não esteja disponível.

> Este documento registra o contexto conhecido e as regras de
> colaboração. Ele não substitui o código-fonte, o banco de dados ou a
> documentação técnica atualizada. Quando houver divergência, deve-se
> verificar o estado real do projeto antes de implementar.

## 1. Identificação do projeto

-   **Projeto:** Log2CIA
-   **Uso:** sistema desenvolvido para apoiar atividades administrativas
    e operacionais da unidade de trabalho do usuário.
-   **Unidade mencionada na documentação:** 2ª CIA / 15º BPM
    (Cascavel-CE).
-   **Fluxo de publicação:** o usuário realiza commits no Git; o código
    é sincronizado com a Vercel para implantação.
-   **Forma de trabalho:** colaboração contínua. O usuário entende
    desenvolvimento de software, mas tem pouca familiaridade técnica com
    detalhes da linguagem e pode solicitar explicações, correções e
    novas funcionalidades.

## 2. Tecnologias identificadas

Conforme o `package.json` enviado pelo usuário:

  --------------------------------------------------------------------------
  Tecnologia/pacote                   Versão declarada Uso conhecido ou
                                                       provável no projeto
  ----------------------- ---------------------------- ---------------------
  React                                       \^19.2.8 Interface baseada em
                                                       componentes

  React DOM                                   \^19.2.8 Renderização da
                                                       aplicação

  Vite                                         \^8.3.0 Servidor de
                                                       desenvolvimento e
                                                       build

  @vitejs/plugin-react                         \^6.1.1 Integração do React
                                                       com Vite

  @supabase/supabase-js                      \^2.116.0 Cliente para
                                                       integração com
                                                       Supabase

  react-router-dom                            \^7.18.3 Rotas e navegação

  tailwindcss                                  \^4.3.3 Estilização

  @tailwindcss/vite                            \^4.3.3 Integração do
                                                       Tailwind com Vite

  lucide-react                                \^1.45.0 Ícones

  jspdf                                        \^4.2.1 Geração de PDF

  jspdf-autotable                              \^5.0.8 Tabelas em PDF

  html2canvas                                  \^1.4.1 Captura de elementos
                                                       HTML

  html2canvas-pro                              \^2.4.5 Captura de elementos
                                                       HTML

  html2pdf.js                                 \^0.14.0 Geração de PDF a
                                                       partir de HTML

  html5-qrcode                                 \^2.3.8 Leitura de QR Code

  qrcode.react                                 \^4.2.0 Geração de QR Code

  xlsx                                        \^0.18.5 Manipulação de
                                                       planilhas

  oxlint                                      \^1.81.0 Lint
  --------------------------------------------------------------------------

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

``` text
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
