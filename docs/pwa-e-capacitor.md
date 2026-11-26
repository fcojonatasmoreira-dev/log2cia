# Preparação mobile do Log2CIA — PWA e avaliação Capacitor

**Data:** 26/11/2026

**Escopo:** etapa 1 de preparação para uso como aplicativo; sem empacotamento Android.

## Arquitetura encontrada

- Aplicação React/Vite, servida pela mesma origem que encaminha `/api/*` ao gateway único. As rotas de tela são tratadas pelo fallback SPA da hospedagem.
- A sessão usa cookie `log2cia_session` HttpOnly, HMAC assinado, `Path=/` e `SameSite=Lax`; em produção/preview HTTPS o cookie é Secure. O frontend usa caminhos relativos e `credentials: include` nos serviços de sessão.
- Login, troca obrigatória de senha, DRSO externo, checklist público e solicitação pública de eventos já têm rotas próprias. O Service Worker não substitui esses fluxos.
- Antes desta etapa não havia manifesto, registro de Service Worker ou configuração Capacitor. O projeto não depende de `@capacitor/*`.
- A arte local do escudo conceitual é `public/images/escudo-2cia-pmce.png` (1199×1312, RGBA). Os derivados contêm a arte em fundo azul-marinho: 192×192, 512×512, máscara 512×512 com margem segura e Apple Touch Icon 180×180.

## PWA entregue nesta etapa

- `index.html` declara manifesto, cores do navegador, metadados iOS e ícones locais.
- `public/manifest.webmanifest` define nome, entrada `/`, escopo `/` e apresentação standalone.
- `src/main.jsx` registra `/sw.js` somente em build de produção, após `load` (ou imediatamente se a página já terminou de carregar). Erros de registro não interferem no login.
- `public/sw.js` não faz cache de APIs, respostas autenticadas, HTML da aplicação, scripts, imagens ou dados privados. Só armazena a página estática `/offline.html`; intercepta navegações GET da mesma origem, ignora o cache HTTP (`no-store`) e exclui explicitamente `/api` e `/api/*`. Se a rede falhar numa navegação de página, apresenta uma mensagem sem dados operacionais. Chamadas de API continuam sob o tratamento normal de erro do aplicativo.
- O cache é versionado e a ativação remove somente caches antigos com o prefixo `log2cia-pwa-offline-`.

O modo offline é apenas uma página de indisponibilidade. O Log2CIA não promete acesso offline aos dados, não guarda credenciais/tokens no armazenamento web e depende da rede para login, sessão e operações.

## Etapa futura: Capacitor para Android

O Capacitor não foi instalado, não existe diretório Android/APK e esta etapa não configura um shell nativo. A implementação web atual deve ser tratada como PWA instalável em contexto HTTPS; uma WebView nativa exige decisão separada para origem, sessão e transporte de arquivos.

Documentação oficial relevante:

- [Configuração Capacitor](https://next.capacitorjs.com/docs/next/config): `server.hostname` e esquemas da origem nativa afetam o contexto da WebView. `server.url` é indicado para live reload e não é destinado à produção.
- [Cookies](https://next.capacitorjs.com/docs/apis/cookies): o plugin de cookies é desativado por padrão; o comportamento entre origem nativa e API HTTPS precisa ser provado no dispositivo.
- [App](https://next.capacitorjs.com/docs/next/apis/app): retorno de hardware, abertura de URL/deep links e resultados restaurados de atividades externas devem ser tratados no shell nativo, conforme os fluxos usados.
- [File Transfer](https://next.capacitorjs.com/docs/apis/file-transfer): downloads/uploads em aplicativo nativo podem exigir integração diferente de links e blobs no navegador.

### Riscos e decisões para a etapa 2

1. URLs relativas `/api/*` apontam para a origem da WebView. Não presumir que apontar a WebView para outro host ou usar `server.url` seja um modo de produção suportado.
2. Se a API ficar em outro origin HTTPS, cookies `HttpOnly`, `Secure`, `SameSite=Lax`, CORS e credenciais podem se comportar diferente da navegação web same-origin. Não relaxar cookie nem mover token para `localStorage` como contorno.
3. Antes de escolher arquitetura nativa, validar em Android real login, `/auth/me`, expiração, logout, revogação remota, troca de senha, retomada após suspensão e múltiplas sessões. Uma ponte de autenticação nativa ou credencial temporária requer desenho e autorização próprios.
4. Testar deep links e rotas públicas, botão Voltar, upload de fotos, visualização/impressão de PDFs, downloads, anexos e retomada após câmera ou seletor de arquivos.
5. Confirmar origem de produção, HTTPS, atualização, assinatura/identidade do pacote, permissões Android mínimas e distribuição antes de gerar APK.

## Validação desta etapa

O teste `tests/pwa-foundation.test.js` cobre manifesto e dimensões dos PNGs, instalação/ativação do Service Worker, fallback offline, bypass do cache HTTP e exclusão de API/assets do interceptador. No Chrome headless local, `Page.getAppManifest` retornou `errors: []`, os três ícones foram carregados com HTTP 200 e o Service Worker ficou ativo/controlando a página. Com o preview local parado, uma navegação controlada mostrou a página “Sem conexão”. Isso valida o PWA no Chrome local, mas não equivale à instalação em aparelho. Instalação em dispositivo Android/iPhone continua pendente. Não houve alteração de autenticação, API, Vercel, banco, migration ou operação remota.

## Roteiro manual de instalação e aceitação

Executar somente depois de uma publicação autorizada no domínio oficial HTTPS; este roteiro não significa que o deploy já ocorreu.

### Android — Chrome

1. Abra o domínio oficial do Log2CIA no Chrome atualizado e confirme o cadeado HTTPS.
2. Aguarde o login carregar; entre com uma conta de teste autorizada e confirme `/auth/me`, Dashboard, troca de tema e navegação por módulos.
3. No menu do Chrome, escolha **Instalar app** (ou **Adicionar à tela inicial**, conforme a versão). Confirme o nome Log2CIA e o ícone; finalize a instalação.
4. Abra pelo ícone do launcher. Confirme que inicia no domínio/tela inicial esperada em apresentação standalone, sem a barra normal do navegador.
5. Teste navegação, botão Voltar, modais, logout, expiração/revogação e reabertura do app. Teste anexos, PDFs, impressão, uploads e câmera nos fluxos permitidos.
6. Com uma página aberta, coloque-a em segundo plano e restaure a conexão; confirme que o formulário permanece sem recarregamento inesperado. Desconecte a rede e abra/navegue para uma página: deve aparecer “Sem conexão”; nenhuma solicitação ou dado pessoal deve ser oferecido offline.
7. Após cada deployment aprovado, feche todas as janelas do app e abra novamente. Confirme a versão atual e que formulários abertos não foram interrompidos por atualização automática.

### iPhone — Safari

1. Abra o domínio oficial HTTPS no Safari atualizado; o fluxo de instalação deve ser feito no Safari, não em navegador embutido de outro app.
2. Entre com uma conta de teste autorizada e confira login, `/auth/me`, Dashboard, módulos, tema e modais.
3. Toque em **Compartilhar** → **Adicionar à Tela de Início**. Mantenha o nome Log2CIA e confirme a prévia do ícone; toque em **Adicionar**.
4. Abra pelo novo ícone. Confirme a apresentação como aplicativo, a sessão e a navegação; teste voltar/retomar, logout, anexos, PDFs e upload nos fluxos disponíveis.
5. Repita os testes de segundo plano/rede e offline do Android. No iOS, confirme também o comportamento depois de encerrar e reabrir o app e após atualizar o iOS/Safari.

Registrar modelo do aparelho, versão do sistema/navegador, URL, resultado de cada passo e screenshots sem dados pessoais. Não usar contas ou solicitações reais para validar instalação.
