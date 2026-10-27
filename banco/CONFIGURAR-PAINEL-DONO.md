# Painel do dono (master) — como liberar o seu acesso

O painel fica em **`/master/`** do seu site (ex.: `https://SEU-SITE.vercel.app/master/`).
Nenhuma página do site ou do app tem link para ele, mas o que protege de verdade é o banco:
só quem estiver na tabela `donos` recebe os dados. Quem digitar o endereço sem estar nela
só vê "Esta conta não tem acesso a este painel."

## O que o painel mostra
- Receita mensal (soma dos planos das empresas ativas), empresas ativas, cadastros novos
  aguardando pagamento, corridas dos últimos 30 dias, motoristas e clientes (somando tudo).
- **Empresas:** uma linha por empresa que assina (plano, situação, clientes, motoristas,
  corridas, última corrida, valor mensal). Clique na linha para ver os detalhes.
- **Cadastros novos:** quem se cadastrou pela landing (responsável, empresa, CPF/CNPJ, celular,
  e-mail, plano), com botão de WhatsApp.
- **Privacidade:** o painel só mostra números e dados de assinatura. O conteúdo das corridas,
  clientes e motoristas de cada empresa continua restrito a ela.

## Passo a passo (uma vez só)

1. **Crie a sua conta de dono** no Supabase: *Authentication → Users → Add user → Create new user*.
   Use o seu e-mail e uma **senha forte e exclusiva** (não reutilize a senha de nenhum gestor).
   Marque **Auto Confirm User**.
2. **Libere a conta como dono.** No *SQL Editor* do Supabase, rode (troque pelo seu e-mail):

   ```sql
   insert into public.donos (user_id)
   select id from auth.users where email = 'SEU@EMAIL.COM';
   ```

   Deve responder "1 row affected". Se responder 0, o e-mail está diferente do usuário criado.
3. Abra `/master/` no seu site e entre com esse e-mail e senha.

## Segurança — o que vale saber
- Não existe nenhum jeito de virar dono pelo site ou pelo app: a tabela `donos` não aceita
  leitura nem escrita pela API. Só o SQL Editor (conta do Supabase) mexe nela.
- Para tirar o acesso de alguém: `delete from public.donos where user_id = (select id from auth.users where email = '...');`
- Use essa conta **só** para o painel. O gestor de uma empresa nunca vira dono por engano.
- Guarde bem o acesso à sua conta do Supabase e do GitHub: quem entra nelas controla tudo.
- O painel ainda não tem verificação em duas etapas (2FA) própria. Se quiser, é uma boa próxima melhoria.

## Preços e planos
A tabela `planos` do banco (Básico 99,90 · Profissional 249,90 · Empresarial 329,90) é o que o painel
usa para somar a receita. Os preços da landing ficam em `landing/js/config.js`: se mudar um, mude o outro
(`update public.planos set preco = ... where id = '...'`).
Para marcar o plano de uma empresa: `update public.empresas set plano = 'profissional', assinatura_status = 'ativa' where nome = '...';`
(situações: `ativa`, `teste`, `suspensa`, `cancelada`).
