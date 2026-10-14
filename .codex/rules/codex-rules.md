# Organização das regras do Codex — Log2CIA

## Objetivo

Este documento define como manter e consultar as regras de trabalho do Codex
neste repositório. As regras complementam `AGENTS.md` e
`Contrato_Colaboracao_Tecnica_Log2CIA.md`; não os substituem.

## Localização e formato

As regras específicas do projeto ficam em `.codex/rules/`, em arquivos
Markdown (`.md`):

```text
.codex/rules/
├── codex-rules.md
├── project-rules.md
└── self-improvement.md
```

Use nomes curtos em `kebab-case`, com um assunto principal por arquivo.
Organize o conteúdo com títulos Markdown e instruções diretas, incluindo o
escopo de aplicação quando uma regra não valer para todo o projeto.

Não use cabeçalhos `.mdc`, frontmatter ou diretivas próprias do Cursor como se
fossem mecanismos nativos do Codex CLI. Não dependa de arquivos `.md` nesta
pasta serem descobertos ou carregados automaticamente apenas por sua
localização.

## Hierarquia e consulta

- `AGENTS.md` é a entrada concisa para as instruções deste repositório e aponta
  quando consultar cada regra específica. O Codex CLI usa `AGENTS.md` como
  mecanismo de orientação do repositório; comportamento e escopo de descoberta
  podem depender da versão e do diretório de trabalho. Consulte a
  [documentação oficial do Codex](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide#using-agentsmd)
  quando essa mecânica for relevante.
- Leia `project-rules.md` antes de alterações relevantes em `src/`, `api/` ou
  integrações técnicas da aplicação.
- Leia `self-improvement.md` ao avaliar padrões recorrentes, erros repetidos
  ou propostas para alterar regras ou documentação.
- Leia este arquivo ao criar, organizar, revisar ou retirar regras.
- Se uma tarefa tocar mais de um domínio, consulte todos os arquivos
  pertinentes. Em dúvida, consulte a regra antes de editar.
- O pedido explícito mais recente do usuário prevalece sobre estas regras,
  respeitados segurança, contrato de colaboração e limites autorizados.

## Qualidade e manutenção

- Mantenha regras claras, aplicáveis, verificáveis e sem duplicação.
- Diferencie fatos confirmados, requisitos, exemplos e itens pendentes.
- Não transforme um evento isolado em regra permanente sem avaliar recorrência,
  relevância, evidência e benefício concreto.
- Não crie, altere ou remova regras automaticamente. Apresente a proposta e
  aguarde aprovação explícita do usuário.
- Quando uma regra mudar, atualize as referências em `AGENTS.md` e verifique a
  coerência com o contrato e com as outras regras afetadas.
