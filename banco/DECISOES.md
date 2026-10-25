# Decisões tomadas sem consulta (podem ser mudadas)

Você pediu para eu decidir quando você não estivesse por perto. Tudo abaixo é ajustável.

| Assunto | O que escolhi | Como mudar |
|---|---|---|
| Fechamento padrão do cliente | `mensal` (1 ao último dia do mês) | coluna `clientes.fechamento` (`quinzenal` ou `mensal`) |
| Quinzena | 1–15 e 16–último dia do mês (28, 29, 30 ou 31) | função `privado.periodo_fechamento` |
| Que corridas entram no total | só `concluida`; data = `data_servico`, senão data de conclusão | view `v_totais_periodo` |
| Corrida duplicada na planilha | mesmo voucher na mesma empresa é recusado | índice `corridas_voucher_unico` |
| Motorista/cliente com login | papéis `motorista` e `cliente`; veem só o que é deles | policies em `03-*.sql` |
| Notificações | criadas no banco ao nascer/aceitar/concluir/cancelar corrida (gestor, motoristas disponíveis com login, cliente) | trigger `corridas_notificar` |
| Push no celular | tabela `dispositivos` pronta; envio via Firebase (FCM) ainda precisa da sua conta Firebase | — |
| Mapa | Google Maps quando houver chave em `js/config-mapa.js`; sem chave, continua o mapa livre (Leaflet) | `js/config-mapa.js` |
| Nome | "Manager Transportes" no site e no repositório | — |
