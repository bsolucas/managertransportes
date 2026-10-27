/* =============================================================================
   config.js — CONFIGURAÇÕES GERAIS DO APP
   -----------------------------------------------------------------------------
   Tudo que é "ajustável" sem mexer na lógica fica aqui: nome do app, centro do
   mapa, velocidade da simulação, nomes das chaves usadas no armazenamento etc.
   Este é o PRIMEIRO script carregado em todas as páginas: ele cria o objeto
   global "App", onde os outros arquivos penduram suas funções
   (App.utils, App.banco, App.precos, App.mapa, ...).
   ============================================================================= */

window.App = window.App || {};

App.config = {
  /* MODO TESTE: com "true", o CNPJ do cliente (aba Clientes) é aceito mesmo com dígitos inválidos
     (só o tamanho de 14 números é conferido). Desligue ("false") antes de divulgar o sistema. */
  ACEITAR_DOCUMENTO_INVALIDO: true,

  /* Nome exibido no topo das páginas e no título da aba. */
  NOME_APP: "Manager Transportes",

  /* Centro inicial do mapa (Guaíba-RS) e zoom padrão. */
  MAPA_CENTRO: [-30.1139, -51.3294],
  MAPA_ZOOM: 13,

  /* Simulação de movimento dos motoristas.
     Velocidade "acelerada" para dar para ver o carro andando na tela.
     300 km/h na simulação ≈ 1 km a cada 12 segundos. */
  VELOCIDADE_SIMULADA_KMH: 300,

  /* Fator que transforma a distância em linha reta em distância "de rua"
     (as ruas fazem curvas, então a distância real é maior). */
  FATOR_RUA: 1.3,

  /* Velocidade média REAL usada só para estimar o tempo da corrida no preço. */
  VELOCIDADE_MEDIA_REAL_KMH: 28,

  /* Simulação automática (feita pelos motoristas de teste que ninguém está
     controlando): depois de quantos segundos uma corrida sem resposta é
     aceita automaticamente pelo motorista livre mais próximo. */
  AUTO_ACEITE_SEGUNDOS: 10,

  /* Prefixo de todas as chaves gravadas no localStorage do navegador. */
  PREFIXO_ARMAZENAMENTO: "transporteApp:",

  /* Moeda usada na formatação de valores. */
  MOEDA: "BRL",
  LOCALIDADE: "pt-BR"
};

/* Situações (status) possíveis de uma corrida, na ordem do fluxo normal. */
App.STATUS_CORRIDA = {
  aguardando:   { rotulo: "Aguardando motorista", classe: "status-aguardando" },
  aceita:       { rotulo: "Motorista a caminho",  classe: "status-aceita" },
  em_andamento: { rotulo: "Em andamento",         classe: "status-andamento" },
  concluida:    { rotulo: "Concluída",            classe: "status-concluida" },
  cancelada:    { rotulo: "Cancelada",            classe: "status-cancelada" }
};

/* Situações possíveis de um motorista. */
App.STATUS_MOTORISTA = {
  disponivel: { rotulo: "Disponível", classe: "motorista-disponivel" },
  em_corrida: { rotulo: "Em corrida", classe: "motorista-em-corrida" },
  offline:    { rotulo: "Offline",    classe: "motorista-offline" }
};

/* Tipos de serviço que a empresa oferece. O ícone de cada um é colocado por js/icones.js. */
App.SERVICOS = {
  carro:      { rotulo: "Carro / táxi (passageiros)",   icone: "" },
  van:        { rotulo: "Van / fretamento",             icone: "" },
  onibus:     { rotulo: "Ônibus",                       icone: "" },
  utilitario: { rotulo: "Utilitário / carga leve",      icone: "" }
};
