# Banco de dados (Supabase)

Arquivos SQL do banco do Manager Transportes. **Não há senhas nem chaves aqui.**

| Arquivo | O que faz |
|---|---|
| `01-estrutura.sql` | Cria as tabelas, a numeração automática das corridas e a segurança (RLS) por empresa |
| `03-planilhas-fechamento-app-notificacoes.sql` | Fechamento quinzenal/mensal, importação de planilhas, preços por cliente, app Android (dispositivos/versões), notificações, posições em tempo real, logins de motorista e cliente |
| `04-cadastro-motoristas.sql` | Funções `criar_motorista` e `remover_motorista`: o gestor cadastra/remove motoristas com login |
| `05-cadastro-assinantes.sql` | Tabela `cadastros`: novos assinantes (login Google/Microsoft, CPF/CNPJ, celular). Guia: `CONFIGURAR-LOGIN-GOOGLE-MICROSOFT.md` |
| `06-clientes-login-nuvem.sql` | Login do cliente (`definir_login_cliente`), `remover_cliente` e atualização ao vivo de clientes/locais/tarifas |
| `07-corridas-nuvem.sql` | Corridas e chat no Supabase: trajeto + embarque, ordem das situações, motorista "em corrida", chat liberado só após aceitar, mensagens do sistema (tudo por gatilhos no banco) |
| `08-painel-dono.sql` | Painel do dono (`/master/`): tabela `donos`, `planos`, assinatura em `empresas` e as funções `dono_*`. Guia: `CONFIGURAR-PAINEL-DONO.md` |
| `09-portal-cliente.sql` | Portal do cliente: valor do pedido vem sempre do trajeto cadastrado, cliente vê o motorista e o GPS da própria corrida, avisos mostram o trajeto |
| `10-tipos-de-servico.sql` | Serviços válidos: carro/táxi, van, ônibus e utilitário (o guincho saiu) |
| `11-tipo-de-empresa.sql` | Tipo de empresa (táxi, van, ônibus, frota pequena/grande, interno) no cadastro e na empresa; aparece no painel do dono |
| `12-modos-do-plano-basico.sql` | Plano Básico em dois modos (Individual: clientes sem login; Equipe) e tipo "frota" único; o banco recusa login de cliente no modo Individual |
| `13-despesas.sql` | Tabela de despesas (só o gestor da empresa lê e grava) |
| `14-plano-individual.sql` | Plano Básico vira "Individual" (R$ 99,90); Profissional e Empresarial seguem iguais |
| `15-administracao-do-negocio.sql` | Plano volta a ser "Básico" (R$ 99,90, sozinho ou pequena frota); tabela `diario` (km e faturamento por dia); `empresas.modulos`; corrida própria já concluída para quem trabalha sozinho |
| `16-pagamentos-motoristas.sql` | Comissão padrão e por motorista, CLT (salário só do gestor), comissão gravada na corrida concluída; reforços: só o gestor edita a empresa e o motorista só muda a própria situação |
| `17-destino-da-corrida.sql` | Endereço de destino (opcional) na corrida, para o motorista abrir a rota no Google Maps/Waze |
| `18-solicitacao-automatica-e-notificacoes.sql` | Cliente pede "direto ao gestor" ou "automático" (o sistema escolhe o motorista livre há mais tempo); novas notificações (motorista designado, cancelamento, chat, sem motorista livre) |
| `19-modo-teste-documento.sql` | MODO TESTE: cadastro aceita CPF/CNPJ com dígitos inválidos (desligar antes de divulgar; o comando está no arquivo) |
| `20-limpeza-de-notificacoes.sql` | Todo dia às 03:00 (Brasília) apaga notificações com mais de 60 dias (pg_cron) |
| `21-aviso-por-email.sql` | E-mail para o gestor quando um cliente pede corrida (Resend ou Google Apps Script); chaves na tabela privada privado.parametros |
| `22-remover-corridas-canceladas.sql` | O gestor pode apagar corridas CANCELADAS (chat e notificações vão junto); o banco recusa apagar qualquer outra |
| `02-dados-teste.sql` | Cadastra a empresa de exemplo (Garcia Transportes), locais, motoristas, clientes e tarifas |

Ordem: rode o 01, o 02, o 03, o 04, o 05, o 06, o 07, o 08, o 09, o 10, o 11, o 12, o 13, o 14, o 15, o 16, o 17, o 18, o 19, o 20, o 21 e o 22, no SQL Editor do Supabase.

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
- 23-cliente-remove-canceladas.sql — cliente remove as próprias corridas canceladas
- 24-push-firebase.sql — push com app fechado (Firebase); passo a passo em CONFIGURAR-PUSH-FIREBASE.md
- 25-monitor-de-uso.sql — monitor de uso e limites (aba 'Uso e limites' do painel do dono)
- 26-alertas-de-uso.sql — e-mail ao dono quando o uso passa de 80%/95% (pg_cron 'alertas-de-uso', de hora em hora)
- 27-sem-valor-para-o-cliente.sql — o chat não mostra mais o total ao concluir a corrida (cliente não vê preço por enquanto)
- 28-valor-definido-pelo-gestor.sql — cliente pede só com embarque e destino (sem trajeto nem preço); o gestor define o valor de cada corrida (corridas.valor_definido)
