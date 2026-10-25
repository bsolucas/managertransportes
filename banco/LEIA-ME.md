# Banco de dados (Supabase)

Arquivos SQL do banco do Manager Transportes. **Não há senhas nem chaves aqui.**

| Arquivo | O que faz |
|---|---|
| `01-estrutura.sql` | Cria as tabelas, a numeração automática das corridas e a segurança (RLS) por empresa |
| `02-dados-teste.sql` | Cadastra a empresa de exemplo (Garcia Transportes), locais, motoristas, clientes e tarifas |

Ordem: rode o 01 e depois o 02, no SQL Editor do Supabase.

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
