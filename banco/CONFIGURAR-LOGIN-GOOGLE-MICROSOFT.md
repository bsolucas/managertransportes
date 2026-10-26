# Ativar o login com Google (Gmail) e Microsoft (Outlook)

A página `landing/cadastro.html` já está pronta, mas os botões só funcionam depois
que você cria as credenciais abaixo. **Quem faz é você** (são contas suas, no Google e
na Microsoft). Enquanto não estiver pronto, os botões aparecem desativados com "(em breve)".

Dados que você vai precisar:

- **Endereço de retorno do Supabase (callback):**
  `https://qjccecmfnwiypyivwwqb.supabase.co/auth/v1/callback`
- **Endereço do seu site na Vercel** (ex.: `https://SEU-SITE.vercel.app`).

---

## 1. Google (Gmail)

1. Acesse <https://console.cloud.google.com> e crie um projeto (ex.: "Manager Transportes").
2. **APIs e serviços → Tela de permissão OAuth**: tipo **Externo**; preencha nome do app e e-mail de suporte.
   Em "Escopos" deixe só `email`, `profile` e `openid`. Depois clique em **Publicar app**
   (sem publicar, só e-mails de teste conseguem entrar).
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.**
   - *URIs de redirecionamento autorizados:* o endereço de retorno (callback) do Supabase, acima.
4. Copie o **ID do cliente** e a **Chave secreta do cliente**.
5. No Supabase: **Authentication → Providers → Google** → ative, cole os dois valores e salve.

## 2. Microsoft (Outlook / Hotmail)

1. Acesse <https://portal.azure.com> → **Microsoft Entra ID → Registros de aplicativo → Novo registro**.
2. Nome: "Manager Transportes". Em **Tipos de conta com suporte**, escolha
   **"Contas em qualquer diretório organizacional e contas pessoais da Microsoft"**
   (sem isso, e-mails Outlook/Hotmail pessoais não entram).
3. *URI de redirecionamento:* tipo **Web**, com o endereço de retorno (callback) do Supabase.
4. Depois de criar, copie o **ID do aplicativo (cliente)**.
5. **Certificados e segredos → Novo segredo do cliente** → copie o **Valor** na hora (ele some depois).
6. No Supabase: **Authentication → Providers → Azure** → ative e preencha:
   - *Client ID:* o ID do aplicativo
   - *Secret:* o valor do segredo
   - *Azure Tenant URL:* `https://login.microsoftonline.com/common`

## 3. Liberar o endereço da página no Supabase

No Supabase: **Authentication → URL Configuration → Redirect URLs** → adicione:

- `https://SEU-SITE.vercel.app/landing/cadastro.html*`

(Troque `SEU-SITE.vercel.app` pelo endereço real. O `*` no final é necessário.)

## 4. Testar

Abra `/landing/cadastro.html`: os dois botões devem estar ativos. Entre com um Gmail e um
Outlook de teste, preencha os dados e confira o registro em **Table Editor → cadastros**.

## Regras que o banco impõe (não dá para burlar pelo navegador)

- Só entra quem fez login pelo Google ou pela Microsoft.
- E-mails aceitos: `gmail.com`, `googlemail.com`, `outlook.com`, `outlook.com.br`,
  `hotmail.com`, `hotmail.com.br`, `live.com`, `msn.com`. Para mudar a lista, edite a função
  `privado.validar_cadastro` (e `DOMINIOS_PESSOAIS` em `landing/js/validacao.js`).
- CPF/CNPJ válidos e sem repetição; celular brasileiro com DDD.
- A pessoa só enxerga o próprio cadastro, não muda o status e **não tem acesso ao painel**
  até o pagamento ser confirmado (etapa futura).
