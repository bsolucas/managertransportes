/* =============================================================================
   dados-teste.js — DADOS SIMULADOS (MOTORISTAS, CLIENTES, LOCAIS, CORRIDAS)
   -----------------------------------------------------------------------------
   Enquanto não existe back-end (servidor + banco de dados de verdade), o app
   começa com estes dados de exemplo. Eles são copiados para o "banco local"
   (localStorage do navegador) na primeira vez que o app abre, ou quando você
   clica em "Resetar dados de teste".

   Para adicionar um motorista/cliente/local de teste, é só copiar um item da
   lista e mudar os valores.
   ============================================================================= */

App.dadosTeste = {

  /* ---------------------------------------------------------------------------
     GESTOR (administrador da empresa)
     --------------------------------------------------------------------------- */
  gestor: { id: "g1", nome: "Gestor Teste", email: "gestor@teste.com" },

  /* ---------------------------------------------------------------------------
     LOCAIS DE TESTE (pontos reais de Guaíba-RS e de Porto Alegre, a ~20 km)
     Usados nos formulários de "origem" e "destino". Coordenadas conferidas
     no OpenStreetMap; os nomes marcados como "Pátio", "Oficina", "Concessionária"
     e "Centro Logístico" são FICTÍCIOS, apenas posicionados em bairros reais.
     --------------------------------------------------------------------------- */
  locais: [
    { id: "l1",  nome: "Prefeitura de Guaíba (Centro)",          lat: -30.1139, lng: -51.3294 },
    { id: "l2",  nome: "Aeroporto Salgado Filho (Porto Alegre)", lat: -29.9953, lng: -51.1664 },
    { id: "l3",  nome: "Praça Gastão Leão (Centro, Guaíba)",     lat: -30.1083, lng: -51.3132 },
    { id: "l4",  nome: "Parque Morro José Lutzenberger (Guaíba)", lat: -30.1165, lng: -51.3180 },
    { id: "l5",  nome: "Barra Shopping Sul (Porto Alegre)",      lat: -30.0852, lng: -51.2444 },
    { id: "l6",  nome: "Mercado Público (Porto Alegre)",         lat: -30.0275, lng: -51.2278 },
    { id: "l7",  nome: "Estádio Beira-Rio (Porto Alegre)",       lat: -30.0655, lng: -51.2349 },
    { id: "l8",  nome: "Rodoviária de Porto Alegre",             lat: -30.0227, lng: -51.2190 },
    { id: "l9",  nome: "Pátio da Empresa (Distrito Industrial, Guaíba)", lat: -30.1358, lng: -51.3546 },
    { id: "l10", nome: "Oficina Parceira (Colina, Guaíba)",      lat: -30.1209, lng: -51.3378 },
    { id: "l11", nome: "Concessionária (BR-116, Guaíba)",        lat: -30.1717, lng: -51.3889 },
    { id: "l12", nome: "Centro Logístico (Santa Rita, Guaíba)",  lat: -30.0916, lng: -51.3282 }
  ],

  /* ---------------------------------------------------------------------------
     MOTORISTAS DE TESTE
     - status inicial: "disponivel" ou "offline"
     - rotaLivre: pontos por onde o motorista "circula" quando está livre
       (a simulação faz ele andar em volta desses pontos sem parar).
     --------------------------------------------------------------------------- */
  motoristas: [
    { id: "m1", nome: "Carlos Souza", telefone: "(11) 98888-0001", avaliacao: 4.9,
      servicos: ["carro", "utilitario"], status: "disponivel",
      veiculo: { modelo: "Toyota Corolla", placa: "BRA-2E19", cor: "Prata" },
      rotaLivre: [{ lat: -30.1139, lng: -51.3294 }, { lat: -30.1083, lng: -51.3132 },
                  { lat: -30.1165, lng: -51.3180 }, { lat: -30.1209, lng: -51.3378 }] },

    { id: "m2", nome: "Ana Lima", telefone: "(11) 98888-0002", avaliacao: 4.8,
      servicos: ["carro"], status: "disponivel",
      veiculo: { modelo: "Honda City", placa: "QWE-4A21", cor: "Preto" },
      rotaLivre: [{ lat: -30.1083, lng: -51.3132 }, { lat: -30.1097, lng: -51.3165 },
                  { lat: -30.1165, lng: -51.3180 }, { lat: -30.1129, lng: -51.3312 }] },

    { id: "m3", nome: "João Pereira", telefone: "(11) 98888-0003", avaliacao: 4.7,
      servicos: ["guincho"], status: "disponivel",
      veiculo: { modelo: "VW Delivery Plataforma", placa: "GUI-9C88", cor: "Branco" },
      rotaLivre: [{ lat: -30.1358, lng: -51.3546 }, { lat: -30.1209, lng: -51.3378 },
                  { lat: -30.1170, lng: -51.3375 }, { lat: -30.1139, lng: -51.3294 }] },

    { id: "m4", nome: "Mariana Costa", telefone: "(11) 98888-0004", avaliacao: 5.0,
      servicos: ["carro", "utilitario"], status: "disponivel",
      veiculo: { modelo: "Fiat Fiorino", placa: "FIO-1B23", cor: "Branco" },
      rotaLivre: [{ lat: -30.0916, lng: -51.3282 }, { lat: -30.1083, lng: -51.3132 },
                  { lat: -30.1139, lng: -51.3294 }, { lat: -30.1097, lng: -51.3165 }] },

    { id: "m5", nome: "Roberto Alves", telefone: "(11) 98888-0005", avaliacao: 4.6,
      servicos: ["guincho"], status: "disponivel",
      veiculo: { modelo: "Ford Cargo Plataforma", placa: "PLT-7D45", cor: "Azul" },
      rotaLivre: [{ lat: -30.1717, lng: -51.3889 }, { lat: -30.1358, lng: -51.3546 },
                  { lat: -30.1209, lng: -51.3378 }, { lat: -30.1500, lng: -51.3700 }] },

    { id: "m6", nome: "Fernanda Rocha", telefone: "(11) 98888-0006", avaliacao: 4.9,
      servicos: ["carro"], status: "offline",
      veiculo: { modelo: "Hyundai HB20", placa: "HBX-3F67", cor: "Vermelho" },
      rotaLivre: [{ lat: -30.1209, lng: -51.3378 }, { lat: -30.1170, lng: -51.3375 },
                  { lat: -30.1139, lng: -51.3294 }, { lat: -30.1129, lng: -51.3312 }] }
  ],

  /* ---------------------------------------------------------------------------
     CLIENTES DE TESTE (quem pede as corridas pelo portal)
     --------------------------------------------------------------------------- */
  clientes: [
    { id: "c1", nome: "Paula Mendes",   empresa: "Mendes Consultoria", telefone: "(11) 97777-0001" },
    { id: "c2", nome: "Ricardo Nunes",  empresa: "Auto Center Nunes",  telefone: "(11) 97777-0002" },
    { id: "c3", nome: "Juliana Torres", empresa: "",                   telefone: "(11) 97777-0003" }
  ],

  /* ---------------------------------------------------------------------------
     TARIFAS (regras de preço) — o gestor pode alterar na tela "Tarifas".
     Modo VARIÁVEL: base + (km × preço/km) + (minutos × preço/min),
                    nunca abaixo do mínimo, multiplicado pelas "ocasiões"
                    marcadas (horário de pico, chuva, urgente...).
     Modo FIXO:     valor fechado para um trajeto (origem -> destino) e serviço.
     --------------------------------------------------------------------------- */
  tarifas: {
    modoPadrao: "variavel",
    servicos: {
      carro:      { base: 6.00,  porKm: 2.40, porMinuto: 0.35, minimo: 12.00 },
      utilitario: { base: 15.00, porKm: 3.80, porMinuto: 0.50, minimo: 35.00 },
      guincho:    { base: 90.00, porKm: 6.50, porMinuto: 0.80, minimo: 150.00 }
    },
    ocasioes: {
      pico:    { rotulo: "Horário de pico", multiplicador: 1.30 },
      noturno: { rotulo: "Noturno (22h–6h)", multiplicador: 1.20 },
      chuva:   { rotulo: "Chuva",           multiplicador: 1.15 },
      feriado: { rotulo: "Feriado / fim de semana", multiplicador: 1.25 },
      urgente: { rotulo: "Urgente (prioridade)",    multiplicador: 1.50 }
    },
    tabelaFixa: [
      { id: "tf1", origemId: "l1", destinoId: "l2", servico: "carro",   valor: 85.00 },
      { id: "tf2", origemId: "l9", destinoId: "l10", servico: "guincho", valor: 160.00 },
      { id: "tf3", origemId: "l9", destinoId: "l11", servico: "guincho", valor: 190.00 },
      { id: "tf4", origemId: "l3", destinoId: "l8", servico: "utilitario", valor: 90.00 }
    ]
  },

  /* ---------------------------------------------------------------------------
     CORRIDAS INICIAIS — criadas com horários relativos a "agora", para o
     painel já abrir com histórico do dia (faturamento, ranking etc.).
     "minAtras" = há quantos minutos a corrida foi pedida.
     --------------------------------------------------------------------------- */
  corridasIniciais: [
    { cliente: "c1", motorista: "m1", origem: "l1", destino: "l2", servico: "carro",
      modo: "fixo", status: "concluida", minAtras: 300, ocasioes: [] },
    { cliente: "c2", motorista: "m3", origem: "l9", destino: "l10", servico: "guincho",
      modo: "fixo", status: "concluida", minAtras: 240, ocasioes: ["urgente"],
      extras: [{ descricao: "Pedágio", valor: 8.50 }] },
    { cliente: "c3", motorista: "m2", origem: "l3", destino: "l6", servico: "carro",
      modo: "variavel", status: "concluida", minAtras: 180, ocasioes: ["pico"] },
    { cliente: "c1", motorista: "m4", origem: "l5", destino: "l7", servico: "utilitario",
      modo: "variavel", status: "concluida", minAtras: 120, ocasioes: [] },
    { cliente: "c2", motorista: "m5", origem: "l2", destino: "l11", servico: "guincho",
      modo: "variavel", status: "concluida", minAtras: 90, ocasioes: ["chuva"],
      extras: [{ descricao: "Hora de espera", valor: 40.00 }] },
    { cliente: "c3", motorista: null, origem: "l4", destino: "l1", servico: "carro",
      modo: "variavel", status: "cancelada", minAtras: 60, ocasioes: [] }
  ]
};
