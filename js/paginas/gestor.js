/* =============================================================================
   paginas/gestor.js — COMPORTAMENTO DO PAINEL DO GESTOR (paginas/gestor.html)
   -----------------------------------------------------------------------------
   Organização deste arquivo:
     1. Preparação (login, topo, mapa, simulação)
     2. Visão geral ......... indicadores, mapa ao vivo, corridas ativas
     3. Corridas ............ tabela com filtros
     4. Detalhe da corrida .. janela com designar motorista, valores, extras,
                              cancelar e chat
     5. Motoristas .......... cartões com situação e ganhos
     6. Financeiro .......... somas por período, motorista, serviço e tipo
     7. Tarifas ............. edição das regras de preço
     8. Chat ................ lista de conversas + conversa aberta
     9. Atualização ......... o que redesenhar quando os dados mudam
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var banco = App.banco;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  banco.iniciar();
  var usuario = App.sessao.exigir("gestor");
  if (!usuario) return;
  App.auth.exigirLogin().then(function () { App.notificacoes.iniciar(); }); // sem login válido, volta para o início
  ui.montarTopo();
  document.getElementById("usuario-avatar").textContent = u.iniciais(usuario.nome);

  /* Interruptor da simulação automática */
  var chkSim = document.getElementById("simulacao-automatica");
  chkSim.checked = App.simulacao.automaticoLigado();
  chkSim.addEventListener("change", function () {
    App.simulacao.definirAutomatico(chkSim.checked);
    ui.aviso(chkSim.checked ? "Motoristas de teste agindo sozinhos." : "Simulação automática pausada.", "info");
  });
  App.simulacao.iniciarMotor();

  var mapa = App.mapa.criar("mapa-gestor");
  var abaAtual = "visao";
  var corridaDestacada = null; // corrida em foco no mapa

  ui.ligarAbas(function (aba) {
    abaAtual = aba;
    if (aba === "visao") mapa.redimensionar();
    redesenharAba(aba);
  });

  /* Lista de motoristas com a posição de AGORA (usada no mapa e nas listas). */
  function motoristasComPosicao() {
    var agora = Date.now();
    var focoMotorista = corridaDestacada ? (banco.buscarCorrida(corridaDestacada) || {}).motoristaId : null;
    return banco.listarMotoristas().map(function (m) {
      return { motorista: m, posicao: App.simulacao.posicaoMotorista(m, agora), destaque: m.id === focoMotorista };
    });
  }

  function nomeCliente(id) { var c = banco.buscarCliente(id); return c ? c.nome : "—"; }
  function nomeMotorista(id) { var m = id && banco.buscarMotorista(id); return m ? m.nome : "—"; }
  function eHoje(ms) { return ms && new Date(ms).toDateString() === new Date().toDateString(); }
  function ativa(c) { return c.status === "aguardando" || c.status === "aceita" || c.status === "em_andamento"; }

  /* ==========================================================================
     2. VISÃO GERAL
     ========================================================================== */
  function desenharIndicadores() {
    var corridas = banco.listarCorridas();
    var concluidasHoje = corridas.filter(function (c) { return c.status === "concluida" && eHoje(c.concluidaEm); });
    var faturamento = concluidasHoje.reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0);
    var aguardando = corridas.filter(function (c) { return c.status === "aguardando"; }).length;
    var andamento = corridas.filter(function (c) { return c.status === "aceita" || c.status === "em_andamento"; }).length;
    var motoristas = banco.listarMotoristas();
    var disponiveis = motoristas.filter(function (m) { return m.status === "disponivel"; }).length;
    var online = motoristas.filter(function (m) { return m.status !== "offline"; }).length;

    document.getElementById("indicadores").innerHTML = [
      indicador("Faturamento de hoje", u.moeda(faturamento), u.plural(concluidasHoje.length, "corrida concluída", "corridas concluídas")),
      indicador("Ticket médio", u.moeda(concluidasHoje.length ? faturamento / concluidasHoje.length : 0), "por corrida concluída hoje"),
      indicador("Em andamento", andamento, "motorista a caminho ou em trajeto"),
      indicador("Aguardando motorista", aguardando, aguardando ? "precisam de atenção" : "nenhuma na fila"),
      indicador("Motoristas disponíveis", disponiveis + " / " + online, "livres / online")
    ].join("");
  }

  function indicador(rotulo, valor, detalhe) {
    return '<div class="cartao indicador"><div class="indicador-rotulo">' + rotulo + "</div>" +
           '<div class="indicador-valor">' + valor + "</div>" +
           '<div class="indicador-detalhe">' + (detalhe || "") + "</div></div>";
  }

  /* Card de corrida usado nas listas (ativas e conversas). */
  function cardCorrida(c, opcoes) {
    opcoes = opcoes || {};
    var progresso = "";
    if (c.status === "aceita" || c.status === "em_andamento") {
      progresso = '<div class="progresso"><div class="progresso-barra" data-progresso="' + c.id + '"></div></div>';
    }
    var naoLidas = opcoes.mostrarNaoLidas ? banco.naoLidas(c.id, App.sessao.chaveUsuario()) : 0;
    return '<div class="item-corrida' + (opcoes.selecionada === c.id ? " selecionado" : "") + '" data-corrida="' + c.id + '">' +
             '<div class="item-corrida-topo"><span class="item-corrida-codigo">' + c.codigo + " " +
               (App.SERVICOS[c.servico] || {}).icone + "</span>" +
               (naoLidas ? '<span class="contador-nao-lidas">' + naoLidas + "</span>" : ui.seloStatus(c.status)) + "</div>" +
             '<div class="item-corrida-rota"><span>De:</span> ' + u.escaparHtml(c.origem.nome) +
               "<br><span>Para:</span> " + u.escaparHtml(c.destino.nome) + "</div>" +
             progresso +
             '<div class="item-corrida-rodape"><span>' + u.escaparHtml(nomeCliente(c.clienteId)) +
               (c.motoristaId ? " • " + u.escaparHtml(nomeMotorista(c.motoristaId)) : "") + "</span>" +
               '<span class="item-corrida-valor">' + u.moeda(App.precos.totalCorrida(c)) + "</span></div>" +
           "</div>";
  }

  function desenharAtivas() {
    var lista = banco.listarCorridas().filter(ativa)
      .sort(function (a, b) { return b.criadaEm - a.criadaEm; });
    document.getElementById("total-ativas").textContent = lista.length + " no momento";
    document.getElementById("lista-ativas").innerHTML = lista.length
      ? lista.map(function (c) { return cardCorrida(c, { selecionada: corridaDestacada }); }).join("")
      : '<div class="lista-vazia">Nenhuma corrida ativa agora.<br>Peça uma pelo Portal do Cliente.</div>';
  }

  /* Clique numa corrida ativa: destaca no mapa e abre os detalhes. */
  document.getElementById("lista-ativas").addEventListener("click", function (ev) {
    var item = ev.target.closest("[data-corrida]");
    if (!item) return;
    corridaDestacada = item.getAttribute("data-corrida");
    var c = banco.buscarCorrida(corridaDestacada);
    mapa.mostrarCorrida(c);
    mapa.enquadrar([c.origem, c.destino].concat(c.motoristaId ? [App.simulacao.posicaoMotorista(banco.buscarMotorista(c.motoristaId))] : []));
    desenharAtivas();
    abrirDetalhe(corridaDestacada);
    atualizarBarras();
  });

  document.getElementById("enquadrar-todos").addEventListener("click", function () {
    corridaDestacada = null;
    mapa.limparCorrida();
    mapa.enquadrar(motoristasComPosicao().map(function (i) { return i.posicao; }));
    desenharAtivas();
  });

  /* ==========================================================================
     3. CORRIDAS (tabela com filtros)
     ========================================================================== */
  ui.preencherSelect(document.getElementById("filtro-status"),
    [{ valor: "", texto: "Todos os status" }].concat(Object.keys(App.STATUS_CORRIDA).map(function (k) {
      return { valor: k, texto: App.STATUS_CORRIDA[k].rotulo };
    })));
  ui.preencherSelect(document.getElementById("filtro-servico"),
    [{ valor: "", texto: "Todos os serviços" }].concat(Object.keys(App.SERVICOS).map(function (k) {
      return { valor: k, texto: App.SERVICOS[k].icone + " " + App.SERVICOS[k].rotulo };
    })));

  ["filtro-busca", "filtro-status", "filtro-servico"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", desenharTabela);
  });

  function desenharTabela() {
    var busca = document.getElementById("filtro-busca").value.trim().toLowerCase();
    var status = document.getElementById("filtro-status").value;
    var servico = document.getElementById("filtro-servico").value;

    var lista = banco.listarCorridas().filter(function (c) {
      if (status && c.status !== status) return false;
      if (servico && c.servico !== servico) return false;
      if (busca) {
        var texto = [c.codigo, nomeCliente(c.clienteId), nomeMotorista(c.motoristaId), c.origem.nome, c.destino.nome].join(" ").toLowerCase();
        if (texto.indexOf(busca) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return b.criadaEm - a.criadaEm; });

    document.getElementById("tabela-corridas").innerHTML = lista.length ? lista.map(function (c) {
      return '<tr class="clicavel" data-corrida="' + c.id + '">' +
        '<td data-rotulo="Corrida"><strong>' + c.codigo + "</strong></td>" +
        '<td data-rotulo="Cliente">' + u.escaparHtml(nomeCliente(c.clienteId)) + "</td>" +
        '<td data-rotulo="Trajeto" class="trajeto-celula"><span>De:</span> ' + u.escaparHtml(c.origem.nome) + "<br><span>Para:</span> " + u.escaparHtml(c.destino.nome) + "</td>" +
        '<td data-rotulo="Serviço">' + (App.SERVICOS[c.servico] || {}).icone + " " + (App.SERVICOS[c.servico] || {}).rotulo + "</td>" +
        '<td data-rotulo="Motorista">' + u.escaparHtml(nomeMotorista(c.motoristaId)) + "</td>" +
        '<td data-rotulo="Status">' + ui.seloStatus(c.status) + "</td>" +
        '<td data-rotulo="Total" class="direita numero">' + u.moeda(App.precos.totalCorrida(c)) + "</td>" +
        '<td data-rotulo="Pedida" class="texto-suave">' + u.dataHora(c.criadaEm) + "</td>" +
      "</tr>";
    }).join("") : '<tr><td colspan="8" class="tabela-vazia">Nenhuma corrida encontrada.</td></tr>';
  }

  document.getElementById("tabela-corridas").addEventListener("click", function (ev) {
    var linha = ev.target.closest("[data-corrida]");
    if (linha) abrirDetalhe(linha.getAttribute("data-corrida"));
  });

  /* ==========================================================================
     4. DETALHE DA CORRIDA (janela modal)
     ========================================================================== */
  var detalheAberto = null;   // id da corrida aberta na janela
  var extrasEditando = null;  // cópia dos extras enquanto o gestor edita

  function abrirDetalhe(id) {
    var c = banco.buscarCorrida(id);
    if (!c) return;
    detalheAberto = id;
    extrasEditando = JSON.parse(JSON.stringify(c.extras || []));
    var corpo = ui.abrirModal("Corrida " + c.codigo,
      '<div class="detalhe-corrida">' +
        '<div id="detalhe-info"></div>' +
        '<div class="chat-no-detalhe" id="detalhe-chat"></div>' +
      "</div>", { classe: "modal-grande" });
    App.chat.criar(corpo.querySelector("#detalhe-chat")).abrir(id);
    desenharDetalhe();
    atualizarBarras();
    corpo.addEventListener("click", cliqueNoDetalhe);
    corpo.addEventListener("input", digitacaoNoDetalhe);
  }

  function desenharDetalhe() {
    var area = document.getElementById("detalhe-info");
    var c = detalheAberto && banco.buscarCorrida(detalheAberto);
    if (!area || !c) { detalheAberto = null; return; }
    var cliente = banco.buscarCliente(c.clienteId) || {};
    var motorista = c.motoristaId ? banco.buscarMotorista(c.motoristaId) : null;
    var finalizada = c.status === "concluida" || c.status === "cancelada";

    /* --- Bloco: situação + motorista -------------------------------------- */
    var htmlMotorista;
    if (motorista) {
      htmlMotorista = '<dl class="lista-dados">' +
        "<dt>Motorista</dt><dd>" + u.escaparHtml(motorista.nome) + " • ⭐ " + motorista.avaliacao + "</dd>" +
        "<dt>Veículo</dt><dd>" + u.escaparHtml(motorista.veiculo.modelo + " • " + motorista.veiculo.placa + " • " + motorista.veiculo.cor) + "</dd>" +
        "<dt>Telefone</dt><dd>" + u.escaparHtml(motorista.telefone) + "</dd></dl>";
    } else if (c.status === "aguardando") {
      var agora = Date.now();
      var opcoes = banco.listarMotoristas().filter(function (m) {
        return m.status === "disponivel" && m.servicos.indexOf(c.servico) !== -1;
      }).map(function (m) {
        var km = u.distanciaKm(App.simulacao.posicaoMotorista(m, agora), c.origem);
        return { m: m, km: km };
      }).sort(function (a, b) { return a.km - b.km; });
      htmlMotorista = opcoes.length
        ? '<label class="rotulo" for="designar-motorista">Designar motorista (mais próximos primeiro)</label>' +
          '<div class="acoes-corrida"><select class="campo" id="designar-motorista">' +
            opcoes.map(function (o) {
              return '<option value="' + o.m.id + '">' + u.escaparHtml(o.m.nome) + " — " + o.km.toFixed(1) + " km da origem</option>";
            }).join("") +
          '</select><button class="botao botao-primario" data-acao="designar">Designar</button></div>'
        : '<p class="texto-suave">Nenhum motorista disponível para este serviço no momento.</p>';
    } else {
      htmlMotorista = '<p class="texto-suave">Sem motorista.</p>';
    }

    /* --- Progresso -------------------------------------------------------- */
    var htmlProgresso = "";
    if (c.status === "aceita" || c.status === "em_andamento") {
      var p = Math.round(App.simulacao.progressoCorrida(c) * 100);
      htmlProgresso = '<p class="texto-pequeno texto-suave">' +
        (c.status === "aceita" ? "Motorista indo até a origem" : "A caminho do destino") + " — " + p + "%</p>" +
        '<div class="progresso"><div class="progresso-barra" data-progresso="' + c.id + '"></div></div>';
    }

    /* --- Valores: composição + extras ------------------------------------ */
    var linhasPreco = (c.calculo && c.calculo.linhas || []).map(function (l) {
      return "<tr><td>" + u.escaparHtml(l.texto) + "</td><td>" + u.moeda(l.valor) + "</td></tr>";
    }).join("");
    var valorEditado = c.valorEditadoEm ? '<tr><td colspan="2" class="texto-suave texto-pequeno">Valor ajustado pelo gestor em ' + u.dataHora(c.valorEditadoEm) + "</td></tr>" : "";

    var htmlExtras = extrasEditando.map(function (e, i) {
      return '<div class="extras-linha">' +
        '<input class="campo" data-extra-desc="' + i + '" placeholder="Descrição (ex.: pedágio)" value="' + u.escaparHtml(e.descricao) + '"' + (finalizada && c.status === "cancelada" ? " disabled" : "") + " />" +
        '<input class="campo" type="number" step="0.01" min="0" data-extra-valor="' + i + '" value="' + e.valor + '" />' +
        '<button class="botao-icone" data-acao="remover-extra" data-indice="' + i + '" title="Remover">✕</button>' +
      "</div>";
    }).join("");

    var totalExtras = extrasEditando.reduce(function (s, e) { return s + (Number(e.valor) || 0); }, 0);

    area.innerHTML =
      '<div class="detalhe-bloco"><h3>Situação</h3>' + ui.seloStatus(c.status) +
        ' <span class="texto-suave texto-pequeno">pedida ' + u.tempoRelativo(c.criadaEm) + "</span>" + htmlProgresso + "</div>" +

      '<div class="detalhe-bloco"><h3>Cliente</h3><dl class="lista-dados">' +
        "<dt>Nome</dt><dd>" + u.escaparHtml(cliente.nome) + (cliente.empresa ? " (" + u.escaparHtml(cliente.empresa) + ")" : "") + "</dd>" +
        "<dt>Telefone</dt><dd>" + u.escaparHtml(cliente.telefone || "—") + "</dd></dl></div>" +

      '<div class="detalhe-bloco"><h3>Motorista</h3>' + htmlMotorista + "</div>" +

      '<div class="detalhe-bloco"><h3>Trajeto</h3><dl class="lista-dados">' +
        "<dt>Origem</dt><dd>" + u.escaparHtml(c.origem.nome) + "</dd>" +
        "<dt>Destino</dt><dd>" + u.escaparHtml(c.destino.nome) + "</dd>" +
        "<dt>Serviço</dt><dd>" + (App.SERVICOS[c.servico] || {}).icone + " " + (App.SERVICOS[c.servico] || {}).rotulo + "</dd>" +
        "<dt>Distância</dt><dd>" + (c.calculo ? c.calculo.distanciaKm.toFixed(1) + " km (≈ " + c.calculo.tempoMin + " min)" : "—") + "</dd>" +
        "<dt>Preço</dt><dd>" + (c.modoPreco === "fixo" ? "Valor fixo" : "Variável") + "</dd>" +
        (c.observacoes ? "<dt>Observações</dt><dd>" + u.escaparHtml(c.observacoes) + "</dd>" : "") +
      "</dl></div>" +

      '<div class="detalhe-bloco"><h3>Valores</h3>' +
        '<table class="composicao-preco">' + linhasPreco + valorEditado + "</table>" +
        '<div class="grupo-campo"><label class="rotulo" for="valor-corrida">Valor da corrida (pode ajustar)</label>' +
          '<input class="campo" type="number" step="0.01" min="0" id="valor-corrida" value="' + c.valor + '"' + (c.status === "cancelada" ? " disabled" : "") + " /></div>" +
        '<label class="rotulo">Extras (somados ao valor)</label>' + htmlExtras +
        (c.status !== "cancelada" ? '<button class="botao botao-secundario botao-pequeno" data-acao="adicionar-extra">+ Adicionar extra</button>' : "") +
        '<table class="composicao-preco"><tr><td>Extras</td><td>' + u.moeda(totalExtras) + '</td></tr>' +
          '<tr class="linha-total"><td>Total</td><td id="total-detalhe">' + u.moeda((Number(document.getElementById("valor-corrida") ? document.getElementById("valor-corrida").value : c.valor) || 0) + totalExtras) + "</td></tr></table>" +
        (c.status !== "cancelada" ? '<div class="acoes-corrida"><button class="botao botao-primario" data-acao="salvar-valores">Salvar valores</button></div>' : "") +
      "</div>" +

      '<div class="detalhe-bloco"><h3>Histórico</h3><ul class="linha-tempo">' +
        c.historico.map(function (h) {
          return "<li>" + (App.STATUS_CORRIDA[h.status] || {}).rotulo + ' <span class="texto-suave">— ' + u.dataHora(h.em) + "</span></li>";
        }).join("") + "</ul></div>" +

      '<div class="acoes-corrida">' +
        '<button class="botao botao-secundario" data-acao="ver-mapa">Ver no mapa</button>' +
        (!finalizada ? '<button class="botao botao-perigo" data-acao="cancelar">Cancelar corrida</button>' : "") +
      "</div>";
  }

  /* Recalcula o total enquanto o gestor digita valores. */
  function digitacaoNoDetalhe(ev) {
    var alvo = ev.target;
    if (alvo.hasAttribute("data-extra-desc")) extrasEditando[alvo.getAttribute("data-extra-desc")].descricao = alvo.value;
    if (alvo.hasAttribute("data-extra-valor")) extrasEditando[alvo.getAttribute("data-extra-valor")].valor = Number(alvo.value) || 0;
    var total = document.getElementById("total-detalhe");
    if (total) {
      var valor = Number(document.getElementById("valor-corrida").value) || 0;
      total.textContent = u.moeda(valor + extrasEditando.reduce(function (s, e) { return s + (Number(e.valor) || 0); }, 0));
    }
  }

  function cliqueNoDetalhe(ev) {
    var botao = ev.target.closest("[data-acao]");
    if (!botao || !detalheAberto) return;
    var acao = botao.getAttribute("data-acao");
    var id = detalheAberto;

    if (acao === "designar") {
      var motoristaId = document.getElementById("designar-motorista").value;
      if (banco.aceitarCorrida(id, motoristaId, "gestor")) ui.aviso("Motorista designado.", "sucesso");
      else ui.aviso("Não foi possível designar (a corrida pode já ter sido aceita).", "erro");
    }
    if (acao === "adicionar-extra") {
      extrasEditando.push({ descricao: "", valor: 0 });
      desenharDetalhe();
    }
    if (acao === "remover-extra") {
      extrasEditando.splice(Number(botao.getAttribute("data-indice")), 1);
      desenharDetalhe();
    }
    if (acao === "salvar-valores") {
      var valor = document.getElementById("valor-corrida").value;
      var extras = extrasEditando.filter(function (e) { return e.descricao.trim() || Number(e.valor); })
        .map(function (e) { return { descricao: e.descricao.trim() || "Extra", valor: u.arredondar(Number(e.valor) || 0) }; });
      banco.alterarValores(id, valor, extras);
      extrasEditando = JSON.parse(JSON.stringify(extras));
      ui.aviso("Valores salvos.", "sucesso");
    }
    if (acao === "cancelar") {
      ui.confirmar("Cancelar esta corrida? O cliente e o motorista serão avisados no chat.").then(function (sim) {
        if (!sim) return;
        banco.cancelarCorrida(id, "cancelada pelo gestor");
        ui.aviso("Corrida cancelada.", "info");
      });
    }
    if (acao === "ver-mapa") {
      ui.fecharModal();
      detalheAberto = null;
      corridaDestacada = id;
      document.querySelector('[data-aba="visao"]').click();
      var c = banco.buscarCorrida(id);
      mapa.mostrarCorrida(c);
      mapa.enquadrar([c.origem, c.destino]);
    }
  }

  /* ==========================================================================
     5. MOTORISTAS
     ========================================================================== */
  function desenharMotoristas() {
    var corridas = banco.listarCorridas();
    document.getElementById("lista-motoristas").innerHTML = banco.listarMotoristas().map(function (m) {
      var hoje = corridas.filter(function (c) { return c.motoristaId === m.id && c.status === "concluida" && eHoje(c.concluidaEm); });
      var ganhos = hoje.reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0);
      var atual = banco.corridaAtivaDoMotorista(m.id);
      var manual = banco.estaSobControleManual(m.id);
      return '<div class="cartao cartao-motorista">' +
        '<div class="cartao-motorista-topo">' + ui.avatar(m.nome, "avatar-grande") +
          "<div><h3>" + u.escaparHtml(m.nome) + "</h3>" +
          '<div class="texto-suave texto-pequeno">' + u.escaparHtml(m.veiculo.modelo + " • " + m.veiculo.placa) + "</div></div></div>" +
        "<div>" + ui.seloMotorista(m.status) +
          (manual ? ' <span class="texto-suave texto-pequeno">• controlado por uma pessoa</span>' : "") + "</div>" +
        '<div class="texto-pequeno texto-suave">Serviços: ' + m.servicos.map(function (s) { return App.SERVICOS[s].icone + " " + App.SERVICOS[s].rotulo; }).join(", ") + "</div>" +
        (atual ? '<div class="texto-pequeno">Na corrida <strong>' + atual.codigo + "</strong> — " + (App.STATUS_CORRIDA[atual.status] || {}).rotulo + "</div>" : "") +
        '<div class="cartao-motorista-numeros">' +
          '<div class="numero-bloco"><strong>' + hoje.length + "</strong><span>corridas hoje</span></div>" +
          '<div class="numero-bloco"><strong>' + u.moeda(ganhos) + "</strong><span>ganhos hoje</span></div>" +
          '<div class="numero-bloco"><strong>⭐ ' + m.avaliacao + "</strong><span>avaliação</span></div>" +
        "</div>" +
        '<div class="cartao-motorista-acoes">' +
          '<button class="botao botao-secundario botao-pequeno" data-localizar="' + m.id + '">Localizar no mapa</button>' +
          (m.status === "offline"
            ? '<button class="botao botao-secundario botao-pequeno" data-status-motorista="' + m.id + '" data-novo="disponivel">Colocar online</button>'
            : (m.status === "disponivel" ? '<button class="botao botao-secundario botao-pequeno" data-status-motorista="' + m.id + '" data-novo="offline">Colocar offline</button>' : "")) +
        "</div>" +
      "</div>";
    }).join("");
  }

  document.getElementById("lista-motoristas").addEventListener("click", function (ev) {
    var loc = ev.target.closest("[data-localizar]");
    if (loc) {
      var m = banco.buscarMotorista(loc.getAttribute("data-localizar"));
      document.querySelector('[data-aba="visao"]').click();
      mapa.focar(App.simulacao.posicaoMotorista(m), 15);
      return;
    }
    var st = ev.target.closest("[data-status-motorista]");
    if (st) banco.atualizarMotorista(st.getAttribute("data-status-motorista"), { status: st.getAttribute("data-novo") });
  });

  /* ==========================================================================
     6. FINANCEIRO (somas)
     ========================================================================== */
  document.getElementById("periodo-financeiro").addEventListener("change", desenharFinanceiro);

  function desenharFinanceiro() {
    var periodo = document.getElementById("periodo-financeiro").value;
    var limite = periodo === "hoje" ? new Date(new Date().toDateString()).getTime()
               : periodo === "tudo" ? 0
               : Date.now() - Number(periodo) * 86400000;
    var concluidas = banco.listarCorridas().filter(function (c) {
      return c.status === "concluida" && c.concluidaEm >= limite;
    });
    var bruto = 0, extras = 0;
    concluidas.forEach(function (c) { bruto += c.valor || 0; extras += App.precos.totalExtras(c); });
    var total = bruto + extras;
    var canceladas = banco.listarCorridas().filter(function (c) { return c.status === "cancelada" && (c.canceladaEm || 0) >= limite; }).length;

    document.getElementById("indicadores-financeiro").innerHTML = [
      indicador("Total faturado", u.moeda(total), "corridas + extras"),
      indicador("Valor das corridas", u.moeda(bruto), u.plural(concluidas.length, "corrida concluída", "corridas concluídas")),
      indicador("Extras", u.moeda(extras), "pedágios, esperas etc."),
      indicador("Ticket médio", u.moeda(concluidas.length ? total / concluidas.length : 0), "por corrida"),
      indicador("Canceladas", canceladas, "no período")
    ].join("");

    /* Agrupa e soma por uma chave (motorista, serviço ou tipo de preço). */
    function agrupar(chaveDe) {
      var grupos = {};
      concluidas.forEach(function (c) {
        var k = chaveDe(c);
        grupos[k] = grupos[k] || { qtd: 0, extras: 0, total: 0 };
        grupos[k].qtd++;
        grupos[k].extras += App.precos.totalExtras(c);
        grupos[k].total += App.precos.totalCorrida(c);
      });
      return Object.keys(grupos).map(function (k) { return { chave: k, d: grupos[k] }; })
        .sort(function (a, b) { return b.d.total - a.d.total; });
    }

    var vazio = function (cols) { return '<tr><td colspan="' + cols + '" class="tabela-vazia">Sem corridas concluídas no período.</td></tr>'; };

    var porMotorista = agrupar(function (c) { return c.motoristaId || "—"; });
    document.getElementById("financeiro-motoristas").innerHTML = porMotorista.length ? porMotorista.map(function (g) {
      return "<tr><td>" + u.escaparHtml(nomeMotorista(g.chave)) + '</td><td class="direita">' + g.d.qtd +
             '</td><td class="direita numero">' + u.moeda(g.d.extras) + '</td><td class="direita numero"><strong>' + u.moeda(g.d.total) + "</strong></td></tr>";
    }).join("") : vazio(4);

    var porServico = agrupar(function (c) { return c.servico; });
    document.getElementById("financeiro-servicos").innerHTML = porServico.length ? porServico.map(function (g) {
      var s = App.SERVICOS[g.chave] || {};
      return "<tr><td>" + s.icone + " " + s.rotulo + '</td><td class="direita">' + g.d.qtd + '</td><td class="direita numero"><strong>' + u.moeda(g.d.total) + "</strong></td></tr>";
    }).join("") : vazio(3);

    var porModo = agrupar(function (c) { return c.modoPreco; });
    document.getElementById("financeiro-modos").innerHTML = porModo.length ? porModo.map(function (g) {
      return "<tr><td>" + (g.chave === "fixo" ? "Valor fixo" : "Variável") + '</td><td class="direita">' + g.d.qtd + '</td><td class="direita numero"><strong>' + u.moeda(g.d.total) + "</strong></td></tr>";
    }).join("") : vazio(3);
  }

  /* ==========================================================================
     7. TARIFAS
     ========================================================================== */
  var tarifasEditando = null; // cópia que o gestor edita até clicar em "Salvar"

  function desenharTarifas() {
    tarifasEditando = JSON.parse(JSON.stringify(banco.obterTarifas()));
    var t = tarifasEditando;

    document.getElementById("tarifas-servicos").innerHTML = Object.keys(t.servicos).map(function (s) {
      var x = t.servicos[s];
      var campo = function (nome) {
        return '<td><input class="campo" type="number" step="0.01" min="0" data-servico="' + s + '" data-campo="' + nome + '" value="' + x[nome] + '" /></td>';
      };
      return "<tr><td>" + App.SERVICOS[s].icone + " " + App.SERVICOS[s].rotulo + "</td>" +
             campo("base") + campo("porKm") + campo("porMinuto") + campo("minimo") + "</tr>";
    }).join("");

    document.getElementById("tarifas-ocasioes").innerHTML = Object.keys(t.ocasioes).map(function (k) {
      return "<tr><td>" + u.escaparHtml(t.ocasioes[k].rotulo) + "</td>" +
             '<td><input class="campo" type="number" step="0.05" min="1" data-ocasiao="' + k + '" value="' + t.ocasioes[k].multiplicador + '" /></td></tr>';
    }).join("");

    desenharFixos();
  }

  function desenharFixos() {
    var locais = banco.listarLocais();
    var opLocais = function (sel) {
      return locais.map(function (l) {
        return '<option value="' + l.id + '"' + (l.id === sel ? " selected" : "") + ">" + u.escaparHtml(l.nome) + "</option>";
      }).join("");
    };
    var opServicos = function (sel) {
      return Object.keys(App.SERVICOS).map(function (s) {
        return '<option value="' + s + '"' + (s === sel ? " selected" : "") + ">" + App.SERVICOS[s].rotulo + "</option>";
      }).join("");
    };
    document.getElementById("tarifas-fixas").innerHTML = tarifasEditando.tabelaFixa.length ? tarifasEditando.tabelaFixa.map(function (f, i) {
      return "<tr>" +
        '<td><select class="campo" data-fixo="' + i + '" data-campo="origemId">' + opLocais(f.origemId) + "</select></td>" +
        '<td><select class="campo" data-fixo="' + i + '" data-campo="destinoId">' + opLocais(f.destinoId) + "</select></td>" +
        '<td><select class="campo" data-fixo="' + i + '" data-campo="servico">' + opServicos(f.servico) + "</select></td>" +
        '<td><input class="campo" type="number" step="0.01" min="0" data-fixo="' + i + '" data-campo="valor" value="' + f.valor + '" /></td>' +
        '<td><button class="botao-icone" data-remover-fixo="' + i + '" title="Remover">✕</button></td>' +
      "</tr>";
    }).join("") : '<tr><td colspan="5" class="tabela-vazia">Nenhum valor fixo cadastrado.</td></tr>';
  }

  /* Cada digitação atualiza a cópia em edição. */
  document.querySelector('[data-painel="tarifas"]').addEventListener("input", function (ev) {
    var a = ev.target;
    if (a.hasAttribute("data-servico")) tarifasEditando.servicos[a.getAttribute("data-servico")][a.getAttribute("data-campo")] = Number(a.value) || 0;
    if (a.hasAttribute("data-ocasiao")) tarifasEditando.ocasioes[a.getAttribute("data-ocasiao")].multiplicador = Math.max(1, Number(a.value) || 1);
    if (a.hasAttribute("data-fixo")) {
      var f = tarifasEditando.tabelaFixa[a.getAttribute("data-fixo")];
      var campo = a.getAttribute("data-campo");
      f[campo] = campo === "valor" ? Number(a.value) || 0 : a.value;
    }
  });

  document.getElementById("tarifas-fixas").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-remover-fixo]");
    if (!b) return;
    tarifasEditando.tabelaFixa.splice(Number(b.getAttribute("data-remover-fixo")), 1);
    desenharFixos();
  });

  document.getElementById("adicionar-fixo").addEventListener("click", function () {
    var locais = banco.listarLocais();
    tarifasEditando.tabelaFixa.push({ id: u.novoId("tf"), origemId: locais[0].id, destinoId: locais[1].id, servico: "carro", valor: 0 });
    desenharFixos();
  });

  document.getElementById("salvar-tarifas").addEventListener("click", function () {
    var invalido = tarifasEditando.tabelaFixa.some(function (f) { return f.origemId === f.destinoId || !(f.valor > 0); });
    if (invalido) { ui.aviso("Na tabela fixa, origem e destino devem ser diferentes e o valor maior que zero.", "erro"); return; }
    banco.salvarTarifas(tarifasEditando);
    ui.aviso("Tarifas salvas. Valem para as próximas corridas.", "sucesso");
  });

  /* ==========================================================================
     8. CHAT
     ========================================================================== */
  var chatGestor = App.chat.criar(document.getElementById("chat-gestor"));

  function conversasVisiveis() {
    return banco.listarCorridas().filter(function (c) {
      if (c.status === "aceita" || c.status === "em_andamento") return true;
      var fim = c.concluidaEm || c.canceladaEm;
      return c.motoristaId && fim && Date.now() - fim < 3600000;
    }).sort(function (a, b) { return b.criadaEm - a.criadaEm; });
  }

  function desenharConversas() {
    var lista = conversasVisiveis();
    document.getElementById("lista-conversas").innerHTML = lista.length
      ? lista.map(function (c) { return cardCorrida(c, { selecionada: chatGestor.corridaAtual(), mostrarNaoLidas: true }); }).join("")
      : '<div class="lista-vazia">Nenhuma conversa ativa.</div>';
  }

  document.getElementById("lista-conversas").addEventListener("click", function (ev) {
    var item = ev.target.closest("[data-corrida]");
    if (!item) return;
    chatGestor.abrir(item.getAttribute("data-corrida"));
    desenharConversas();
  });

  /* ==========================================================================
     9. ATUALIZAÇÃO (quando os dados mudam e a cada segundo)
     ========================================================================== */
  function desenharContadores() {
    var aguardando = banco.listarCorridas().filter(function (c) { return c.status === "aguardando"; }).length;
    var el = document.getElementById("contador-aguardando");
    el.hidden = !aguardando;
    el.textContent = aguardando;
    var chave = App.sessao.chaveUsuario();
    var naoLidas = conversasVisiveis().reduce(function (s, c) { return s + banco.naoLidas(c.id, chave); }, 0);
    var elChat = document.getElementById("contador-chat");
    elChat.hidden = !naoLidas;
    elChat.textContent = naoLidas;
  }

  function redesenharAba(aba) {
    if (aba === "visao") { desenharIndicadores(); desenharAtivas(); atualizarBarras(); }
    if (aba === "corridas") desenharTabela();
    if (aba === "motoristas") desenharMotoristas();
    if (aba === "financeiro") desenharFinanceiro();
    if (aba === "tarifas") desenharTarifas();
    if (aba === "chat") desenharConversas();
  }

  /* Avisa o gestor quando chega uma corrida nova. */
  var idsConhecidos = {};
  banco.listarCorridas().forEach(function (c) { idsConhecidos[c.id] = true; });

  banco.aoMudar(function (chave) {
    if (chave === "corridas" || chave === "tudo") {
      banco.listarCorridas().forEach(function (c) {
        if (!idsConhecidos[c.id]) {
          idsConhecidos[c.id] = true;
          if (c.status === "aguardando") ui.aviso("Nova corrida " + c.codigo + " de " + nomeCliente(c.clienteId) + "!", "info");
        }
      });
    }
    if (chave === "tarifas" && abaAtual === "tarifas") return; // não apaga o que está sendo editado
    if (chave === "tudo") { mapa.limparCorrida(); corridaDestacada = null; }
    redesenharAba(abaAtual);
    desenharContadores();
    /* Atualiza a janela de detalhe, a não ser que o gestor esteja digitando nela. */
    if (detalheAberto && (chave === "corridas" || chave === "motoristas")) {
      var foco = document.activeElement;
      if (!foco || !document.getElementById("detalhe-info") || !document.getElementById("detalhe-info").contains(foco)) desenharDetalhe();
    }
  });

  /* Ajusta a largura de todas as barras de progresso visíveis. */
  function atualizarBarras() {
    ui.$$("[data-progresso]").forEach(function (barra) {
      var c = banco.buscarCorrida(barra.getAttribute("data-progresso"));
      if (c) barra.style.width = Math.round(App.simulacao.progressoCorrida(c) * 100) + "%";
    });
  }

  /* A cada segundo: move os carros no mapa e as barras de progresso. */
  setInterval(function () {
    mapa.mostrarMotoristas(motoristasComPosicao());
    atualizarBarras();
    if (!document.getElementById("modal-aberto")) detalheAberto = null;
  }, 1000);

  /* Botão de resetar os dados de teste */
  document.getElementById("botao-resetar").addEventListener("click", function () {
    ui.confirmar("Apagar todas as corridas e mensagens e voltar aos dados de teste originais?").then(function (sim) {
      if (!sim) return;
      banco.resetar();
      idsConhecidos = {};
      banco.listarCorridas().forEach(function (c) { idsConhecidos[c.id] = true; });
      ui.aviso("Dados de teste restaurados.", "sucesso");
    });
  });

  /* Primeiro desenho da tela */
  mapa.mostrarMotoristas(motoristasComPosicao());
  mapa.enquadrar(motoristasComPosicao().map(function (i) { return i.posicao; }));
  redesenharAba("visao");
  desenharContadores();
})();
