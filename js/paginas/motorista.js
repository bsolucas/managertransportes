/* =============================================================================
   paginas/motorista.js — COMPORTAMENTO DA TELA DO MOTORISTA (paginas/motorista.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação (e "batida de coração" que avisa que há uma pessoa aqui)
     2. Disponível / Offline (e GPS)
     3. Corrida atual (iniciar, concluir, cancelar)
     4. Corridas disponíveis (aceitar)
     5. Mapa e chat
     6. Ganhos
     7. Atualização automática
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var banco = App.banco;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  banco.iniciar();
  var usuario = App.sessao.exigir("motorista");
  if (!usuario) return;
  App.auth.exigirLogin();          // sem login válido no Supabase, volta para o início
  App.banco.garantirMotorista(Object.assign({}, usuario.dados, { id: usuario.id, nome: usuario.nome }));
  ui.montarTopo();
  document.getElementById("usuario-avatar").textContent = u.iniciais(usuario.nome);
  App.simulacao.iniciarMotor(); // os OUTROS motoristas de teste continuam agindo

  function eu() { return banco.buscarMotorista(usuario.id); }

  /* Enquanto esta aba estiver aberta, avisa a cada 2 s que este motorista é
     controlado por uma pessoa (a simulação automática não mexe nele). */
  banco.marcarControleManual(usuario.id);
  setInterval(function () { banco.marcarControleManual(usuario.id); }, 2000);

  var mapa = App.mapa.criar("mapa-motorista");
  var chat = App.chat.criar(document.getElementById("chat-motorista"));
  var abaAtual = "corridas";

  ui.ligarAbas(function (aba) {
    abaAtual = aba;
    if (aba === "corridas") mapa.redimensionar();
    if (aba === "ganhos") desenharGanhos();
  });

  var m0 = eu();
  document.getElementById("veiculo-motorista").textContent = m0.veiculo.modelo + " • " + m0.veiculo.placa;
  var elServicos = document.getElementById("servicos-motorista");
  elServicos.textContent = m0.servicos.map(function (s) { return App.SERVICOS[s].icone; }).join(" ");
  elServicos.title = "Seus serviços: " + m0.servicos.map(function (s) { return App.SERVICOS[s].rotulo; }).join(", ");

  /* ==========================================================================
     2. DISPONÍVEL / OFFLINE
     ========================================================================== */
  var chkDisp = document.getElementById("disponibilidade");

  function desenharDisponibilidade() {
    var m = eu();
    chkDisp.checked = m.status !== "offline";
    chkDisp.disabled = m.status === "em_corrida"; // não dá para ficar offline no meio da corrida
    document.getElementById("disponibilidade-texto").textContent = App.STATUS_MOTORISTA[m.status].rotulo;
    sincronizarGps();
  }

  /* GPS: enquanto o motorista NÃO está offline, manda a posição real do aparelho
     ao Supabase (o gestor vê no mapa). Ao ficar offline, para e apaga a posição. */
  var elGps = document.getElementById("gps-estado");
  var pararGps = null;       // função que encerra o envio (null = GPS desligado)
  var statusEnviado = null;  // último status gravado no banco

  function sincronizarGps() {
    var status = eu().status;
    var deveEnviar = status !== "offline";
    if (deveEnviar && !pararGps) {
      elGps.textContent = "📡 Procurando GPS…";
      pararGps = App.rastreio.iniciarEnvio(usuario.id, usuario.empresa.id, null, {
        aoPosicao: function () { elGps.textContent = "📡 GPS ativo"; },
        aoErro: function (texto) { elGps.textContent = "⚠️ GPS sem sinal"; elGps.title = texto; ui.aviso(texto, "erro"); }
      });
    } else if (!deveEnviar && pararGps) {
      pararGps();
      pararGps = null;
      App.rastreio.removerPosicao(usuario.id);
      elGps.textContent = "";
    }
    if (status !== statusEnviado) {
      statusEnviado = status;
      App.rastreio.definirStatus(usuario.id, status);
    }
  }

  chkDisp.addEventListener("change", function () {
    banco.atualizarMotorista(usuario.id, { status: chkDisp.checked ? "disponivel" : "offline" });
    ui.aviso(chkDisp.checked ? "Você está disponível para receber corridas." : "Você está offline.", "info");
  });

  /* ==========================================================================
     3. CORRIDA ATUAL
     ========================================================================== */
  function desenharCorridaAtual() {
    var area = document.getElementById("corrida-atual");
    var c = banco.corridaAtivaDoMotorista(usuario.id);
    area.classList.toggle("corrida-atual-ativa", !!c);

    if (!c) {
      area.innerHTML = "<h2>Corrida atual</h2>" +
        '<p class="texto-suave">Nenhuma corrida em andamento. ' +
        (eu().status === "offline" ? "Fique disponível para receber corridas." : "Aceite uma corrida disponível abaixo.") + "</p>";
      mapa.limparCorrida();
      return;
    }

    var cliente = banco.buscarCliente(c.clienteId) || {};
    var etapa = c.status === "aceita" ? "Vá até a origem: " + c.origem.nome : "Leve até o destino: " + c.destino.nome;

    area.innerHTML =
      '<div class="cartao-cabecalho"><h2>Corrida ' + c.codigo + "</h2>" + ui.seloStatus(c.status) + "</div>" +
      '<div class="corrida-atual-etapa">' + u.escaparHtml(etapa) + "</div>" +
      '<div class="corrida-atual-previsao" data-previsao="' + c.id + '"></div>' +
      '<div class="progresso"><div class="progresso-barra" data-progresso="' + c.id + '"></div></div>' +
      '<dl class="lista-dados detalhe-espacado">' +
        "<dt>Cliente</dt><dd>" + u.escaparHtml(cliente.nome) + " • " + u.escaparHtml(cliente.telefone || "") + "</dd>" +
        "<dt>Origem</dt><dd>" + u.escaparHtml(c.origem.nome) + "</dd>" +
        "<dt>Destino</dt><dd>" + u.escaparHtml(c.destino.nome) + "</dd>" +
        "<dt>Serviço</dt><dd>" + App.SERVICOS[c.servico].icone + " " + App.SERVICOS[c.servico].rotulo + "</dd>" +
        (c.observacoes ? "<dt>Observações</dt><dd>" + u.escaparHtml(c.observacoes) + "</dd>" : "") +
        "<dt>Valor</dt><dd><strong>" + u.moeda(App.precos.totalCorrida(c)) + "</strong></dd>" +
      "</dl>" +
      '<div class="acoes-corrida">' +
        (c.status === "aceita"
          ? '<button class="botao botao-primario" id="botao-iniciar" data-precisa-chegar>Cheguei — iniciar corrida</button>'
          : '<button class="botao botao-sucesso" id="botao-concluir" data-precisa-chegar>Concluir corrida</button>') +
        (c.status === "aceita" ? '<button class="botao botao-perigo" id="botao-cancelar">Cancelar</button>' : "") +
      "</div>";

    mapa.mostrarCorrida(c);
    if (chat.corridaAtual() !== c.id) chat.abrir(c.id);
    atualizarTempoReal();

    var bIniciar = document.getElementById("botao-iniciar");
    if (bIniciar) bIniciar.addEventListener("click", function () {
      banco.iniciarCorrida(c.id);
      ui.aviso("Corrida iniciada. Boa viagem!", "sucesso");
    });
    var bConcluir = document.getElementById("botao-concluir");
    if (bConcluir) bConcluir.addEventListener("click", function () {
      banco.concluirCorrida(c.id);
      ui.aviso("Corrida concluída! " + u.moeda(App.precos.totalCorrida(banco.buscarCorrida(c.id))) + " somados aos seus ganhos.", "sucesso");
    });
    var bCancelar = document.getElementById("botao-cancelar");
    if (bCancelar) bCancelar.addEventListener("click", function () {
      ui.confirmar("Cancelar esta corrida? O cliente será avisado.").then(function (sim) {
        if (sim) banco.cancelarCorrida(c.id, "cancelada pelo motorista");
      });
    });
  }

  /* ==========================================================================
     4. CORRIDAS DISPONÍVEIS
     ========================================================================== */
  function corridasDisponiveis() {
    var m = eu();
    return banco.listarCorridas().filter(function (c) {
      return c.status === "aguardando" && m.servicos.indexOf(c.servico) !== -1;
    });
  }

  function desenharDisponiveis() {
    var area = document.getElementById("lista-disponiveis");
    var m = eu();
    var lista = corridasDisponiveis();

    var contador = document.getElementById("contador-disponiveis");
    contador.hidden = !lista.length || m.status !== "disponivel";
    contador.textContent = lista.length;

    if (m.status === "offline") { area.innerHTML = '<div class="aviso-offline">Você está offline. Ligue "Disponível" no topo para ver corridas.</div>'; return; }
    if (m.status === "em_corrida") { area.innerHTML = '<div class="aviso-offline">Termine a corrida atual para aceitar outra.</div>'; return; }

    var posicao = App.simulacao.posicaoMotorista(m);
    lista.sort(function (a, b) { return u.distanciaKm(posicao, a.origem) - u.distanciaKm(posicao, b.origem); });

    area.innerHTML = lista.length ? lista.map(function (c) {
      var km = u.distanciaRuaKm(posicao, c.origem);
      return '<div class="item-corrida item-disponivel">' +
        '<div class="item-corrida-topo"><span class="item-corrida-codigo">' + c.codigo + " " + App.SERVICOS[c.servico].icone + "</span>" +
          '<span class="distancia-ate-cliente">' + km.toFixed(1) + " km até o cliente</span></div>" +
        '<div class="item-corrida-rota"><span>De:</span> ' + u.escaparHtml(c.origem.nome) + "<br><span>Para:</span> " + u.escaparHtml(c.destino.nome) + "</div>" +
        '<div class="item-corrida-rodape"><span>' + c.calculo.distanciaKm.toFixed(1) + " km de trajeto • " + u.tempoRelativo(c.criadaEm) + "</span>" +
          '<span class="item-corrida-valor">' + u.moeda(App.precos.totalCorrida(c)) + "</span></div>" +
        '<div class="acoes-corrida"><button class="botao botao-primario botao-largo" data-aceitar="' + c.id + '">Aceitar corrida</button></div>' +
      "</div>";
    }).join("") : '<div class="lista-vazia">Nenhuma corrida disponível agora. Fique de olho!</div>';
  }

  document.getElementById("lista-disponiveis").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-aceitar]");
    if (!b) return;
    var ok = banco.aceitarCorrida(b.getAttribute("data-aceitar"), usuario.id, "motorista");
    ui.aviso(ok ? "Corrida aceita! Vá até a origem." : "Outro motorista aceitou primeiro.", ok ? "sucesso" : "erro");
  });

  /* ==========================================================================
     5. MAPA E TEMPO REAL
     ========================================================================== */
  function atualizarTempoReal() {
    var agora = Date.now();
    var m = eu();
    var posicao = App.simulacao.posicaoMotorista(m, agora);
    mapa.mostrarMotoristas([{ motorista: m, posicao: posicao, destaque: true }]);

    var c = banco.corridaAtivaDoMotorista(usuario.id);
    if (!c) return;
    var progresso = App.simulacao.progressoCorrida(c, agora);
    ui.$$("[data-progresso]").forEach(function (b) { b.style.width = Math.round(progresso * 100) + "%"; });
    ui.$$("[data-previsao]").forEach(function (el) {
      var s = App.simulacao.segundosRestantes(c, agora);
      el.textContent = s > 0 ? "Chegada em ≈ " + (s >= 60 ? Math.ceil(s / 60) + " min" : s + " s") + " (simulação)" : "Você chegou!";
    });
    /* Os botões "iniciar"/"concluir" só liberam quando o GPS indica que chegou. */
    ui.$$("[data-precisa-chegar]").forEach(function (b) { b.disabled = progresso < 1; });
  }

  var jaCentralizou = false;
  function centralizarNoInicio() {
    if (jaCentralizou) return;
    jaCentralizou = true;
    mapa.focar(App.simulacao.posicaoMotorista(eu()), 14);
  }

  /* ==========================================================================
     6. GANHOS
     ========================================================================== */
  function desenharGanhos() {
    var minhas = banco.listarCorridas().filter(function (c) { return c.motoristaId === usuario.id && c.status === "concluida"; })
      .sort(function (a, b) { return b.concluidaEm - a.concluidaEm; });
    var inicioHoje = new Date(new Date().toDateString()).getTime();
    var hoje = minhas.filter(function (c) { return c.concluidaEm >= inicioHoje; });
    var semana = minhas.filter(function (c) { return c.concluidaEm >= Date.now() - 7 * 86400000; });
    var soma = function (l) { return l.reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0); };

    document.getElementById("indicadores-ganhos").innerHTML = [
      ["Hoje", u.moeda(soma(hoje)), u.plural(hoje.length, "corrida", "corridas")],
      ["Últimos 7 dias", u.moeda(soma(semana)), u.plural(semana.length, "corrida", "corridas")],
      ["Total", u.moeda(soma(minhas)), u.plural(minhas.length, "corrida", "corridas")]
    ].map(function (i) {
      return '<div class="cartao indicador"><div class="indicador-rotulo">' + i[0] + '</div><div class="indicador-valor">' + i[1] +
             '</div><div class="indicador-detalhe">' + i[2] + "</div></div>";
    }).join("");

    document.getElementById("tabela-ganhos").innerHTML = minhas.length ? minhas.map(function (c) {
      return '<tr><td data-rotulo="Corrida"><strong>' + c.codigo + "</strong></td><td data-rotulo=\"Concluída\">" + u.dataHora(c.concluidaEm) + "</td>" +
        '<td data-rotulo="Trajeto" class="trajeto-celula">' + u.escaparHtml(c.origem.nome) + " → " + u.escaparHtml(c.destino.nome) + "</td>" +
        '<td data-rotulo="Valor" class="direita numero">' + u.moeda(c.valor) + '</td><td data-rotulo="Extras" class="direita numero">' + u.moeda(App.precos.totalExtras(c)) +
        '</td><td data-rotulo="Total" class="direita numero"><strong>' + u.moeda(App.precos.totalCorrida(c)) + "</strong></td></tr>";
    }).join("") : '<tr><td colspan="6" class="tabela-vazia">Nenhuma corrida concluída ainda.</td></tr>';
  }

  /* ==========================================================================
     7. ATUALIZAÇÃO AUTOMÁTICA
     ========================================================================== */
  var disponiveisConhecidas = {};
  corridasDisponiveis().forEach(function (c) { disponiveisConhecidas[c.id] = true; });

  banco.aoMudar(function (chave) {
    if (chave !== "corridas" && chave !== "motoristas" && chave !== "tudo") return;
    /* Toca um aviso quando aparece corrida nova para este motorista. */
    if (eu().status === "disponivel") {
      corridasDisponiveis().forEach(function (c) {
        if (!disponiveisConhecidas[c.id]) ui.aviso("Nova corrida disponível: " + c.codigo + " (" + u.moeda(c.valor) + ")", "info");
        disponiveisConhecidas[c.id] = true;
      });
    }
    desenharDisponibilidade();
    desenharCorridaAtual();
    desenharDisponiveis();
    if (abaAtual === "ganhos") desenharGanhos();
  });

  /* A cada segundo: move o carro, atualiza previsão e distâncias. */
  var segundos = 0;
  setInterval(function () {
    atualizarTempoReal();
    if (++segundos % 5 === 0 && abaAtual === "corridas") desenharDisponiveis(); // distâncias mudam com o movimento
  }, 1000);

  /* Primeiro desenho */
  desenharDisponibilidade();
  desenharCorridaAtual();
  desenharDisponiveis();
  atualizarTempoReal();
  centralizarNoInicio();
})();
