/* =============================================================================
   paginas/cliente.js — COMPORTAMENTO DO PORTAL DO CLIENTE (paginas/cliente.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação
     2. Formulário "Pedir corrida" (origem, destino, serviço, preço, prévia)
     3. Escolher pontos clicando no mapa
     4. Enviar o pedido
     5. "Minhas corridas": lista, acompanhamento, mapa e chat
     6. Atualização automática
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var banco = App.banco;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  banco.iniciar();
  var usuario = App.sessao.exigir("cliente");
  if (!usuario) return;
  ui.montarTopo();
  document.getElementById("usuario-avatar").textContent = u.iniciais(usuario.nome);
  App.simulacao.iniciarMotor(); // motoristas de teste continuam agindo mesmo sem o gestor aberto

  var mapaPedido = App.mapa.criar("mapa-pedido");
  var mapaAcompanhar = App.mapa.criar("mapa-acompanhar");
  var abaAtual = "pedir";
  var corridaSelecionada = null;

  ui.ligarAbas(function (aba) {
    abaAtual = aba;
    if (aba === "pedir") mapaPedido.redimensionar();
    if (aba === "minhas") { mapaAcompanhar.redimensionar(); desenharMinhas(); desenharAcompanhamento(); }
  });

  /* ==========================================================================
     2. FORMULÁRIO "PEDIR CORRIDA"
     ========================================================================== */
  var selOrigem = document.getElementById("pedido-origem");
  var selDestino = document.getElementById("pedido-destino");
  var pontos = { origem: null, destino: null }; // pontos escolhidos {id, nome, lat, lng}

  /* Opções dos selects: os locais de teste + (se houver) o ponto marcado no mapa. */
  function preencherLocais() {
    ["origem", "destino"].forEach(function (qual) {
      var sel = qual === "origem" ? selOrigem : selDestino;
      var opcoes = [{ valor: "", texto: "Selecione..." }];
      if (pontos[qual] && !pontos[qual].id) opcoes.push({ valor: "mapa", texto: "📍 " + pontos[qual].nome });
      banco.listarLocais().forEach(function (l) { opcoes.push({ valor: l.id, texto: l.nome }); });
      var atual = pontos[qual] ? (pontos[qual].id || "mapa") : "";
      ui.preencherSelect(sel, opcoes, atual);
    });
  }

  function aoEscolherNoSelect(qual, valor) {
    if (valor === "mapa") return;
    pontos[qual] = valor ? Object.assign({}, banco.buscarLocal(valor)) : null;
    preencherLocais();
    atualizarPedido();
  }
  selOrigem.addEventListener("change", function () { aoEscolherNoSelect("origem", selOrigem.value); });
  selDestino.addEventListener("change", function () { aoEscolherNoSelect("destino", selDestino.value); });

  /* Serviços (pílulas de escolha única) */
  document.getElementById("pedido-servicos").innerHTML = Object.keys(App.SERVICOS).map(function (s, i) {
    return '<label class="pilula"><input type="radio" name="servico" value="' + s + '"' + (i === 0 ? " checked" : "") + " /> " +
           App.SERVICOS[s].icone + " " + App.SERVICOS[s].rotulo + "</label>";
  }).join("");

  /* Ocasiões: o cliente só escolhe "Urgente". As demais (pico, noturno,
     fim de semana) são aplicadas automaticamente pelo horário. */
  function desenharOcasioes() {
    var tarifas = banco.obterTarifas();
    document.getElementById("pedido-ocasioes").innerHTML =
      '<label class="pilula"><input type="checkbox" id="pedido-urgente" /> ' + u.escaparHtml(tarifas.ocasioes.urgente.rotulo) + "</label>";
    var auto = App.precos.ocasioesSugeridas();
    document.getElementById("ocasioes-automaticas").textContent = auto.length
      ? "Aplicado automaticamente agora: " + auto.map(function (k) { return tarifas.ocasioes[k].rotulo; }).join(", ") + "."
      : "Nenhum acréscimo de horário neste momento.";
  }

  /* Junta tudo que o cliente escolheu num "pedido". */
  function lerPedido() {
    var servico = (ui.$('input[name="servico"]:checked') || {}).value;
    var modo = (ui.$('input[name="modo"]:checked') || {}).value;
    var ocasioes = App.precos.ocasioesSugeridas();
    if (document.getElementById("pedido-urgente").checked) ocasioes.push("urgente");
    return { origem: pontos.origem, destino: pontos.destino, servico: servico, modo: modo, ocasioes: ocasioes };
  }

  /* Recalcula a prévia do preço e redesenha os pontos no mapa. */
  function atualizarPedido() {
    var pedido = lerPedido();
    var previa = document.getElementById("previa-preco");
    var botao = document.getElementById("botao-pedir");

    mapaPedido.limparPontos();
    if (pedido.origem) mapaPedido.marcarPonto(pedido.origem, "A", "ponto-origem");
    if (pedido.destino) mapaPedido.marcarPonto(pedido.destino, "B", "ponto-destino");

    if (!pedido.origem || !pedido.destino) {
      previa.innerHTML = '<p class="texto-suave">Escolha a origem e o destino para ver o valor.</p>';
      botao.disabled = true;
      return null;
    }
    if (u.distanciaKm(pedido.origem, pedido.destino) < 0.05) {
      previa.innerHTML = '<p class="previa-aviso">A origem e o destino precisam ser diferentes.</p>';
      botao.disabled = true;
      return null;
    }
    mapaPedido.enquadrar([pedido.origem, pedido.destino]);

    var calc = App.precos.calcular(pedido, banco.obterTarifas());
    previa.innerHTML =
      "<h3>Valor estimado</h3>" +
      '<table class="composicao-preco">' +
        calc.linhas.map(function (l) { return "<tr><td>" + u.escaparHtml(l.texto) + "</td><td>" + u.moeda(l.valor) + "</td></tr>"; }).join("") +
        '<tr class="linha-total"><td>Total</td><td>' + u.moeda(calc.valor) + "</td></tr>" +
      "</table>" +
      '<p class="texto-suave texto-pequeno">' + calc.distanciaKm.toFixed(1) + " km • cerca de " + calc.tempoMin + " min" +
        " • pedágios e esperas podem ser somados depois.</p>" +
      (calc.aviso ? '<p class="previa-aviso">' + u.escaparHtml(calc.aviso) + "</p>" : "");
    botao.disabled = false;
    return calc;
  }

  document.getElementById("formulario-pedido").addEventListener("change", atualizarPedido);

  /* ==========================================================================
     3. ESCOLHER PONTOS CLICANDO NO MAPA
     ========================================================================== */
  var marcando = null; // "origem" | "destino" | null

  ui.$$("[data-marcar]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      marcando = botao.getAttribute("data-marcar");
      var dica = document.getElementById("dica-mapa");
      dica.hidden = false;
      dica.textContent = "Clique no mapa para marcar a " + (marcando === "origem" ? "ORIGEM" : "o DESTINO") + ".";
    });
  });

  mapaPedido.aoClicar(function (ponto) {
    if (!marcando) return;
    pontos[marcando] = {
      id: null,
      nome: "Ponto no mapa (" + ponto.lat.toFixed(4) + ", " + ponto.lng.toFixed(4) + ")",
      lat: ponto.lat, lng: ponto.lng
    };
    marcando = null;
    document.getElementById("dica-mapa").hidden = true;
    preencherLocais();
    atualizarPedido();
  });

  /* ==========================================================================
     4. ENVIAR O PEDIDO
     ========================================================================== */
  document.getElementById("formulario-pedido").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var calc = atualizarPedido();
    if (!calc) return;
    var pedido = lerPedido();
    var corrida = banco.criarCorrida({
      clienteId: usuario.id,
      origem: pedido.origem,
      destino: pedido.destino,
      servico: pedido.servico,
      ocasioes: pedido.ocasioes,
      calculo: calc,
      observacoes: document.getElementById("pedido-observacoes").value.trim()
    });
    ui.aviso("Corrida " + corrida.codigo + " solicitada! Aguardando um motorista.", "sucesso");

    /* Limpa o formulário e mostra a corrida na aba "Minhas corridas". */
    pontos.origem = pontos.destino = null;
    document.getElementById("pedido-observacoes").value = "";
    document.getElementById("pedido-urgente").checked = false;
    preencherLocais();
    atualizarPedido();
    corridaSelecionada = corrida.id;
    document.querySelector('[data-aba="minhas"]').click();
  });

  /* ==========================================================================
     5. MINHAS CORRIDAS
     ========================================================================== */
  var chat = App.chat.criar(document.getElementById("chat-cliente"));

  function minhasCorridas() {
    return banco.listarCorridas().filter(function (c) { return c.clienteId === usuario.id; })
      .sort(function (a, b) { return b.criadaEm - a.criadaEm; });
  }

  function desenharMinhas() {
    var lista = minhasCorridas();
    if (!corridaSelecionada && lista.length) corridaSelecionada = lista[0].id;
    var chave = App.sessao.chaveUsuario();
    document.getElementById("lista-minhas").innerHTML = lista.length ? lista.map(function (c) {
      var naoLidas = banco.naoLidas(c.id, chave);
      return '<div class="item-corrida' + (c.id === corridaSelecionada ? " selecionado" : "") + '" data-corrida="' + c.id + '">' +
        '<div class="item-corrida-topo"><span class="item-corrida-codigo">' + c.codigo + " " + App.SERVICOS[c.servico].icone + "</span>" +
          (naoLidas ? '<span class="contador-nao-lidas">' + naoLidas + "</span>" : ui.seloStatus(c.status)) + "</div>" +
        '<div class="item-corrida-rota"><span>De:</span> ' + u.escaparHtml(c.origem.nome) + "<br><span>Para:</span> " + u.escaparHtml(c.destino.nome) + "</div>" +
        '<div class="item-corrida-rodape"><span>' + u.dataHora(c.criadaEm) + '</span><span class="item-corrida-valor">' + u.moeda(App.precos.totalCorrida(c)) + "</span></div>" +
      "</div>";
    }).join("") : '<div class="lista-vazia">Você ainda não pediu nenhuma corrida.</div>';
    if (chat.corridaAtual() !== corridaSelecionada) chat.abrir(corridaSelecionada);
  }

  document.getElementById("lista-minhas").addEventListener("click", function (ev) {
    var item = ev.target.closest("[data-corrida]");
    if (!item) return;
    corridaSelecionada = item.getAttribute("data-corrida");
    desenharMinhas();
    desenharAcompanhamento();
  });

  /* Cartão com a situação da corrida selecionada. */
  function desenharAcompanhamento() {
    var area = document.getElementById("acompanhamento");
    var c = corridaSelecionada && banco.buscarCorrida(corridaSelecionada);
    if (!c) {
      area.innerHTML = '<p class="texto-suave">Selecione uma corrida para acompanhar.</p>';
      mapaAcompanhar.limparCorrida();
      return;
    }
    var m = c.motoristaId ? banco.buscarMotorista(c.motoristaId) : null;
    var podeCancelar = c.status === "aguardando" || c.status === "aceita";

    var blocoMotorista = m
      ? '<div class="acompanhamento-motorista">' + ui.avatar(m.nome, "avatar-grande") +
          "<div><strong>" + u.escaparHtml(m.nome) + "</strong> • ⭐ " + m.avaliacao +
          '<div class="texto-suave texto-pequeno">' + u.escaparHtml(m.veiculo.modelo + " • " + m.veiculo.cor + " • placa " + m.veiculo.placa) + "</div></div></div>"
      : (c.status === "aguardando" ? '<p class="texto-suave">Procurando um motorista disponível...</p>' : "");

    var blocoPrevisao = "";
    if (c.status === "aceita" || c.status === "em_andamento") {
      blocoPrevisao =
        '<div class="texto-suave texto-pequeno">' + (c.status === "aceita" ? "Motorista chegando à origem" : "Chegada ao destino") + "</div>" +
        '<div class="acompanhamento-previsao" data-previsao="' + c.id + '"></div>' +
        '<div class="progresso"><div class="progresso-barra" data-progresso="' + c.id + '"></div></div>';
    }

    area.innerHTML =
      '<div class="acompanhamento-topo"><h2>Corrida ' + c.codigo + "</h2>" + ui.seloStatus(c.status) + "</div>" +
      blocoMotorista + blocoPrevisao +
      '<dl class="lista-dados">' +
        "<dt>Origem</dt><dd>" + u.escaparHtml(c.origem.nome) + "</dd>" +
        "<dt>Destino</dt><dd>" + u.escaparHtml(c.destino.nome) + "</dd>" +
        "<dt>Serviço</dt><dd>" + App.SERVICOS[c.servico].icone + " " + App.SERVICOS[c.servico].rotulo + "</dd>" +
        "<dt>Valor</dt><dd>" + u.moeda(c.valor) + (App.precos.totalExtras(c) ? " + extras " + u.moeda(App.precos.totalExtras(c)) : "") +
          " = <strong>" + u.moeda(App.precos.totalCorrida(c)) + "</strong></dd>" +
      "</dl>" +
      (podeCancelar ? '<div class="acoes-corrida"><button class="botao botao-perigo" id="cancelar-minha">Cancelar corrida</button></div>' : "");

    mapaAcompanhar.mostrarCorrida(c);
    atualizarTempoReal();

    var btn = document.getElementById("cancelar-minha");
    if (btn) btn.addEventListener("click", function () {
      ui.confirmar("Cancelar a corrida " + c.codigo + "?").then(function (sim) {
        if (sim) { banco.cancelarCorrida(c.id, "cancelada pelo cliente"); ui.aviso("Corrida cancelada.", "info"); }
      });
    });
  }

  /* Partes que mudam a cada segundo (sem redesenhar o cartão inteiro). */
  function atualizarTempoReal() {
    var c = corridaSelecionada && banco.buscarCorrida(corridaSelecionada);
    if (!c) return;
    var agora = Date.now();

    /* No mapa: o motorista da corrida, ou os motoristas livres por perto. */
    var lista;
    if (c.motoristaId && (c.status === "aceita" || c.status === "em_andamento")) {
      var m = banco.buscarMotorista(c.motoristaId);
      lista = [{ motorista: m, posicao: App.simulacao.posicaoMotorista(m, agora), destaque: true }];
    } else if (c.status === "aguardando") {
      lista = banco.listarMotoristas().filter(function (m) { return m.status === "disponivel"; })
        .map(function (m) { return { motorista: m, posicao: App.simulacao.posicaoMotorista(m, agora), destaque: false }; });
    } else {
      lista = [];
    }
    mapaAcompanhar.mostrarMotoristas(lista);

    ui.$$("[data-progresso]").forEach(function (b) {
      b.style.width = Math.round(App.simulacao.progressoCorrida(c, agora) * 100) + "%";
    });
    ui.$$("[data-previsao]").forEach(function (el) {
      var s = App.simulacao.segundosRestantes(c, agora);
      el.textContent = s > 0 ? "≈ " + (s >= 60 ? Math.ceil(s / 60) + " min" : s + " s") : "Chegando!";
    });
  }

  /* Contador de mensagens não lidas na aba "Minhas corridas". */
  function desenharContador() {
    var chave = App.sessao.chaveUsuario();
    var total = minhasCorridas().reduce(function (s, c) {
      return s + (c.id === corridaSelecionada && abaAtual === "minhas" ? 0 : banco.naoLidas(c.id, chave));
    }, 0);
    var el = document.getElementById("contador-cliente");
    el.hidden = !total;
    el.textContent = total;
  }

  /* ==========================================================================
     6. ATUALIZAÇÃO AUTOMÁTICA
     ========================================================================== */
  var statusConhecido = {};
  minhasCorridas().forEach(function (c) { statusConhecido[c.id] = c.status; });

  banco.aoMudar(function (chave) {
    /* Avisa quando o status de uma corrida do cliente muda. */
    minhasCorridas().forEach(function (c) {
      if (statusConhecido[c.id] && statusConhecido[c.id] !== c.status) {
        ui.aviso("Corrida " + c.codigo + ": " + App.STATUS_CORRIDA[c.status].rotulo + ".", c.status === "cancelada" ? "erro" : "sucesso");
      }
      statusConhecido[c.id] = c.status;
    });
    if (chave === "tarifas") { desenharOcasioes(); atualizarPedido(); }
    if (chave === "locais" || chave === "tudo") preencherLocais();
    if (abaAtual === "minhas" && (chave === "corridas" || chave === "motoristas" || chave === "tudo")) desenharAcompanhamento();
    if (abaAtual === "minhas") desenharMinhas();
    desenharContador();
  });

  setInterval(function () {
    if (abaAtual === "minhas") atualizarTempoReal();
  }, 1000);

  /* Primeiro desenho */
  preencherLocais();
  desenharOcasioes();
  atualizarPedido();
  desenharContador();
})();
