# Manager Transportes — protótipo (front-end)

Protótipo web, para computador, de um app de transporte:

- **Gestor:** acompanha corridas e motoristas em tempo real no mapa, designa motoristas, ajusta valores, soma extras, vê o financeiro e configura as tarifas.
- **Motorista:** fica disponível ou offline, aceita corridas, inicia e conclui, conversa no chat e vê os ganhos.
- **Cliente:** pede corrida (vê o preço antes), acompanha o motorista no mapa e conversa no chat.

> **Ainda não existe back-end.** Os dados ficam guardados no próprio navegador
> (localStorage), e as posições dos motoristas são **simuladas**.
> Tudo o que você vê é de teste.

---

## Como abrir

### No VS Code (recomendado)
1. **Arquivo → Abrir Pasta…** e escolha `D:\ProjetoAPP`.
2. O VS Code vai sugerir a extensão **Live Server**. Instale.
3. Clique com o botão direito em `index.html` → **Open with Live Server**.
4. O navegador abre em `http://127.0.0.1:5500`.

### Sem o VS Code
Dê dois cliques em `index.html` (funciona no Chrome e no Edge).

**Precisa de internet** para carregar o mapa (OpenStreetMap).

## Celular

Todas as telas funcionam em celular (o CSS está em `css/responsivo.css`):
topo compacto, menu e abas que rolam para o lado, tabelas viram cartões,
janelas ocupam a tela toda e os campos têm tamanho bom para o toque.

Para ver no seu celular, com o computador e o celular **na mesma rede Wi-Fi**:
1. Abra o projeto com o Live Server.
2. No celular, digite no navegador `http://IP-DO-COMPUTADOR:5500`
   (o IP aparece no Windows com o comando `ipconfig`, linha "Endereço IPv4").

> **Atenção:** os dados de teste ficam guardados **dentro de cada navegador**.
> Um celular e um computador **não compartilham** corridas nem chat até existir
> o back-end. Para testar o fluxo entre perfis, use várias abas no mesmo aparelho.

## Como testar o fluxo completo

1. Abra o app e entre como **Cliente**.
2. Abra **outra aba** no mesmo endereço e entre como **Gestor**.
3. (Opcional) abra uma terceira aba como **Motorista**.
4. Na aba do cliente, peça uma corrida. Ela aparece na hora no painel do gestor e na lista do motorista.
5. Aceite pela tela do motorista ou designe pelo gestor. Se ninguém aceitar em 10 segundos, um **motorista de teste** aceita sozinho.
6. Converse pelo chat: as mensagens aparecem em todas as abas.

- Cada aba pode ter um perfil diferente: o login fica guardado **por aba**.
- O interruptor **Simulação automática**, no topo do gestor, liga e desliga os motoristas de teste.
- O botão **Resetar dados de teste** volta tudo ao início.
- Enquanto uma aba de motorista está aberta, quem controla aquele motorista é você; a simulação não mexe nele.

---

## Organização das pastas

HTML, CSS e JavaScript ficam **sempre em arquivos separados**. Nenhuma página
tem `<style>` nem `<script>` com código dentro, nem `onclick=` no HTML.

```
ProjetoAPP/
├── index.html                 Tela inicial (escolha de perfil)
├── paginas/                   Uma página por perfil
│   ├── gestor.html
│   ├── motorista.html
│   └── cliente.html
├── css/                       VISUAL
│   ├── base.css               Cores (azul forte + preto), fontes, regras básicas
│   ├── layout.css             Estrutura: topo, menu lateral, abas, colunas
│   ├── componentes.css        Botões, campos, cartões, tabelas, selos, modal, chat
│   ├── mapa.css               Mapa e marcadores
│   ├── responsivo.css         Ajustes para celular (sempre carregado por último)
│   └── paginas/               Ajustes exclusivos de cada página
│       ├── login.css
│       ├── gestor.css
│       ├── planilhas.css      Aba Planilhas do gestor
│       ├── clientes.css       Aba Clientes e logotipo da empresa no topo
│       ├── motorista.css
│       └── cliente.css
├── js/                        COMPORTAMENTO
│   ├── config.js              Configurações (nome, mapa, velocidade da simulação)
│   ├── utilitarios.js         Formatar dinheiro e datas, distância entre pontos
│   ├── dados-teste.js         Motoristas, clientes, locais, tarifas e corridas de exemplo
│   ├── precos.js              Cálculo do preço (fixo ou variável) e soma dos extras
│   ├── nuvem.js               Dados da empresa no Supabase (clientes, corridas, chat...)
│   ├── auth-supabase.js       Login real (gestor, motorista e cliente)
│   ├── sessao.js              Quem está logado em cada aba
│   ├── interface.js           Avisos, janelas (modal), selos de status
│   ├── mapa.js                Mapa ao vivo (biblioteca Leaflet)
│   ├── chat.js                Chat de cada corrida
│   ├── planilhas.js           Converte o CSV da empresa em planilha .xlsx com os totais
│   └── paginas/               Comportamento de cada página
│       ├── login.js
│       ├── gestor.js
│       ├── gestor-planilhas.js   Tela da aba Planilhas (anexar, conferir, baixar)
│       ├── gestor-clientes.js    Empresa do gestor no topo + aba Clientes (cadastro)
│       ├── motorista.js
│       └── cliente.js
└── .vscode/                   Configurações do VS Code para este projeto
```

**Ordem dos scripts:** cada página carrega `config.js` primeiro e o seu
`js/paginas/*.js` por último, porque os arquivos do meio dependem dos anteriores.

## Login real e banco de dados (Supabase) — em andamento

- **Etapa 1 (pronta):** o gestor entra com usuário e senha pelo **Supabase Auth**
  (`js/auth-supabase.js`, `js/config-supabase.js`). O logotipo e o nome da empresa vêm do banco.
  Sem login válido, o painel volta para a tela inicial.
- **Etapas 2 e 3 (prontas):** clientes, motoristas, trajetos/valores, corridas e chat estão no banco
  (`js/nuvem.js`). Gestor, motorista **e cliente** entram com usuário e senha. O cliente escolhe um
  trajeto da lista da empresa (o valor vem do banco, não dá para alterar), informa o embarque, acompanha
  o motorista pelo GPS e conversa no chat. O banco provisório do navegador (`banco-local.js`) foi removido.
- O SQL do banco está em `banco/` (estrutura, segurança por empresa e dados de teste).
- Em `js/config-supabase.js` ficam só o endereço do projeto e a chave **pública**; segredos nunca entram no código.

## Empresa do gestor e aba "Clientes"

- **Topo do painel:** mostra o logotipo (sigla em quadradinho azul) e o nome da empresa do gestor.
  Hoje é o exemplo **GT — Garcia Transportes**; os dados ficam em `js/dados-teste.js` (`empresa`).
- **Menu → Clientes** (logo abaixo de "Chat"): cadastro das empresas terceirizadas que contratam o
  transporte e pedem corridas. Dá para criar, editar, ativar/desativar, excluir e buscar.
  CNPJ e telefone têm máscara; o CNPJ é validado e não pode repetir. Quem já tem corridas não é
  excluído (desative em vez disso). Clientes inativos somem da lista de entrada do portal do cliente.
- Os dados ficam no banco local do navegador (`App.banco.salvarCliente`, `excluirCliente`).

## Planilhas (gestor → aba "Planilhas")

O sistema da empresa exporta um arquivo `.csv` que na verdade é uma planilha do
Excel com **cada linha inteira dentro da coluna A** (campos separados por vírgula,
colados numa célula só). Por isso o Excel não soma e os acentos saem quebrados.

Na aba **Planilhas** o gestor anexa (ou arrasta) o arquivo e o app:
1. separa as 16 colunas e conserta os acentos (`SÃ£o` → `São`);
2. transforma Km e valores em número e a data em data de verdade;
3. soma o **Valor Total** e o **Valor Estimado** (em centavos, sem erro de arredondamento),
   mostra os totais por motorista e por status e uma prévia das corridas;
4. entrega o `.xlsx` pronto para baixar, com a linha **TOTAL** (fórmula SOMA) e a aba **Resumo**.

Tudo acontece **no navegador** (o arquivo não é enviado a lugar nenhum), com a
biblioteca ExcelJS. Também aceita um `.csv` de texto comum (separador `,` ou `;`).
Planilhas `.xls` antigas precisam ser salvas como `.xlsx` antes.

## Onde mexer para…

| Quero… | Arquivo |
|---|---|
| Mudar as cores do app | `css/base.css` (variáveis no topo) |
| Mudar o nome do app | `js/config.js` → `NOME_APP` |
| Ajustar o visual no celular | `css/responsivo.css` |
| Adicionar motorista, cliente ou local de teste | `js/dados-teste.js` |
| Mudar as tarifas padrão | `js/dados-teste.js` → `tarifas` (ou pela tela Tarifas do gestor) |
| Mudar a regra do preço | `js/precos.js` |
| Deixar a simulação mais rápida ou mais lenta | `js/config.js` → `VELOCIDADE_SIMULADA_KMH` |
| Tempo até o motorista de teste aceitar sozinho | `js/config.js` → `AUTO_ACEITE_SEGUNDOS` |
| Mudar o que a planilha convertida mostra (colunas, totais, abas) | `js/planilhas.js` |

## Regras de preço

- **Variável:** `base + km × preço/km + minutos × preço/min`, respeitando o valor mínimo de cada serviço. Depois o valor é multiplicado pelas **ocasiões**:
  - pico, noturno e fim de semana entram automaticamente pelo horário;
  - **urgente** é escolhido pelo cliente;
  - **chuva** está prevista na tabela de tarifas, mas ainda não tem onde ser marcada nas telas.
- **Fixo:** valor fechado por trajeto e serviço, na tabela do gestor (vale também para a volta). Se o trajeto não estiver na tabela, o cálculo usa o preço variável e avisa.
- **Extras:** pedágio, hora de espera etc., somados ao valor pelo gestor.

**Total da corrida = valor + extras.**

## Próximos passos (quando formos para o back-end)

- Planilha gravando no banco, totais por período e fechamento quinzenal/mensal.
- Push com o app fechado (Firebase) e empacotamento para a Play Store.

## Landing page (Manager Transportes)

Página de apresentação e venda, em `landing/`. Fica em um endereço separado
(`seu-site.vercel.app/landing/`); a página principal do app (`index.html`) não foi alterada.
Para trocar o número de WhatsApp, o nome da marca ou o link do sistema, edite `landing/js/config.js`.
