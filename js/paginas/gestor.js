/* =============================================================================
   paginas/gestor.js — COMPORTAMENTO DO PAINEL DO GESTOR (paginas/gestor.html)
   -----------------------------------------------------------------------------
   Organização deste arquivo:
     1. Preparação (login, topo, mapa, motoristas no mapa)
     2. Visão geral ......... indicadores, mapa ao vivo, corridas ativas
     3. Corridas ............ tabela com filtros e "+ Nova corrida"
     4. Detalhe da corrida .. janela com designar motorista, valores, extras,
                              cancelar e chat
     5. Motoristas .......... cartões com situação e ganhos
     6. Financeiro .......... somas por período, motorista, serviço e trajeto
     7. Trajetos e valores .. lista livre de trajetos com o valor de cada um
     8. Chat ................ lista de conversas + conversa aberta
     9. Atualização ......... o que redesenhar quando os dados mudam

   Todos os dados vêm do Supabase por js/nuvem.js (corridas, chat, motoristas,
   clientes e valores), com atualização ao vivo entre aparelhos.
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var nuvem = App.nuvem;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var usuario = App.sessao.exigir("gestor");
  if (!usuario) return;
  App.auth.exigirLogin().then(function () { App.notificacoes.iniciar(); iniciarRastreioReal(); nuvem.iniciar(); }); // sem login válido, volta para o início
  ui.montarTopo();
  document.getElementById("usuario-avatar").textContent = u.iniciais(usuario.nome);

  var mapa = App.mapa.criar("mapa-gestor");
  var abaAtual = "visao";
  var corridaDestacada = null; // corrida em foco (o motorista dela é destacado no mapa)

  ui.ligarAbas(function (aba) {
    abaAtual = aba;
    if (aba === "visao") mapa.redimensionar();
    redesenharAba(aba);
  });

  /* GPS dos motoristas: posição que o celular de cada um enviou (tabela "posicoes"). */
  var posicoesReais = {};         // motorista_id -> { lat, lng, atualizada_em }
  var RECENTE_MS = 2 * 60 * 1000; // posição mais velha que isso é ignorada (celular sem sinal)

  function iniciarRastreioReal() {
    App.rastreio.carregarTodas().then(function (lista) {
      lista.forEach(function (p) { posicoesReais[p.motorista_id] = p; });
    });
    App.rastreio.assinar(function (p) {
      if (p.removida) { delete posicoesReais[p.motorista_id]; return; }
      posicoesReais[p.motorista_id] = p;
    });
  }

  function posicaoDoMotorista(id) {
    var p = posicoesReais[id];
    if (!p || Date.now() - new Date(p.atualizada_em).getTime() > RECENTE_MS) return null;
    return { lat: p.lat, lng: p.lng };
  }

  /* Motoristas com GPS ligado, para desenhar no mapa. */
  function motoristasComPosicao() {
    var foco = corridaDestacada ? (nuvem.buscarCorrida(corridaDestacada) || {}).motoristaId : null;
    return nuvem.motoristas().map(function (m) {
      var pos = posicaoDoMotorista(m.id);
      return pos ? { motorista: m, posicao: pos, destaque: m.id === foco } : null;
    }).filter(Boolean);
  }

  function nomeCliente(c) { return c.clienteNome || (nuvem.buscarCliente(c.clienteId) || {}).nome || "—"; }
  function nomeMotorista(id) { var m = id && nuvem.buscarMotorista(id); return m ? m.nome : "—"; }
  function eHoje(ms) { return ms && new Date(ms).toDateString() === new Date().toDateString(); }
  function ativa(c) { return c.status === "aguardando" || c.status === "aceita" || c.status === "em_andamento"; }

  /* ==========================================================================
     2. VISÃO GERAL
     ========================================================================== */
  function desenharIndicadores() {
    var corridas = nuvem.corridas();
    var concluidasHoje = corridas.filter(function (c) { return c.status === "concluida" && eHoje(c.concluidaEm); });
    var faturamento = concluidasHoje.reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0);
    var aguardando = corridas.filter(function (c) { return c.status === "aguardando"; }).length;
    var andamento = corridas.filter(function (c) { return c.status === "aceita" || c.status === "em_andamento"; }).length;
    var motoristas = nuvem.motoristas();
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
    var naoLidas = opcoes.mostrarNaoLidas ? nuvem.naoLidas(c.id, App.sessao.chaveUsuario()) : 0;
    return '<div class="item-corrida' + (opcoes.selecionada === c.id ? " selecionado" : "") + '" data-corrida="' + c.id + '">' +
             '<div class="item-corrida-topo"><span class="item-corrida-codigo">' + c.codigo + " " +
               (App.SERVICOS[c.servico] || {}).icone + "</span>" +
               (naoLidas ? '<span class="contador-nao-lidas">' + naoLidas + "</span>" : ui.seloStatus(c.status)) + "</div>" +
             '<div class="item-corrida-rota"><strong>' + u.escaparHtml(c.trajeto) + "</strong>" +
               (c.embarque ? "<br><span>Embarque:</span> " + u.escaparHtml(c.embarque) : "") + "</div>" +
             '<div class="item-corrida-rodape"><span>' + u.escaparHtml(nomeCliente(c)) +
               (c.motoristaId ? " • " + u.escaparHtml(nomeMotorista(c.motoristaId)) : "") + "</span>" +
               '<span class="item-corrida-valor">' + u.moeda(App.precos.totalCorrida(c)) + "</span></div>" +
           "</div>";
  }

  function desenharAtivas() {
    var lista = nuvem.corridas().filter(ativa)
      .sort(function (a, b) { return b.criadaEm - a.criadaEm; });
    document.getElementById("total-ativas").textContent = lista.length + " no momento";
    document.getElementById("lista-ativas").innerHTML = lista.length
      ? lista.map(function (c) { return cardCorrida(c, { selecionada: corridaDestacada }); }).join("")
      : '<div class="lista-vazia">Nenhuma corrida ativa agora.<br>Toque em <strong>+ Nova corrida</strong> para lançar uma.</div>';
  }

  /* Leva o mapa até o motorista da corrida (se ele estiver com o GPS ligado). */
  function focarMotoristaDaCorrida(c) {
    var pos = c && c.motoristaId ? posicaoDoMotorista(c.motoristaId) : null;
    if (pos) mapa.focar(pos, 15);
    return !!pos;
  }

  /* Clique numa corrida ativa: destaca o motorista no mapa e abre os detalhes. */
  document.getElementById("lista-ativas").addEventListener("click", function (ev) {
    var item = ev.target.closest("[data-corrida]");
    if (!item) return;
    corridaDestacada = item.getAttribute("data-corrida");
    focarMotoristaDaCorrida(nuvem.buscarCorrida(corridaDestacada));
    desenharAtivas();
    abrirDetalhe(corridaDestacada);
  });

  document.getElementById("enquadrar-todos").addEventListener("click", function () {
    corridaDestacada = null;
    mapa.enquadrar(motoristasComPosicao().map(function (i) { return i.posicao; }));
    desenharAtivas();
  });

  /* ==========================================================================
     3. CORRIDAS (tabela com filtros e nova corrida)
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

    var lista = nuvem.corridas().filter(function (c) {
      if (status && c.status !== status) return false;
      if (servico && c.servico !== servico) return false;
      if (busca) {
        var texto = [c.codigo, nomeCliente(c), nomeMotorista(c.motoristaId), c.trajeto, c.embarque].join(" ").toLowerCase();
        if (texto.indexOf(busca) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return b.criadaEm - a.criadaEm; });

    document.getElementById("tabela-corridas").innerHTML = lista.length ? lista.map(function (c) {
      return '<tr class="clicavel" data-corrida="' + c.id + '">' +
        '<td data-rotulo="Corrida"><strong>' + c.codigo + "</strong></td>" +
        '<td data-rotulo="Cliente">' + u.escaparHtml(nomeCliente(c)) + "</td>" +
        '<td data-rotulo="Trajeto" class="trajeto-celula"><strong>' + u.escaparHtml(c.trajeto) + "</strong>" +
          (c.embarque ? "<br><span>Embarque:</span> " + u.escaparHtml(c.embarque) : "") + "</td>" +
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

  /* --- Nova corrida (o gestor lança em nome do cliente) ------------------- */
  function abrirNovaCorrida() {
    var clientes = nuvem.clientes().filter(function (c) { return c.ativo; })
      .sort(function (a, b) { return (a.empresa || a.nome).localeCompare(b.empresa || b.nome, "pt-BR"); });
    var trajetos = nuvem.tarifas().trajetos || [];
    if (!clientes.length) { ui.aviso("Cadastre um cliente antes (aba Clientes).", "erro"); return; }
    if (!trajetos.length) { ui.aviso("Cadastre ao menos um trajeto com valor (aba Valores).", "erro"); return; }

    var corpo = ui.abrirModal("Nova corrida",
      '<form class="formulario-cliente" id="form-nova-corrida" novalidate>' +
        '<div class="grupo-campo"><label class="rotulo" for="nc-cliente">Cliente *</label>' +
          '<select class="campo" id="nc-cliente">' + clientes.map(function (c) {
            return '<option value="' + c.id + '">' + u.escaparHtml(c.empresa ? c.empresa + " — " + c.nome : c.nome) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="grupo-campo"><label class="rotulo" for="nc-trajeto">Trajeto *</label>' +
          '<select class="campo" id="nc-trajeto">' + trajetos.map(function (t, i) {
            return '<option value="' + i + '">' + u.escaparHtml(t.nome) + " — " + u.moeda(t.valor) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="nc-servico">Serviço *</label>' +
            '<select class="campo" id="nc-servico">' + Object.keys(App.SERVICOS).map(function (k) {
              return '<option value="' + k + '">' + App.SERVICOS[k].icone + " " + App.SERVICOS[k].rotulo + "</option>";
            }).join("") + "</select></div>" +
          '<div class="grupo-campo"><label class="rotulo" for="nc-valor">Valor (R$) *</label>' +
            '<input class="campo" id="nc-valor" type="number" step="0.01" min="0" inputmode="decimal" /></div>' +
        "</div>" +
        '<div class="grupo-campo"><label class="rotulo" for="nc-embarque">Endereço de embarque</label>' +
          '<input class="campo" id="nc-embarque" placeholder="Rua, número, ponto de referência" autocomplete="off" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="nc-obs">Observações</label>' +
          '<textarea class="campo" id="nc-obs" placeholder="Ex.: 2 passageiros, levar placa de identificação"></textarea></div>' +
        '<div class="erro-login" id="nc-erro" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">Lançar corrida</button>' +
        "</div>" +
      "</form>");

    var seletorTrajeto = corpo.querySelector("#nc-trajeto");
    var campoValor = corpo.querySelector("#nc-valor");
    function usarValorDoTrajeto() { campoValor.value = trajetos[Number(seletorTrajeto.value)].valor; }
    seletorTrajeto.addEventListener("change", usarValorDoTrajeto);
    usarValorDoTrajeto();

    corpo.querySelector("#form-nova-corrida").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var erro = corpo.querySelector("#nc-erro");
      var botao = corpo.querySelector('button[type="submit"]');
      var valor = Number(campoValor.value);
      if (!(valor > 0)) { erro.textContent = "Informe o valor da corrida."; return; }
      erro.textContent = "";
      botao.disabled = true;
      nuvem.criarCorrida({
        clienteId: corpo.querySelector("#nc-cliente").value,
        trajeto: trajetos[Number(seletorTrajeto.value)].nome,
        embarque: corpo.querySelector("#nc-embarque").value.trim(),
        servico: corpo.querySelector("#nc-servico").value,
        valor: u.arredondar(valor),
        observacoes: corpo.querySelector("#nc-obs").value.trim()
      }).then(function (c) {
        ui.fecharModal();
        ui.aviso("Corrida " + c.codigo + " lançada. Os motoristas disponíveis foram avisados.", "sucesso");
      }).catch(function (e) {
        erro.textContent = e.message;
        botao.disabled = false;
      });
    });
  }

  document.getElementById("nova-corrida").addEventListener("click", abrirNovaCorrida);
  document.getElementById("nova-corrida-visao").addEventListener("click", abrirNovaCorrida);

  /* ==========================================================================
     4. DETALHE DA CORRIDA (janela modal)
     ========================================================================== */
  var detalheAberto = null;   // id da corrida aberta na janela
  var extrasEditando = null;  // cópia dos extras enquanto o gestor edita
  var valorEditando = 0;      // valor da corrida enquanto o gestor edita (não se perde ao redesenhar)

  function abrirDetalhe(id) {
    var c = nuvem.buscarCorrida(id);
    if (!c) return;
    detalheAberto = id;
    extrasEditando = JSON.parse(JSON.stringify(c.extras || []));
    valorEditando = c.valor;
    var corpo = ui.abrirModal("Corrida " + c.codigo,
      '<div class="detalhe-corrida">' +
        '<div id="detalhe-info"></div>' +
        '<div class="chat-no-detalhe" id="detalhe-chat"></div>' +
      "</div>", { classe: "modal-grande" });
    App.chat.criar(corpo.querySelector("#detalhe-chat"), nuvem).abrir(id);
    desenharDetalhe();
    corpo.addEventListener("click", cliqueNoDetalhe);
    corpo.addEventListener("input", digitacaoNoDetalhe);
  }

  function desenharDetalhe() {
    var area = document.getElementById("detalhe-info");
    var c = detalheAberto && nuvem.buscarCorrida(detalheAberto);
    if (!area || !c) { detalheAberto = null; return; }
    var cliente = nuvem.buscarCliente(c.clienteId) || {};
    var motorista = c.motoristaId ? nuvem.buscarMotorista(c.motoristaId) : null;
    var finalizada = c.status === "concluida" || c.status === "cancelada";

    /* --- Bloco: motorista (ou escolher um) -------------------------------- */
    var htmlMotorista;
    if (motorista) {
      htmlMotorista = '<dl class="lista-dados">' +
        "<dt>Motorista</dt><dd>" + u.escaparHtml(motorista.nome) + "</dd>" +
        "<dt>Veículo</dt><dd>" + u.escaparHtml([motorista.veiculo.modelo, motorista.veiculo.placa, motorista.veiculo.cor].filter(Boolean).join(" • ") || "—") + "</dd>" +
        "<dt>Telefone</dt><dd>" + u.escaparHtml(motorista.telefone || "—") + "</dd></dl>";
    } else if (c.status === "aguardando") {
      var opcoes = nuvem.motoristas().filter(function (m) {
        return m.status === "disponivel" && m.servicos.indexOf(c.servico) !== -1;
      });
      htmlMotorista = opcoes.length
        ? '<label class="rotulo" for="designar-motorista">Designar motorista disponível</label>' +
          '<div class="acoes-corrida"><select class="campo" id="designar-motorista">' +
            opcoes.map(function (m) { return '<option value="' + m.id + '">' + u.escaparHtml(m.nome) + "</option>"; }).join("") +
          '</select><button class="botao botao-primario" data-acao="designar">Designar</button></div>'
        : '<p class="texto-suave">Nenhum motorista disponível para este serviço no momento.</p>';
    } else {
      htmlMotorista = '<p class="texto-suave">Sem motorista.</p>';
    }

    /* --- Valores: valor + extras ----------------------------------------- */
    var valorEditado = c.valorEditadoEm ? '<p class="texto-suave texto-pequeno">Valor ajustado pelo gestor em ' + u.dataHora(c.valorEditadoEm) + "</p>" : "";
    var htmlExtras = extrasEditando.map(function (e, i) {
      return '<div class="extras-linha">' +
        '<input class="campo" data-extra-desc="' + i + '" placeholder="Descrição (ex.: pedágio)" value="' + u.escaparHtml(e.descricao) + '"' + (c.status === "cancelada" ? " disabled" : "") + " />" +
        '<input class="campo" type="number" step="0.01" min="0" data-extra-valor="' + i + '" value="' + e.valor + '" />' +
        '<button class="botao-icone" data-acao="remover-extra" data-indice="' + i + '" title="Remover">' + App.icone("x") + '</button>' +
      "</div>";
    }).join("");
    var totalExtras = extrasEditando.reduce(function (s, e) { return s + (Number(e.valor) || 0); }, 0);

    area.innerHTML =
      '<div class="detalhe-bloco"><h3>Situação</h3>' + ui.seloStatus(c.status) +
        ' <span class="texto-suave texto-pequeno">pedida ' + u.tempoRelativo(c.criadaEm) + "</span>" +
        (c.status === "cancelada" && c.motivoCancelamento ? '<p class="texto-suave texto-pequeno">Motivo: ' + u.escaparHtml(c.motivoCancelamento) + "</p>" : "") + "</div>" +

      '<div class="detalhe-bloco"><h3>Cliente</h3><dl class="lista-dados">' +
        "<dt>Nome</dt><dd>" + u.escaparHtml(nomeCliente(c)) + (cliente.empresa ? " (" + u.escaparHtml(cliente.empresa) + ")" : "") + "</dd>" +
        "<dt>Telefone</dt><dd>" + u.escaparHtml(c.clienteTelefone || cliente.telefone || "—") + "</dd></dl></div>" +

      '<div class="detalhe-bloco"><h3>Motorista</h3>' + htmlMotorista + "</div>" +

      '<div class="detalhe-bloco"><h3>Trajeto</h3><dl class="lista-dados">' +
        "<dt>Trajeto</dt><dd>" + u.escaparHtml(c.trajeto) + "</dd>" +
        "<dt>Embarque</dt><dd>" + u.escaparHtml(c.embarque || "—") + "</dd>" +
        "<dt>Serviço</dt><dd>" + (App.SERVICOS[c.servico] || {}).icone + " " + (App.SERVICOS[c.servico] || {}).rotulo + "</dd>" +
        (c.observacoes ? "<dt>Observações</dt><dd>" + u.escaparHtml(c.observacoes) + "</dd>" : "") +
      "</dl></div>" +

      '<div class="detalhe-bloco"><h3>Valores</h3>' + valorEditado +
        '<div class="grupo-campo"><label class="rotulo" for="valor-corrida">Valor da corrida (pode ajustar)</label>' +
          '<input class="campo" type="number" step="0.01" min="0" id="valor-corrida" value="' + valorEditando + '"' + (c.status === "cancelada" ? " disabled" : "") + " /></div>" +
        '<label class="rotulo">Extras (somados ao valor)</label>' + htmlExtras +
        (c.status !== "cancelada" ? '<button class="botao botao-secundario botao-pequeno" data-acao="adicionar-extra">+ Adicionar extra</button>' : "") +
        '<table class="composicao-preco"><tr><td>Extras</td><td>' + u.moeda(totalExtras) + '</td></tr>' +
          '<tr class="linha-total"><td>Total</td><td id="total-detalhe">' + u.moeda((Number(valorEditando) || 0) + totalExtras) + "</td></tr></table>" +
        (c.status !== "cancelada" ? '<div class="acoes-corrida"><button class="botao botao-primario" data-acao="salvar-valores">Salvar valores</button></div>' : "") +
      "</div>" +

      '<div class="detalhe-bloco"><h3>Histórico</h3><ul class="linha-tempo">' +
        c.historico.map(function (h) {
          return "<li>" + (App.STATUS_CORRIDA[h.status] || {}).rotulo + ' <span class="texto-suave">— ' + u.dataHora(h.em) + "</span></li>";
        }).join("") + "</ul></div>" +

      '<div class="acoes-corrida">' +
        (c.motoristaId && !finalizada ? '<button class="botao botao-secundario" data-acao="ver-mapa">Ver motorista no mapa</button>' : "") +
        (!finalizada ? '<button class="botao botao-perigo" data-acao="cancelar">Cancelar corrida</button>' : "") +
      "</div>";
  }

  /* Recalcula o total enquanto o gestor digita valores. */
  function digitacaoNoDetalhe(ev) {
    var alvo = ev.target;
    if (alvo.hasAttribute("data-extra-desc")) extrasEditando[alvo.getAttribute("data-extra-desc")].descricao = alvo.value;
    if (alvo.hasAttribute("data-extra-valor")) extrasEditando[alvo.getAttribute("data-extra-valor")].valor = Number(alvo.value) || 0;
    if (alvo.id === "valor-corrida") valorEditando = Number(alvo.value) || 0;
    var total = document.getElementById("total-detalhe");
    if (total) total.textContent = u.moeda(valorEditando + extrasEditando.reduce(function (s, e) { return s + (Number(e.valor) || 0); }, 0));
  }

  function cliqueNoDetalhe(ev) {
    var botao = ev.target.closest("[data-acao]");
    if (!botao || !detalheAberto) return;
    var acao = botao.getAttribute("data-acao");
    var id = detalheAberto;
    function erro(e) { ui.aviso(e.message, "erro"); }

    if (acao === "designar") {
      nuvem.aceitarCorrida(id, document.getElementById("designar-motorista").value).then(function () {
        ui.aviso("Motorista designado.", "sucesso");
      }).catch(function () { ui.aviso("Não foi possível designar (a corrida pode já ter sido aceita).", "erro"); });
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
      var valor = valorEditando;
      var extras = extrasEditando.filter(function (e) { return e.descricao.trim() || Number(e.valor); })
        .map(function (e) { return { descricao: e.descricao.trim() || "Extra", valor: u.arredondar(Number(e.valor) || 0) }; });
      nuvem.alterarValores(id, valor, extras).then(function () {
        extrasEditando = JSON.parse(JSON.stringify(extras));
        ui.aviso("Valores salvos.", "sucesso");
      }).catch(erro);
    }
    if (acao === "cancelar") {
      ui.confirmar("Cancelar esta corrida? O cliente e o motorista serão avisados no chat.").then(function (sim) {
        if (!sim) return;
        nuvem.cancelarCorrida(id, "cancelada pelo gestor").then(function () {
          ui.aviso("Corrida cancelada.", "info");
        }).catch(erro);
      });
    }
    if (acao === "ver-mapa") {
      var c = nuvem.buscarCorrida(id);
      ui.fecharModal();
      detalheAberto = null;
      corridaDestacada = id;
      document.querySelector('[data-aba="visao"]').click();
      if (!focarMotoristaDaCorrida(c)) ui.aviso("O motorista está sem GPS no momento (celular sem sinal ou fora do app).", "info");
    }
  }

  /* ==========================================================================
     5. MOTORISTAS
     ========================================================================== */
  /* Os motoristas vêm do Supabase, cadastrados pelo gestor. */
  function desenharMotoristas() {
    var corridas = nuvem.corridas();
    var lista = nuvem.motoristas();
    var el = document.getElementById("lista-motoristas");
    if (!lista.length) {
      el.innerHTML = '<p class="texto-suave">Nenhum motorista cadastrado. Toque em <strong>+ Novo motorista</strong> para cadastrar o primeiro.</p>';
      return;
    }
    el.innerHTML = lista.map(function (m) {
      var hoje = corridas.filter(function (c) { return c.motoristaId === m.id && c.status === "concluida" && eHoje(c.concluidaEm); });
      var ganhos = hoje.reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0);
      var atual = nuvem.corridaAtivaDoMotorista(m.id);
      var veiculo = [m.veiculo.modelo, m.veiculo.placa].filter(Boolean).join(" • ");
      return '<div class="cartao cartao-motorista">' +
        '<div class="cartao-motorista-topo">' + ui.avatar(m.nome, "avatar-grande") +
          "<div><h3>" + u.escaparHtml(m.nome) + "</h3>" +
          '<div class="texto-suave texto-pequeno">' + (veiculo ? u.escaparHtml(veiculo) : "Veículo não informado") + "</div></div></div>" +
        "<div>" + ui.seloMotorista(m.status) +
          (m.telefone ? ' <span class="texto-suave texto-pequeno">• ' + u.escaparHtml(m.telefone) + "</span>" : "") + "</div>" +
        '<div class="texto-pequeno texto-suave">Serviços: ' + m.servicos.map(function (s) { return App.SERVICOS[s].icone + " " + App.SERVICOS[s].rotulo; }).join(", ") + "</div>" +
        (atual ? '<div class="texto-pequeno">Na corrida <strong>' + atual.codigo + "</strong> — " + (App.STATUS_CORRIDA[atual.status] || {}).rotulo + "</div>" : "") +
        '<div class="cartao-motorista-numeros">' +
          '<div class="numero-bloco"><strong>' + hoje.length + "</strong><span>corridas hoje</span></div>" +
          '<div class="numero-bloco"><strong>' + u.moeda(ganhos) + "</strong><span>ganhos hoje</span></div>" +
        "</div>" +
        '<div class="cartao-motorista-acoes">' +
          '<button class="botao botao-secundario botao-pequeno" data-localizar="' + m.id + '">Localizar no mapa</button>' +
          '<button class="botao botao-perigo botao-pequeno" data-remover-motorista="' + m.id + '">Remover</button>' +
        "</div>" +
      "</div>";
    }).join("");
  }

  document.getElementById("novo-motorista").addEventListener("click", function () {
    App.gestorMotoristas.abrirCadastro(nuvem.recarregarMotoristas);
  });

  document.getElementById("lista-motoristas").addEventListener("click", function (ev) {
    var loc = ev.target.closest("[data-localizar]");
    if (loc) {
      var pos = posicaoDoMotorista(loc.getAttribute("data-localizar"));
      if (!pos) { ui.aviso("Este motorista está sem GPS no momento (offline ou sem sinal).", "info"); return; }
      document.querySelector('[data-aba="visao"]').click();
      mapa.focar(pos, 15);
      return;
    }
    var rem = ev.target.closest("[data-remover-motorista]");
    if (rem) {
      var m = nuvem.buscarMotorista(rem.getAttribute("data-remover-motorista"));
      if (!m) return;
      ui.confirmar("Remover o motorista " + m.nome + "? O login dele será apagado e ele não conseguirá mais entrar no app.").then(function (sim) {
        if (!sim) return;
        App.motoristasDb.remover(m.id).then(function () {
          ui.aviso("Motorista removido.", "sucesso");
          delete posicoesReais[m.id];
          nuvem.recarregarMotoristas();
        }).catch(function (e) { ui.aviso(e.message || "Não foi possível remover.", "erro"); });
      });
    }
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
    var concluidas = nuvem.corridas().filter(function (c) {
      return c.status === "concluida" && c.concluidaEm >= limite;
    });
    var bruto = 0, extras = 0;
    concluidas.forEach(function (c) { bruto += c.valor || 0; extras += App.precos.totalExtras(c); });
    var total = bruto + extras;
    var canceladas = nuvem.corridas().filter(function (c) { return c.status === "cancelada" && (c.canceladaEm || 0) >= limite; }).length;

    document.getElementById("indicadores-financeiro").innerHTML = [
      indicador("Total faturado", u.moeda(total), "corridas + extras"),
      indicador("Valor das corridas", u.moeda(bruto), u.plural(concluidas.length, "corrida concluída", "corridas concluídas")),
      indicador("Extras", u.moeda(extras), "pedágios, esperas etc."),
      indicador("Ticket médio", u.moeda(concluidas.length ? total / concluidas.length : 0), "por corrida"),
      indicador("Canceladas", canceladas, "no período")
    ].join("");

    /* Agrupa e soma por uma chave (motorista, serviço ou trajeto). */
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

    var porTrajeto = agrupar(function (c) { return c.trajeto || "—"; });
    document.getElementById("financeiro-modos").innerHTML = porTrajeto.length ? porTrajeto.map(function (g) {
      return "<tr><td>" + u.escaparHtml(g.chave) + '</td><td class="direita">' + g.d.qtd + '</td><td class="direita numero"><strong>' + u.moeda(g.d.total) + "</strong></td></tr>";
    }).join("") : vazio(3);
  }

  /* ==========================================================================
     7. TRAJETOS E VALORES
     --------------------------------------------------------------------------
     Lista livre: o gestor escreve o nome do trajeto (ex.: "Guaíba x POA Zona Sul")
     e o valor. Fica em tarifas.dados.trajetos, no Supabase (js/nuvem.js).
     ========================================================================== */
  var trajetosEditando = [];  // cópia que o gestor edita até clicar em "Salvar valores"

  function desenharTarifas() {
    var salvos = nuvem.tarifas().trajetos || [];
    trajetosEditando = JSON.parse(JSON.stringify(salvos));
    desenharTrajetos();
  }

  function desenharTrajetos() {
    document.getElementById("tarifas-fixas").innerHTML = trajetosEditando.length ? trajetosEditando.map(function (t, i) {
      return "<tr>" +
        '<td><input class="campo" data-trajeto="' + i + '" data-campo="nome" value="' + u.escaparHtml(t.nome) + '" placeholder="Ex.: Guaíba x POA Zona Sul" autocomplete="off" /></td>' +
        '<td><input class="campo" type="number" step="0.01" min="0" inputmode="decimal" data-trajeto="' + i + '" data-campo="valor" value="' + (t.valor || "") + '" placeholder="0,00" /></td>' +
        '<td><button class="botao-icone" data-remover-trajeto="' + i + '" title="Remover" aria-label="Remover trajeto">' + App.icone("x") + '</button></td>' +
      "</tr>";
    }).join("") : '<tr><td colspan="3" class="tabela-vazia">Nenhum trajeto cadastrado. Clique em "+ Novo trajeto".</td></tr>';
  }

  /* Cada digitação atualiza a cópia em edição (sem redesenhar, para não perder o cursor). */
  document.getElementById("tarifas-fixas").addEventListener("input", function (ev) {
    var a = ev.target;
    if (!a.hasAttribute("data-trajeto")) return;
    var t = trajetosEditando[a.getAttribute("data-trajeto")];
    var campo = a.getAttribute("data-campo");
    t[campo] = campo === "valor" ? Number(a.value) || 0 : a.value;
  });

  document.getElementById("tarifas-fixas").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-remover-trajeto]");
    if (!b) return;
    trajetosEditando.splice(Number(b.getAttribute("data-remover-trajeto")), 1);
    desenharTrajetos();
  });

  document.getElementById("adicionar-fixo").addEventListener("click", function () {
    trajetosEditando.push({ id: u.novoId("tj"), nome: "", valor: 0 });
    desenharTrajetos();
    var campos = document.querySelectorAll('#tarifas-fixas [data-campo="nome"]');
    campos[campos.length - 1].focus();
  });

  document.getElementById("salvar-tarifas").addEventListener("click", function () {
    var nomes = {};
    for (var i = 0; i < trajetosEditando.length; i++) {
      var t = trajetosEditando[i];
      var nome = String(t.nome || "").trim();
      if (!nome) { ui.aviso("Dê um nome para cada trajeto (ex.: Guaíba x POA Zona Sul).", "erro"); return; }
      if (!(t.valor > 0)) { ui.aviso("Informe um valor maior que zero para \"" + nome + "\".", "erro"); return; }
      if (nomes[nome.toLowerCase()]) { ui.aviso("O trajeto \"" + nome + "\" está repetido.", "erro"); return; }
      nomes[nome.toLowerCase()] = true;
      t.nome = nome;
    }
    var novas = Object.assign({}, nuvem.tarifas(), { trajetos: trajetosEditando });
    nuvem.salvarTarifas(novas).then(function () {
      ui.aviso("Valores salvos. Valem para as próximas corridas.", "sucesso");
    }).catch(function (e) { ui.aviso(e.message, "erro"); });
  });

  /* ==========================================================================
     8. CHAT
     ========================================================================== */
  var chatGestor = App.chat.criar(document.getElementById("chat-gestor"), nuvem);

  function conversasVisiveis() {
    return nuvem.corridas().filter(function (c) {
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
    var aguardando = nuvem.corridas().filter(function (c) { return c.status === "aguardando"; }).length;
    var el = document.getElementById("contador-aguardando");
    el.hidden = !aguardando;
    el.textContent = aguardando;
    var chave = App.sessao.chaveUsuario();
    var naoLidas = conversasVisiveis().reduce(function (s, c) { return s + nuvem.naoLidas(c.id, chave); }, 0);
    var elChat = document.getElementById("contador-chat");
    elChat.hidden = !naoLidas;
    elChat.textContent = naoLidas;
  }

  function redesenharAba(aba) {
    if (aba === "visao") { desenharIndicadores(); desenharAtivas(); }
    if (aba === "corridas") desenharTabela();
    if (aba === "motoristas") desenharMotoristas();
    if (aba === "financeiro") desenharFinanceiro();
    if (aba === "tarifas") desenharTarifas();
    if (aba === "chat") desenharConversas();
  }

  /* Alguma coisa mudou (neste ou em outro aparelho): redesenha o que está na tela. */
  nuvem.aoMudar(function (chave) {
    desenharContadores();
    /* A aba de valores só é desenhada ao abrir: assim nunca apaga o que o gestor está digitando. */
    if (abaAtual !== "tarifas") redesenharAba(abaAtual);
    /* Atualiza a janela de detalhe, a não ser que o gestor esteja digitando nela. */
    if (detalheAberto && (chave === "corridas" || chave === "motoristas")) {
      var foco = document.activeElement;
      if (!foco || !document.getElementById("detalhe-info") || !document.getElementById("detalhe-info").contains(foco)) desenharDetalhe();
    }
  });

  /* A cada segundo: move os motoristas no mapa. */
  setInterval(function () {
    mapa.mostrarMotoristas(motoristasComPosicao());
    if (!document.getElementById("modal-aberto")) detalheAberto = null;
  }, 1000);

  /* Primeiro desenho da tela */
  redesenharAba("visao");
  desenharContadores();
})();
