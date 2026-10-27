# Push com o app fechado (Firebase) — passo a passo

O código já está pronto e o banco já está preparado (`24-push-firebase.sql`). Falta só a parte da sua conta Firebase (gratuita).

## 1. Criar o projeto
1. Entre em https://console.firebase.google.com com o seu Gmail → **Adicionar projeto** → nome `manager-transportes` → pode desligar o Google Analytics → **Criar**.

## 2. Registrar o app web e copiar os dados públicos
1. Na tela inicial do projeto, clique no ícone **`</>` (Web)** → apelido `manager-web` → **Registrar app** (não precisa marcar Hosting).
2. Aparece um bloco `firebaseConfig` com `apiKey`, `projectId`, `messagingSenderId`, `appId`. **Esses 4 valores não são secretos.**
3. Vá em **Configurações do projeto (engrenagem) → Cloud Messaging → Configuração da Web → Certificados push da Web → Gerar par de chaves**. Copie a **chave pública** (começa com `B...`) — é a `vapidKey`.
4. Me passe os 5 valores (apiKey, projectId, messagingSenderId, appId, vapidKey) ou cole-os em `js/config-firebase.js`.

## 3. Ativar a API de envio e baixar a chave de serviço (esta é SECRETA)
1. Ainda em **Configurações do projeto → Cloud Messaging**, confira que **"API Firebase Cloud Messaging (V1)"** está **Ativada** (se não estiver, clique nos três pontinhos → *Gerenciar API no Google Cloud* → **Ativar**).
2. **Configurações do projeto → Contas de serviço → Gerar nova chave privada** → baixa um arquivo `.json`.
3. **Não envie esse arquivo a ninguém nem para mim.** Abra-o no Bloco de Notas, copie TUDO e cole no Apps Script (próximo passo).

## 4. Atualizar o Apps Script
Use o arquivo `script-email-apps-script.txt` (na pasta PARAOCLAUDE). Ele tem as instruções no topo: colar o código novo, **Gerenciar implantações → Nova versão** (a URL não muda) e criar a propriedade **FIREBASE_SA** com o conteúdo do `.json`.

## 5. Testar
1. Abra o app (no celular, de preferência instalado como PWA), entre, clique no sininho → **Ativar avisos** → permita.
2. Feche o app por completo e peça uma corrida como cliente: o aviso deve chegar na tela do celular.
- iPhone: só funciona com o app **instalado na tela inicial** (iOS 16.4 ou mais novo).
- Se o app estiver aberto na tela, o aviso não duplica: aparece só dentro do app, com som.
