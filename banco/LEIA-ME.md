# Banco de dados (Supabase)

Arquivos SQL do banco do Manager Transportes. **Não há senhas nem chaves aqui.**

| Arquivo | O que faz |
|---|---|
| `01-estrutura.sql` | Cria as tabelas, a numeração automática das corridas e a segurança (RLS) por empresa |
| `03-planilhas-fechamento-app-notificacoes.sql` | Fechamento quinzenal/mensal, importação de planilhas, preços por cliente, app Android (dispositivos/versões), notificações, posições em tempo real, logins de motorista e cliente |
| `04-cadastro-motoristas.sql` | Funções `criar_motorista` e `remover_motorista`: o gestor cadastra/remove motoristas com login |
| `05-cadastro-assinantes.sql` | Tabela `cadastros`: novos assinantes (login Google/Microsoft, CPF/CNPJ, celular). Guia: `CONFIGURAR-LOGIN-GOOGLE-MICROSOFT.md` |
| `02-dados-teste.sql` | Cadastra a empresa de exemplo (Garcia Transportes), locais, motoristas, clientes e tarifas |

Ordem: rode o 01, o 02, o 03, o 04 e o 05, no SQL Editor do Supabase.

## Tabelas

- `empresas` — cada empresa de transporte que usa o sistema (ex.: Garcia Transportes, sigla GT).
- `perfis` — liga o usuário do login (Supabase Auth) à empresa dele; papel `gestor` ou `master`.
- `clientes`, `motoristas`, `locais`, `tarifas`, `corridas`, `mensagens` — todas com `empresa_id`.

## Segurança

- O RLS está ligado em todas as tabelas. Sem login, a chave pública (`anon`) não lê nem grava nada.
- Quem está logado só enxerga e altera as linhas da **própria empresa**
  (função `privado.empresa_do_usuario()`).
- A chave `service_role` / `secret` **nunca** vai para o site. No site entra só a URL e a chave pública.

## Logins de teste (Supabase Auth)

Usuário do painel → e-mail interno usado no login: `<usuario>@acesso.managertransportes.test`.
Há dois: `garciatransportes` e `master`. A senha provisória é igual ao nome do usuário.
**Troque as senhas antes de usar dados reais.**

Decisões tomadas pelo Claude que você pode mudar: veja `DECISOES.md`.
