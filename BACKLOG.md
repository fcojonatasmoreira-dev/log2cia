# BACKLOG.md — Demandas e Pendências Ativas (Log2CIA)

Este documento rastreia todas as pendências arquiteturais, correções de bugs e evoluções em aberto. Sempre que um problema for sanado e testado, ele será removido desta lista.

---

## 📋 Demandas em Aberto

### 1. 🗄️ Correção da Tabela de Cadastro no Painel Master

- **Descrição:** O modal de cadastro de operadores estava a tentar inserir dados numa tabela inexistente (`usuarios_sistema`).
- **Diretriz Arquitetural:** Toda e qualquer operação de efetivo, perfis e credenciais deve ocorrer **exclusivamente** na tabela unificada `policiais`.
- **Status:** ⏳ _Em aberto / Pendente de validação em produção_

### 2. 🔐 Unificação da Regra de Senha e Numeral (Primeiro Acesso)

- **Descrição:** Eliminar qualquer ambiguidade de campos de senha avulsos no cadastro inicial.
- **Diretriz Arquitetural:** O próprio `numeral` atua como a senha provisória inicial no primeiro acesso, tendo a flag `primeiro_acesso` definida obrigatoriamente como `true`.
- **Status:** ⏳ _Em aberto / Pendente de validação em produção_

### 3. ⭐ Padronização Global de Postos e Graduações

- **Descrição:** A lista de postos e graduações em alguns formulários estava incompleta.
- **Diretriz Arquitetural:** Unificar a listagem completa e oficial em todos os modais e selects do sistema (Soldado, Cabo, 3º Sgt, 2º Sgt, 1º Sgt, Subtenente, 2º Ten, 1º Ten, Capitão, Major).
- **Status:** ⏳ _Em aberto / Pendente de validação em produção_

### 4. 🛡️ Alinhamento Estrito de Permissões (RBAC)

- **Descrição:** Restringir a livre escolha de cargos (`role`) na página comum de Efetivo (`Policiais.jsx`).
- **Diretriz Arquitetural:**
  - Cadastros feitos por usuários com perfil `p4` na página comum de Efetivo devem ter o campo `role` travado/padrão como **`policial`**.
  - A atribuição de roles avançadas (`master`, `armeiro`, `p4`, `policial`) é restrita exclusivamente ao perfil `master` ou através do **Painel Master**.
- **Status:** ⏳ _Em aberto / Pendente de implementação e validação_

---

_Backlog atualizado e sincronizado com a evolução do Log2CIA._
