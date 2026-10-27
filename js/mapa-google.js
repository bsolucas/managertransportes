/* =============================================================================
   mapa-google.js — MAPA DO GOOGLE MAPS (mesma "interface" do mapa.js)
   -----------------------------------------------------------------------------
   O mapa.js chama App.mapaGoogle.criar(idDaDiv) quando há chave em
   config-mapa.js. O objeto devolvido tem os mesmos métodos do mapa livre
   (mostrarMotoristas, mostrarCorrida, marcarPonto, aoClicar, focar, enquadrar...),
   então as telas não mudam. Os marcadores usam as mesmas classes de css/mapa.css.

   O Google carrega de forma assíncrona: chamadas feitas antes disso ficam numa
   fila e são executadas assim que o mapa estiver pronto.
   ============================================================================= */

App.mapaGoogle = {

  /* Carrega o script do Google uma única vez e avisa quem estiver esperando. */
  _esperando: [],
  _estado: "parado",          // parado | carregando | pronto | erro
  _falhas: [],                // funções que trocam cada mapa para o mapa livre se o Google falhar

  carregar: function (aoPronto, aoErro) {
    var g = App.mapaGoogle;
    if (g._estado === "pronto") return aoPronto();
    if (g._estado === "erro") return aoErro();
    g._esperando.push({ ok: aoPronto, erro: aoErro });
    if (g._estado === "carregando") return;
    g._estado = "carregando";

    function terminar(ok) {
      g._estado = ok ? "pronto" : "erro";
      g._esperando.forEach(function (e) { (ok ? e.ok : e.erro)(); });
      g._esperando = [];
    }
    window.__mapaGoogleCallback = function () { terminar(true); };
    /* Se a chave for recusada, o Google chama esta função global (mesmo com o script já carregado). */
    window.gm_authFailure = function () {
      terminar(false);
      var trocas = g._falhas; g._falhas = [];
      /* O Google escreve a mensagem de erro dentro do mapa logo DEPOIS de chamar esta função:
         espera um instante para só então limpar e trocar para o mapa livre. */
      setTimeout(function () { trocas.forEach(function (trocar) { trocar(); }); }, 300);
    };

    var s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(App.mapaConfig.googleChave) +
            "&callback=__mapaGoogleCallback&language=pt-BR&region=BR";
    s.async = true;
    s.onerror = function () { terminar(false); };
    document.head.appendChild(s);
  },

  /* "alternativa" (opcional): função que cria o mapa livre; é usada se o Google não carregar
     ou recusar a chave, e recebe de volta tudo o que já estava desenhado. */
  criar: function (idElemento, alternativa) {
    var fila = [];
    var real = null;
    var noGoogle = false;
    /* Guarda o que a tela pediu, para repetir no mapa livre se for preciso trocar. */
    var memoria = { ultimas: {}, pontos: [], cliques: [] };

    function lembrar(nome, args) {
      if (nome === "aoClicar") memoria.cliques.push(args[0]);
      else if (nome === "marcarPonto") memoria.pontos.push(args);
      else if (nome === "limparPontos") memoria.pontos = [];
      else memoria.ultimas[nome] = args;
    }

    /* Delega para a implementação real, ou guarda na fila até ela existir. */
    function delegar(nome) {
      return function () {
        lembrar(nome, arguments);
        if (real) return real[nome].apply(null, arguments);
        fila.push([nome, arguments]);
      };
    }

    function mostrarIndisponivel() {
      var el = document.getElementById(idElemento);
      if (el) el.innerHTML = '<div class="mapa-indisponivel">Google Maps indisponível: confira a chave em js/config-mapa.js e a conexão.</div>';
    }

    /* Troca para o mapa livre (uma vez só) e repete o que já estava na tela. */
    function usarMapaLivre() {
      if (!alternativa) { mostrarIndisponivel(); return; }
      if (real && !noGoogle) return;
      var el = document.getElementById(idElemento);
      if (el) el.innerHTML = "";                      // tira o aviso de erro do Google
      real = alternativa();
      noGoogle = false;
      memoria.cliques.forEach(function (fn) { real.aoClicar(fn); });
      memoria.pontos.forEach(function (a) { real.marcarPonto.apply(null, a); });
      ["mostrarCorrida", "mostrarMotoristas", "enquadrar", "focar", "redimensionar"].forEach(function (n) {
        if (memoria.ultimas[n]) real[n].apply(null, memoria.ultimas[n]);
      });
      fila = [];
      /* Sobras do Google (a mensagem de erro dele chega por último) saem do caminho do mapa livre. */
      setTimeout(function () {
        var c = document.getElementById(idElemento);
        if (c) [].forEach.call(c.querySelectorAll(".gm-err-container, .gm-style"), function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      }, 600);
      if (window.console) console.warn("Google Maps indisponível: usando o mapa gratuito.");
    }
    var nomes = ["mostrarMotoristas", "mostrarCorrida", "limparCorrida", "marcarPonto",
                 "limparPontos", "aoClicar", "focar", "enquadrar", "redimensionar"];
    var fachada = {};
    nomes.forEach(function (n) { fachada[n] = delegar(n); });

    App.mapaGoogle.carregar(function () {
      real = App.mapaGoogle._montar(idElemento);
      noGoogle = true;
      fila.forEach(function (c) { real[c[0]].apply(null, c[1]); });
      fila = [];
      /* Se o Google recusar a chave DEPOIS de carregar (chave vencida, sem faturamento...), troca. */
      App.mapaGoogle._falhas.push(usarMapaLivre);
    }, usarMapaLivre);
    return fachada;
  },

  /* Monta o mapa de verdade (só roda depois que o Google carregou). */
  _montar: function (idElemento) {
    var u = App.utils;
    var centro = App.config.MAPA_CENTRO;
    var mapa = new google.maps.Map(document.getElementById(idElemento), {
      center: { lat: centro[0], lng: centro[1] },
      zoom: App.config.MAPA_ZOOM,
      clickableIcons: false,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false
    });

    /* Marcador feito de HTML (usa as classes do css/mapa.css). */
    function MarcadorHtml(pos, classe, html, dica, tamanho, ancora) {
      this.pos = pos; this.classe = classe; this.html = html; this.dica = dica;
      this.tamanho = tamanho; this.ancora = ancora; this.el = null;
      this.setMap(mapa);
    }
    MarcadorHtml.prototype = Object.create(google.maps.OverlayView.prototype);
    MarcadorHtml.prototype.onAdd = function () {
      this.el = document.createElement("div");
      this.el.style.position = "absolute";
      this.el.style.width = this.tamanho + "px";
      this.el.style.height = this.tamanho + "px";
      this.atualizar();
      this.getPanes().overlayMouseTarget.appendChild(this.el);
    };
    MarcadorHtml.prototype.atualizar = function () {
      if (!this.el) return;
      this.el.className = this.classe;
      this.el.innerHTML = this.html;
      this.el.title = this.dica || "";
    };
    MarcadorHtml.prototype.draw = function () {
      var p = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
      if (!p || !this.el) return;
      this.el.style.left = (p.x - this.tamanho / 2) + "px";
      this.el.style.top = (p.y - (this.ancora === "base" ? this.tamanho : this.tamanho / 2)) + "px";
    };
    MarcadorHtml.prototype.onRemove = function () {
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
    };
    MarcadorHtml.prototype.mover = function (pos) { this.pos = pos; this.draw(); };

    function textoDica(m) {
      return m.nome + " — " + m.veiculo.modelo + " • " + m.veiculo.placa + " — " + ((App.STATUS_MOTORISTA[m.status] || {}).rotulo || "");
    }
    function htmlMotorista(m) {
      var icone = (App.SERVICOS[m.servicos[0]] || {}).icone || App.icone("car-front");
      return '<span class="marcador-iniciais">' + u.iniciais(m.nome) + '</span><span class="marcador-icone">' + icone + "</span>";
    }
    function classeMotorista(m, destaque) {
      return "marcador-motorista " + ((App.STATUS_MOTORISTA[m.status] || {}).classe || "") + (destaque ? " marcador-destaque" : "");
    }

    var marcadoresMotoristas = {};   // id do motorista -> MarcadorHtml
    var marcadoresCorrida = [];
    var linhaCorrida = null;
    var marcadoresPontos = [];

    return {
      mostrarMotoristas: function (lista) {
        var vistos = {};
        lista.forEach(function (item) {
          var m = item.motorista;
          vistos[m.id] = true;
          var pos = { lat: item.posicao.lat, lng: item.posicao.lng };
          var mk = marcadoresMotoristas[m.id];
          if (!mk) {
            marcadoresMotoristas[m.id] = new MarcadorHtml(pos, classeMotorista(m, item.destaque),
              htmlMotorista(m), textoDica(m), 38, "centro");
          } else {
            mk.classe = classeMotorista(m, item.destaque);
            mk.dica = textoDica(m);
            mk.atualizar();
            mk.mover(pos);
          }
        });
        Object.keys(marcadoresMotoristas).forEach(function (id) {
          if (!vistos[id]) { marcadoresMotoristas[id].setMap(null); delete marcadoresMotoristas[id]; }
        });
      },

      mostrarCorrida: function (corrida) {
        this.limparCorrida();
        if (!corrida) return;
        var a = { lat: corrida.origem.lat, lng: corrida.origem.lng };
        var b = { lat: corrida.destino.lat, lng: corrida.destino.lng };
        marcadoresCorrida.push(new MarcadorHtml(a, "marcador-ponto ponto-origem", "<span><b>A</b></span>", "Origem: " + corrida.origem.nome, 28, "base"));
        marcadoresCorrida.push(new MarcadorHtml(b, "marcador-ponto ponto-destino", "<span><b>B</b></span>", "Destino: " + corrida.destino.nome, 28, "base"));
        linhaCorrida = new google.maps.Polyline({ path: [a, b], map: mapa, strokeColor: "#1d4ed8", strokeWeight: 4, strokeOpacity: 0.8 });
      },

      limparCorrida: function () {
        marcadoresCorrida.forEach(function (m) { m.setMap(null); });
        marcadoresCorrida = [];
        if (linhaCorrida) { linhaCorrida.setMap(null); linhaCorrida = null; }
      },

      marcarPonto: function (ponto, letra, classe) {
        if (!ponto) return;
        marcadoresPontos.push(new MarcadorHtml({ lat: ponto.lat, lng: ponto.lng }, "marcador-ponto " + classe,
          "<span><b>" + letra + "</b></span>", "", 28, "base"));
      },
      limparPontos: function () {
        marcadoresPontos.forEach(function (m) { m.setMap(null); });
        marcadoresPontos = [];
      },

      aoClicar: function (fn) {
        mapa.addListener("click", function (ev) { fn({ lat: ev.latLng.lat(), lng: ev.latLng.lng() }); });
      },

      focar: function (ponto, zoom) {
        if (!ponto) return;
        mapa.panTo({ lat: ponto.lat, lng: ponto.lng });
        if (zoom) mapa.setZoom(zoom);
      },

      enquadrar: function (pontos) {
        if (!pontos || pontos.length === 0) return;
        var limites = new google.maps.LatLngBounds();
        pontos.forEach(function (p) { limites.extend({ lat: p.lat, lng: p.lng }); });
        mapa.fitBounds(limites, 40);
        /* Não aproximar demais quando há um ponto só. */
        google.maps.event.addListenerOnce(mapa, "idle", function () { if (mapa.getZoom() > 15) mapa.setZoom(15); });
      },

      redimensionar: function () {
        setTimeout(function () { google.maps.event.trigger(mapa, "resize"); }, 50);
      }
    };
  }
};
