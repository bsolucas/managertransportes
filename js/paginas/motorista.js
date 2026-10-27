/* =============================================================================
   paginas/motorista.js — COMPORTAMENTO DA TELA DO MOTORISTA (paginas/motorista.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação (login e carregamento dos dados do Supabase)
     2. Disponível / Offline (e GPS)
     3. Corrida atual (iniciar, concluir, cancelar)
     4. Corridas disponíveis (aceitar)
     5. Mapa (a posição vem do GPS do celular)
     6. Ganhos
     7. Atualização automática

   Os dados vêm do Supabase por js/nuvem.js, com atualização ao vivo: uma corrida
   nova aparece na hora, e quando outro motorista aceita primeiro ela some.
   As regras (ordem das situações, motorista "em corrida"...) ficam no banco.
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var nuvem = App.nuvem;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var usuario = App.sessao.exigir("motorista");
  if (!usuario) return;
  ui.montarTopo();
  document.getElementById("usuario-avatar").textContent = u.iniciais(usuario.nome);

  /* Só monta a tela depois de confirmar o login e carregar os dados. */
  App.auth.exigirLogin()
    .then(function () { return nuvem.iniciar(); })
    .then(function () {
      if (!nuvem.meuMotorista()) throw new Error("Cadastro de motorista não encontrado.");
      App.notificacoes.iniciar();   // aviso e bip quando chega corrida nova
      montar();
    })
    .catch(function (e) {
      document.getElementById("corrida-atual").innerHTML =
        '<h2>Não foi possível carregar</h2><p class="texto-suave">' + u.escaparHtml(e.message || "Verifique a internet e atualize a página.") + "</p>";
    });

  function montar() {
    function eu() { return nuvem.meuMotorista(); }

    var mapa = App.mapa.criar("mapa-motorista");
    var chat = App.chat.criar(document.getElementById("chat-motorista"), nuvem);
    var abaAtual = "corridas";

    ui.ligarAbas(function (aba) {
      abaAtual = aba;
      if (aba === "corridas") mapa.redimensionar();
      if (aba === "ganhos") desenharGanhos();
    });

    var m0 = eu();
    document.getElementById("veiculo-motorista").textContent = [m0.veiculo.modelo, m0.veiculo.placa].filter(Boolean).join(" • ");
    var elServicos = document.getElementById("servicos-motorista");
    elServicos.innerHTML = m0.servicos.map(function (s) { return App.SERVICOS[s].icone; }).join(" ");
    elServicos.title = "Seus serviços: " + m0.servicos.map(function (s) { return App.SERVICOS[s].rotulo; }).join(", ");

    /* ========================================================================
       2. DISPONÍVEL / OFFLINE
       ======================================================================== */
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

    function sincronizarGps() {
      var deveEnviar = eu().status !== "offline";
      if (deveEnviar && !pararGps) {
        elGps.innerHTML = App.icone("satellite-dish") + " Procurando GPS…";
        pararGps = App.rastreio.iniciarEnvio(usuario.id, usuario.empresa.id, null, {
          aoPosicao: function () { elGps.innerHTML = App.icone("satellite-dish") + " GPS ativo"; },
          aoErro: function (texto) { elGps.innerHTML = App.icone("triangle-alert") + " GPS sem sinal"; elGps.title = texto; ui.aviso(texto, "erro"); }
        });
      } else if (!deveEnviar && pararGps) {
        pararGps();
        pararGps = null;
        App.rastreio.removerPosicao(usuario.id);
        elGps.textContent = "";
      }
    }

    chkDisp.addEventListener("change", function () {
      var ficarOnline = chkDisp.checked;
      nuvem.definirStatusMotorista(usuario.id, ficarOnline ? "disponivel" : "offline");
      ui.aviso(ficarOnline ? "Você está disponível para receber corridas." : "Você está offline.", "info");
    });

    /* ========================================================================
       3. CORRIDA ATUAL
       ======================================================================== */
    function desenharCorridaAtual() {
      var area = document.getElementById("corrida-atual");
      var c = nuvem.corridaAtivaDoMotorista(usuario.id);
      area.classList.toggle("corrida-atual-ativa", !!c);

      if (!c) {
        area.innerHTML = "<h2>Corrida atual</h2>" +
          '<p class="texto-suave">Nenhuma corrida em andamento. ' +
          (eu().status === "offline" ? "Fique disponível para receber corridas." : "Aceite uma corrida disponível abaixo.") + "</p>";
        return;
      }

      var etapa = c.status === "aceita"
        ? "Vá até o embarque: " + (c.embarque || "endereço não informado")
        : "Leve o cliente: " + c.trajeto;

      area.innerHTML =
        '<div class="cartao-cabecalho"><h2>Corrida ' + c.codigo + "</h2>" + ui.seloStatus(c.status) + "</div>" +
        '<div class="corrida-atual-etapa">' + u.escaparHtml(etapa) + "</div>" +
        '<dl class="lista-dados detalhe-espacado">' +
          "<dt>Cliente</dt><dd>" + u.escaparHtml(c.clienteNome || "—") + (c.clienteTelefone ? " • " + u.escaparHtml(c.clienteTelefone) : "") + "</dd>" +
          "<dt>Trajeto</dt><dd>" + u.escaparHtml(c.trajeto) + "</dd>" +
          "<dt>Embarque</dt><dd>" + u.escaparHtml(c.embarque || "—") + "</dd>" +
          "<dt>Serviço</dt><dd>" + App.SERVICOS[c.servico].icone + " " + App.SERVICOS[c.servico].rotulo + "</dd>" +
          (c.observacoes ? "<dt>Observações</dt><dd>" + u.escaparHtml(c.observacoes) + "</dd>" : "") +
          "<dt>Valor</dt><dd><strong>" + u.moeda(App.precos.totalCorrida(c)) + "</strong></dd>" +
        "</dl>" +
        '<div class="acoes-corrida">' +
          (c.status === "aceita"
            ? '<button class="botao botao-primario" id="botao-iniciar">Cheguei — iniciar corrida</button>'
            : '<button class="botao botao-sucesso" id="botao-concluir">Concluir corrida</button>') +
          (c.status === "aceita" ? '<button class="botao botao-perigo" id="botao-cancelar">Cancelar</button>' : "") +
        "</div>";

      if (chat.corridaAtual() !== c.id) chat.abrir(c.id);

      function erro(e) { ui.aviso(e.message, "erro"); }
      var bIniciar = document.getElementById("botao-iniciar");
      if (bIniciar) bIniciar.addEventListener("click", function () {
        bIniciar.disabled = true;
        nuvem.iniciarCorrida(c.id).then(function () {
          ui.aviso("Corrida iniciada. Boa viagem!", "sucesso");
        }).catch(function (e) { bIniciar.disabled = false; erro(e); });
      });
      var bConcluir = document.getElementById("botao-concluir");
      if (bConcluir) bConcluir.addEventListener("click", function () {
        bConcluir.disabled = true;
        nuvem.concluirCorrida(c.id).then(function (feita) {
          ui.aviso("Corrida concluída! " + u.moeda(App.precos.totalCorrida(feita)) + " somados aos seus ganhos.", "sucesso");
        }).catch(function (e) { bConcluir.disabled = false; erro(e); });
      });
      var bCancelar = document.getElementById("botao-cancelar");
      if (bCancelar) bCancelar.addEventListener("click", function () {
        ui.confirmar("Cancelar esta corrida? O cliente será avisado.").then(function (sim) {
          if (sim) nuvem.cancelarCorrida(c.id, "cancelada pelo motorista").catch(erro);
        });
      });
    }

    /* ========================================================================
       4. CORRIDAS DISPONÍVEIS
       ======================================================================== */
    function corridasDisponiveis() {
      var m = eu();
      return nuvem.corridas().filter(function (c) {
        return c.status === "aguardando" && m.servicos.indexOf(c.servico) !== -1;
      }).sort(function (a, b) { return a.criadaEm - b.criadaEm; });   // a mais antiga primeiro
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

      area.innerHTML = lista.length ? lista.map(function (c) {
        return '<div class="item-corrida item-disponivel">' +
          '<div class="item-corrida-topo"><span class="item-corrida-codigo">' + c.codigo + " " + App.SERVICOS[c.servico].icone + "</span>" +
            '<span class="distancia-ate-cliente">' + u.tempoRelativo(c.criadaEm) + "</span></div>" +
          '<div class="item-corrida-rota"><strong>' + u.escaparHtml(c.trajeto) + "</strong>" +
            (c.embarque ? "<br><span>Embarque:</span> " + u.escaparHtml(c.embarque) : "") + "</div>" +
          '<div class="item-corrida-rodape"><span>' + u.escaparHtml(c.clienteNome || "") + "</span>" +
            '<span class="item-corrida-valor">' + u.moeda(App.precos.totalCorrida(c)) + "</span></div>" +
          '<div class="acoes-corrida"><button class="botao botao-primario botao-largo" data-aceitar="' + c.id + '">Aceitar corrida</button></div>' +
        "</div>";
      }).join("") : '<div class="lista-vazia">Nenhuma corrida disponível agora. Fique de olho!</div>';
    }

    document.getElementById("lista-disponiveis").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-aceitar]");
      if (!b) return;
      b.disabled = true;
      nuvem.aceitarCorrida(b.getAttribute("data-aceitar"), usuario.id).then(function () {
        ui.aviso("Corrida aceita! Vá até o embarque.", "sucesso");
      }).catch(function (e) {
        b.disabled = false;
        ui.aviso(e.message, "erro");
      });
    });

    /* ========================================================================
       5. MAPA (a posição é a do GPS do celular)
       ======================================================================== */
    var jaCentralizou = false;
    function atualizarMapa() {
      var pos = App.posicaoReal && App.posicaoReal[usuario.id];
      if (!pos) return;
      mapa.mostrarMotoristas([{ motorista: eu(), posicao: pos, destaque: true }]);
      if (!jaCentralizou) { jaCentralizou = true; mapa.focar(pos, 15); }
    }

    /* ========================================================================
       6. GANHOS
       ======================================================================== */
    var campoPeriodo = document.getElementById("ganhos-periodo");
    campoPeriodo.innerHTML = App.pagamentos.PERIODOS.map(function (p) { return '<option value="' + p.id + '">' + u.escaparHtml(p.rotulo()) + "</option>"; }).join("");
    campoPeriodo.value = "mes_atual";
    campoPeriodo.addEventListener("change", desenharGanhos);

    /* Motorista CLT não vê ganhos: a aba some. (O salário nem chega ao celular dele.) */
    var ganhosLiberados = true;
    App.pagamentos.meuTipo().then(function (tipo) {
      ganhosLiberados = tipo !== "clt";
      ui.$('[data-aba="ganhos"]').hidden = !ganhosLiberados;
      if (!ganhosLiberados && abaAtual === "ganhos") ui.$('[data-aba="corridas"]').click();
    });

    function desenharGanhos() {
      if (!ganhosLiberados) return;
      var per = App.pagamentos.PERIODOS.filter(function (p) { return p.id === campoPeriodo.value; })[0];
      var de = per.de(), ate = per.ate();
      var minhas = nuvem.corridas().filter(function (c) {
        return c.motoristaId === usuario.id && c.status === "concluida" && c.concluidaEm >= de && c.concluidaEm < ate;
      }).sort(function (a, b) { return b.concluidaEm - a.concluidaEm; });
      var comissao = function (c) { return c.comissaoValor || 0; };
      var total = minhas.reduce(function (s, c) { return s + comissao(c); }, 0);

      document.getElementById("indicadores-ganhos").innerHTML = [
        ["Comissão do período", u.moeda(total), per.rotulo()],
        ["Corridas concluídas", String(minhas.length), "no período"],
        ["Média por corrida", u.moeda(minhas.length ? total / minhas.length : 0), "comissão média"]
      ].map(function (i) {
        return '<div class="cartao indicador"><div class="indicador-rotulo">' + i[0] + '</div><div class="indicador-valor">' + i[1] +
               '</div><div class="indicador-detalhe">' + u.escaparHtml(i[2]) + "</div></div>";
      }).join("");

      document.getElementById("tabela-ganhos").innerHTML = minhas.length ? minhas.map(function (c) {
        var pct = c.comissaoPercentual === null ? "—" : String(c.comissaoPercentual).replace(".", ",") + "%";
        return '<tr><td data-rotulo="Corrida"><strong>' + c.codigo + "</strong></td><td data-rotulo=\"Concluída\">" + u.dataHora(c.concluidaEm) + "</td>" +
          '<td data-rotulo="Trajeto" class="trajeto-celula">' + u.escaparHtml(c.trajeto) + "</td>" +
          '<td data-rotulo="Valor da corrida" class="direita numero">' + u.moeda(App.precos.totalCorrida(c)) + "</td>" +
          '<td data-rotulo="Comissão" class="direita numero">' + pct + "</td>" +
          '<td data-rotulo="Você ganhou" class="direita numero"><strong>' + u.moeda(comissao(c)) + "</strong></td></tr>";
      }).join("") : '<tr><td colspan="6" class="tabela-vazia">Nenhuma corrida concluída neste período.</td></tr>';
    }

    /* ========================================================================
       7. ATUALIZAÇÃO AUTOMÁTICA
       ======================================================================== */
    nuvem.aoMudar(function (chave) {
      if (chave !== "corridas" && chave !== "motoristas") return;
      desenharDisponibilidade();
      desenharCorridaAtual();
      desenharDisponiveis();
      if (abaAtual === "ganhos") desenharGanhos();
    });

    setInterval(atualizarMapa, 1000);

    /* Primeiro desenho */
    desenharDisponibilidade();
    desenharCorridaAtual();
    desenharDisponiveis();
    atualizarMapa();
  }
})();
