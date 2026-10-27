/* =============================================================================
   paginas/cliente.js — COMPORTAMENTO DO PORTAL DO CLIENTE (paginas/cliente.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação (login e carregamento dos dados do Supabase)
     2. Formulário "Pedir corrida" (trajeto da empresa, embarque, serviço)
     3. Enviar o pedido
     4. "Minhas corridas": lista, acompanhamento, mapa (GPS do motorista) e chat
     5. Atualização automática

   Os dados vêm do Supabase por js/nuvem.js, com atualização ao vivo. O valor da
   corrida é sempre o do trajeto cadastrado pela empresa (o banco confere).
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var nuvem = App.nuvem;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var usuario = App.sessao.exigir("cliente");
  if (!usuario) return;
  ui.montarTopo();
  document.getElementById("usuario-avatar").textContent = u.iniciais(usuario.nome);

  /* Só monta a tela depois de confirmar o login e carregar os dados. */
  App.auth.exigirLogin()
    .then(function () { return nuvem.iniciar(); })
    .then(function () {
      App.notificacoes.iniciar(function (n) {   // aviso, bip e sininho; clicar abre a corrida
        ui.$('[data-aba="minhas"]').click();
        if (n.corrida_id && App.__selecionarCorrida) App.__selecionarCorrida(n.corrida_id);
      });
      montar();
    })
    .catch(function (e) {
      document.querySelector('[data-painel="pedir"]').innerHTML =
        '<div class="cartao"><h2>Não foi possível carregar</h2><p class="texto-suave">' +
        u.escaparHtml(e.message || "Verifique a internet e atualize a página.") + "</p></div>";
    });

  function montar() {
    var mapaAcompanhar = App.mapa.criar("mapa-acompanhar");
    var chat = App.chat.criar(document.getElementById("chat-cliente"), nuvem);
    var abaAtual = "pedir";
    var corridaSelecionada = null;
    App.__selecionarCorrida = function (id) { corridaSelecionada = id; desenharMinhas(); desenharAcompanhamento(); };   // usado pelo sininho

    ui.ligarAbas(function (aba) {
      abaAtual = aba;
      if (aba === "minhas") { mapaAcompanhar.redimensionar(); desenharMinhas(); desenharAcompanhamento(); }
    });

    /* GPS dos motoristas que o banco deixa este cliente ver (só o da corrida dele). */
    var posicoes = {};   // motorista_id -> { lat, lng }
    App.rastreio.carregarTodas().then(function (lista) {
      lista.forEach(function (p) { posicoes[p.motorista_id] = p; });
      atualizarMapa();
    });
    App.rastreio.assinar(function (p) {
      if (p.removida) delete posicoes[p.motorista_id]; else posicoes[p.motorista_id] = p;
      atualizarMapa();
    });

    /* ========================================================================
       2. FORMULÁRIO "PEDIR CORRIDA"
       ======================================================================== */
    var selTrajeto = document.getElementById("pedido-trajeto");

    function trajetos() { return (nuvem.tarifas() || {}).trajetos || []; }

    function preencherTrajetos() {
      var lista = trajetos();
      ui.preencherSelect(selTrajeto,
        [{ valor: "", texto: lista.length ? "Selecione..." : "A empresa ainda não cadastrou trajetos" }]
          .concat(lista.map(function (t) { return { valor: t.id, texto: t.nome }; })),
        selTrajeto.value);
      desenharTrajetos();
    }

    /* Lista de trajetos em cartões (nome + valor). Tocar num cartão escolhe o trajeto no <select> escondido. */
    function desenharTrajetos() {
      var lista = trajetos(), caixa = document.getElementById("lista-trajetos");
      if (!lista.length) { caixa.innerHTML = '<p class="texto-suave">A empresa ainda não cadastrou trajetos.</p>'; return; }
      caixa.innerHTML = lista.map(function (t) {
        return '<label class="trajeto"><input type="radio" name="trajeto" value="' + u.escaparHtml(t.id) + '"' + (t.id === selTrajeto.value ? " checked" : "") + " />" +
          '<span class="trajeto-icone">' + App.icone("navigation") + "</span>" +
          '<span class="trajeto-nome">' + u.escaparHtml(t.nome) + "</span>" +
          '<span class="trajeto-valor">' + u.moeda(t.valor) + "</span>" +
          '<span class="marca-ok">' + App.icone("check") + "</span></label>";
      }).join("");
    }
    document.getElementById("lista-trajetos").addEventListener("change", function (ev) {
      if (ev.target.name !== "trajeto") return;
      selTrajeto.value = ev.target.value;
      selTrajeto.dispatchEvent(new Event("change"));
    });

    function trajetoEscolhido() {
      return trajetos().filter(function (t) { return t.id === selTrajeto.value; })[0] || null;
    }

    /* Tipo de veículo em azulejos grandes: ícone, nome e (se tiver) a explicação pequena. */
    document.getElementById("pedido-servicos").innerHTML = Object.keys(App.SERVICOS).map(function (s, i) {
      var partes = App.SERVICOS[s].rotulo.split(" ("), nome = partes[0], detalhe = partes[1] ? partes[1].replace(")", "") : "";
      return '<label class="servico"><input type="radio" name="servico" value="' + s + '"' + (i === 0 ? " checked" : "") + " />" +
             '<span class="servico-icone">' + App.SERVICOS[s].icone + "</span>" +
             '<span class="servico-nome">' + nome + "</span>" +
             (detalhe ? '<span class="servico-detalhe">' + detalhe + "</span>" : "") +
             '<span class="marca-ok">' + App.icone("check") + "</span></label>";
    }).join("");

    /* Mostra o valor do trajeto antes de pedir. */
    function atualizarPrevia() {
      var t = trajetoEscolhido();
      document.getElementById("botao-pedir").disabled = !t;
      document.getElementById("previa-preco").innerHTML = t
        ? '<div class="previa-linha"><div><span class="previa-rotulo">Valor da corrida</span><span class="previa-nome">' + u.escaparHtml(t.nome) + "</span></div>" +
          '<strong class="previa-valor">' + u.moeda(t.valor) + "</strong></div>" +
          '<p class="texto-suave texto-pequeno">Pedágios, esperas e outros extras podem ser somados depois.</p>'
        : '<p class="texto-suave previa-vazia">Escolha o trajeto para ver o valor.</p>';
    }
    selTrajeto.addEventListener("change", atualizarPrevia);

    /* ========================================================================
       3. ENVIAR O PEDIDO
       ======================================================================== */
    /* Avisa o cliente o que acontece depois que ele pede (depende de como a empresa configurou). */
    var meuCadastro = nuvem.buscarCliente(usuario.id);
    document.getElementById("aviso-modo-pedido").textContent = meuCadastro && meuCadastro.modoSolicitacao === "automatico"
      ? "Assim que você pedir, o sistema procura um motorista livre para atender."
      : "Seu pedido chega ao gestor, que escolhe o motorista.";

    document.getElementById("formulario-pedido").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = trajetoEscolhido();
      if (!t) return;
      var embarque = document.getElementById("pedido-embarque").value.trim();
      if (!embarque) { ui.aviso("Informe o endereço de embarque.", "erro"); return; }
      var botao = document.getElementById("botao-pedir");
      botao.disabled = true;
      nuvem.criarCorrida({
        clienteId: usuario.id,
        trajeto: t.nome,
        embarque: embarque,
        destinoEndereco: document.getElementById("pedido-destino").value.trim(),
        servico: (ui.$('input[name="servico"]:checked') || {}).value,
        valor: t.valor,   // o banco troca pelo valor oficial do trajeto
        observacoes: document.getElementById("pedido-observacoes").value.trim()
      }).then(function (corrida) {
        ui.aviso("Corrida " + corrida.codigo + " solicitada!", "sucesso");
        document.getElementById("pedido-embarque").value = "";
        document.getElementById("pedido-destino").value = "";
        document.getElementById("pedido-observacoes").value = "";
        selTrajeto.value = "";
        desenharTrajetos();
        atualizarPrevia();
        corridaSelecionada = corrida.id;
        document.querySelector('[data-aba="minhas"]').click();
      }).catch(function (e) {
        botao.disabled = false;
        ui.aviso(e.message, "erro");
      });
    });

    /* "Usar minha localização atual": pega o GPS do aparelho e converte em endereço (OpenStreetMap/Nominatim,
       gratuito). Se não conseguir o endereço, preenche com as coordenadas, que o motorista abre no mapa. */
    var botaoLoc = document.getElementById("usar-localizacao");
    var dicaLoc = document.getElementById("dica-localizacao");
    function rotuloLoc(carregando) {
      botaoLoc.disabled = !!carregando; botaoLoc.classList.toggle("carregando", !!carregando);
      botaoLoc.innerHTML = App.icone("navigation");
      botaoLoc.title = botaoLoc.ariaLabel = carregando ? "Buscando sua localização..." : "Usar minha localização atual";
    }
    rotuloLoc(false);
    function dicaLocal(txt) { dicaLoc.hidden = !txt; dicaLoc.textContent = txt || ""; }
    botaoLoc.addEventListener("click", function () {
      if (!navigator.geolocation) { ui.aviso("Este aparelho não permite descobrir a localização.", "erro"); return; }
      rotuloLoc(true); dicaLocal("");
      navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        var coords = lat.toFixed(6) + ", " + lng.toFixed(6);
        var campo = document.getElementById("pedido-embarque");
        var ctl = window.AbortController ? new AbortController() : null;
        var t = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
        fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=" + lat + "&lon=" + lng, ctl ? { signal: ctl.signal } : {})
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var a = j.address || {};
            var rua = a.road || a.pedestrian || a.footway || "";
            var partes = [rua && (rua + (a.house_number ? ", " + a.house_number : "")), a.suburb || a.neighbourhood, a.city || a.town || a.village || a.municipality].filter(Boolean);
            campo.value = (partes.length ? partes.join(" - ") : (j.display_name || coords)).slice(0, 200);
            dicaLocal("Confira o endereço e ajuste o número ou o ponto exato, se precisar.");
          })
          .catch(function () { campo.value = "Localização atual (" + coords + ")"; dicaLocal("Não achei o nome da rua, então enviei suas coordenadas. O motorista abre direto no mapa."); })
          .then(function () { clearTimeout(t); rotuloLoc(false); });
      }, function (erro) {
        rotuloLoc(false);
        ui.aviso(erro && erro.code === 1 ? "Localização bloqueada. Permita o acesso à localização no navegador e tente de novo." : "Não consegui descobrir sua localização. Digite o endereço.", "erro");
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });

    /* ========================================================================
       4. MINHAS CORRIDAS
       ======================================================================== */
    function minhasCorridas() {
      return nuvem.corridas().filter(function (c) { return c.clienteId === usuario.id; })
        .sort(function (a, b) { return b.criadaEm - a.criadaEm; });
    }

    /* Botão "Remover canceladas": só aparece quando há alguma. */
    function atualizarBotaoCanceladas() {
      var ids = minhasCorridas().filter(function (c) { return c.status === "cancelada"; }).map(function (c) { return c.id; });
      var b = document.getElementById("remover-canceladas");
      b.hidden = !ids.length;
      b.innerHTML = App.icone("trash-2") + " Remover canceladas (" + ids.length + ")";
      return ids;
    }
    document.getElementById("remover-canceladas").addEventListener("click", function () {
      var ids = atualizarBotaoCanceladas();
      if (!ids.length) return;
      ui.confirmar("Remover " + u.plural(ids.length, "corrida cancelada", "corridas canceladas") + "? O chat delas também será apagado. Isso não pode ser desfeito.").then(function (sim) {
        if (!sim) return;
        nuvem.removerCanceladas(ids).then(function (n) { ui.aviso(u.plural(n, "corrida removida", "corridas removidas") + ".", "sucesso"); })
          .catch(function (e) { ui.aviso(e.message, "erro"); });
      });
    });

    function desenharMinhas() {
      atualizarBotaoCanceladas();
      var lista = minhasCorridas();
      if (corridaSelecionada && !lista.some(function (c) { return c.id === corridaSelecionada; })) corridaSelecionada = null;   // a selecionada foi removida
      if (!corridaSelecionada && lista.length) corridaSelecionada = lista[0].id;
      var chave = App.sessao.chaveUsuario();
      document.getElementById("lista-minhas").innerHTML = lista.length ? lista.map(function (c) {
        var naoLidas = nuvem.naoLidas(c.id, chave);
        return '<div class="item-corrida' + (c.id === corridaSelecionada ? " selecionado" : "") + '" data-corrida="' + c.id + '">' +
          '<div class="item-corrida-topo"><span class="item-corrida-codigo">' + c.codigo + " " + App.SERVICOS[c.servico].icone + "</span>" +
            (naoLidas ? '<span class="contador-nao-lidas">' + naoLidas + "</span>" : ui.seloStatus(c.status)) + "</div>" +
          '<div class="item-corrida-rota"><strong>' + u.escaparHtml(c.trajeto) + "</strong>" +
            (c.embarque ? "<br><span>Embarque:</span> " + u.escaparHtml(c.embarque) : "") + "</div>" +
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
      var c = corridaSelecionada && nuvem.buscarCorrida(corridaSelecionada);
      if (!c) {
        area.innerHTML = '<p class="texto-suave">Selecione uma corrida para acompanhar.</p>';
        atualizarMapa();
        return;
      }
      var m = c.motoristaId ? nuvem.buscarMotorista(c.motoristaId) : null;
      var podeCancelar = c.status === "aguardando" || c.status === "aceita";

      var blocoMotorista = m
        ? '<div class="acompanhamento-motorista">' + ui.avatar(m.nome, "avatar-grande") +
            "<div><strong>" + u.escaparHtml(m.nome) + "</strong>" +
            '<div class="texto-suave texto-pequeno">' +
              u.escaparHtml([m.veiculo.modelo, m.veiculo.cor, m.veiculo.placa ? "placa " + m.veiculo.placa : ""].filter(Boolean).join(" • ")) +
            "</div></div></div>"
        : (c.status === "aguardando" ? '<p class="texto-suave">Procurando um motorista disponível...</p>' : "");

      area.innerHTML =
        '<div class="acompanhamento-topo"><h2>Corrida ' + c.codigo + "</h2>" + ui.seloStatus(c.status) + "</div>" +
        blocoMotorista +
        '<dl class="lista-dados">' +
          "<dt>Trajeto</dt><dd>" + u.escaparHtml(c.trajeto) + "</dd>" +
          "<dt>Embarque</dt><dd>" + u.escaparHtml(c.embarque || "—") + "</dd>" +
          (c.destinoEndereco ? "<dt>Destino</dt><dd>" + u.escaparHtml(c.destinoEndereco) + "</dd>" : "") +
          "<dt>Serviço</dt><dd>" + App.SERVICOS[c.servico].icone + " " + App.SERVICOS[c.servico].rotulo + "</dd>" +
          (c.observacoes ? "<dt>Observações</dt><dd>" + u.escaparHtml(c.observacoes) + "</dd>" : "") +
          "<dt>Valor</dt><dd>" + u.moeda(c.valor) + (App.precos.totalExtras(c) ? " + extras " + u.moeda(App.precos.totalExtras(c)) : "") +
            " = <strong>" + u.moeda(App.precos.totalCorrida(c)) + "</strong></dd>" +
        "</dl>" +
        (podeCancelar ? '<div class="acoes-corrida"><button class="botao botao-perigo" id="cancelar-minha">Cancelar corrida</button></div>' : "");

      atualizarMapa();

      var btn = document.getElementById("cancelar-minha");
      if (btn) btn.addEventListener("click", function () {
        ui.confirmar("Cancelar a corrida " + c.codigo + "?").then(function (sim) {
          if (!sim) return;
          nuvem.cancelarCorrida(c.id, "cancelada pelo cliente")
            .then(function () { ui.aviso("Corrida cancelada.", "info"); })
            .catch(function (e) { ui.aviso(e.message, "erro"); });
        });
      });
    }

    /* No mapa: o motorista da corrida, enquanto ele vai até o cliente ou está em viagem. */
    var ultimoFoco = null;
    function atualizarMapa() {
      var c = corridaSelecionada && nuvem.buscarCorrida(corridaSelecionada);
      var pos = c && c.motoristaId && (c.status === "aceita" || c.status === "em_andamento") ? posicoes[c.motoristaId] : null;
      var m = pos && nuvem.buscarMotorista(c.motoristaId);
      mapaAcompanhar.mostrarMotoristas(m ? [{ motorista: m, posicao: pos, destaque: true }] : []);
      if (m && ultimoFoco !== c.id) { ultimoFoco = c.id; mapaAcompanhar.focar(pos, 15); }
      document.getElementById("aviso-mapa").hidden = !!m;
    }

    /* Contador de mensagens não lidas na aba "Minhas corridas". */
    function desenharContador() {
      var chave = App.sessao.chaveUsuario();
      var total = minhasCorridas().reduce(function (s, c) {
        return s + (c.id === corridaSelecionada && abaAtual === "minhas" ? 0 : nuvem.naoLidas(c.id, chave));
      }, 0);
      var el = document.getElementById("contador-cliente");
      el.hidden = !total;
      el.textContent = total;
    }

    /* ========================================================================
       5. ATUALIZAÇÃO AUTOMÁTICA
       ======================================================================== */
    nuvem.aoMudar(function (chave) {
      if (chave === "tarifas") { preencherTrajetos(); atualizarPrevia(); }
      if (chave === "corridas" || chave === "motoristas" || chave === "mensagens") {
        if (abaAtual === "minhas") { desenharAcompanhamento(); desenharMinhas(); }
        desenharContador();
      }
    });

    /* Primeiro desenho */
    preencherTrajetos();
    atualizarPrevia();
    desenharContador();
  }
})();
