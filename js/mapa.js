/* =============================================================================
   mapa.js — MAPA AO VIVO (usa a biblioteca Leaflet + mapas do OpenStreetMap)
   -----------------------------------------------------------------------------
   Este arquivo "embrulha" o Leaflet para as telas usarem de um jeito simples:

     var mapa = App.mapa.criar("idDaDiv");
     mapa.mostrarMotoristas(listaDeMotoristas);  // marcadores que se movem
     mapa.mostrarCorrida(corrida);               // origem, destino e linha
     mapa.aoClicar(function (ponto) { ... });    // escolher local no mapa

   As cores e o formato dos marcadores ficam no CSS (css/mapa.css), não aqui.
   Precisa de internet para baixar os "azulejos" (imagens) do mapa.
   ============================================================================= */

App.mapa = {

  criar: function (idElemento) {
    var u = App.utils;

    /* Com chave do Google em config-mapa.js, usa o Google Maps (mapa-google.js) — mas só para
       quem estiver marcado em "googleEm" (os outros seguem no mapa livre, sem custo). */
    var perfil = (App.sessao && App.sessao.atual() || {}).tipo;
    var quemUsaGoogle = (App.mapaConfig && App.mapaConfig.googleEm) || {};
    if (App.mapaConfig && App.mapaConfig.googleChave && App.mapaGoogle && quemUsaGoogle[perfil]) {
      return App.mapaGoogle.criar(idElemento);
    }

    /* Se o Leaflet não carregou (sem internet), mostra um aviso no lugar. */
    if (typeof L === "undefined") {
      var el = document.getElementById(idElemento);
      if (el) el.innerHTML = '<div class="mapa-indisponivel">Mapa indisponível: verifique a conexão com a internet.</div>';
      var nada = function () {};
      return { mostrarMotoristas: nada, mostrarCorrida: nada, limparCorrida: nada, marcarPonto: nada,
               limparPontos: nada, aoClicar: nada, focar: nada, enquadrar: nada, redimensionar: nada };
    }

    var mapa = L.map(idElemento, { zoomControl: true, attributionControl: true })
      .setView(App.config.MAPA_CENTRO, App.config.MAPA_ZOOM);

    /* Recalcula o tamanho depois que a página termina de montar o layout
       (sem isso, às vezes sobra uma faixa cinza no mapa). */
    window.addEventListener("load", function () { mapa.invalidateSize(); });
    setTimeout(function () { mapa.invalidateSize(); }, 300);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(mapa);

    var marcadoresMotoristas = {};   // id do motorista -> marcador
    var camadaCorrida = L.layerGroup().addTo(mapa);
    var camadaPontos = L.layerGroup().addTo(mapa);

    /* Ícone de motorista: um círculo com as iniciais e o ícone do serviço.
       A classe CSS muda conforme o status (disponível, em corrida, offline). */
    function iconeMotorista(m, destaque) {
      var classeStatus = (App.STATUS_MOTORISTA[m.status] || {}).classe || "";
      var icone = (App.SERVICOS[m.servicos[0]] || {}).icone || App.icone("car-front");
      return L.divIcon({
        className: "marcador-motorista " + classeStatus + (destaque ? " marcador-destaque" : ""),
        html: '<span class="marcador-iniciais">' + u.iniciais(m.nome) + "</span>" +
              '<span class="marcador-icone">' + icone + "</span>",
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });
    }

    /* Ícone de ponto (origem "A" / destino "B"). */
    function iconePonto(letra, classe) {
      return L.divIcon({
        className: "marcador-ponto " + classe,
        html: "<span><b>" + letra + "</b></span>",
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      });
    }

    return {
      /* Cria/move os marcadores dos motoristas.
         lista = [{ motorista, posicao, destaque }] */
      mostrarMotoristas: function (lista) {
        var vistos = {};
        lista.forEach(function (item) {
          var m = item.motorista;
          vistos[m.id] = true;
          var latlng = [item.posicao.lat, item.posicao.lng];
          var dica = "<strong>" + u.escaparHtml(m.nome) + "</strong><br>" +
                     u.escaparHtml(m.veiculo.modelo) + " • " + u.escaparHtml(m.veiculo.placa) + "<br>" +
                     (App.STATUS_MOTORISTA[m.status] || {}).rotulo;
          if (!marcadoresMotoristas[m.id]) {
            marcadoresMotoristas[m.id] = L.marker(latlng, { icon: iconeMotorista(m, item.destaque) })
              .bindTooltip(dica, { direction: "top", offset: [0, -16] })
              .addTo(mapa);
            marcadoresMotoristas[m.id]._chaveIcone = m.status + item.destaque;
          } else {
            var mk = marcadoresMotoristas[m.id];
            mk.setLatLng(latlng);
            mk.setTooltipContent(dica);
            /* Só troca o ícone quando o status muda (evita "piscar"). */
            if (mk._chaveIcone !== m.status + item.destaque) {
              mk.setIcon(iconeMotorista(m, item.destaque));
              mk._chaveIcone = m.status + item.destaque;
            }
          }
        });
        /* Remove marcadores de motoristas que saíram da lista. */
        Object.keys(marcadoresMotoristas).forEach(function (id) {
          if (!vistos[id]) {
            mapa.removeLayer(marcadoresMotoristas[id]);
            delete marcadoresMotoristas[id];
          }
        });
      },

      /* Desenha a origem (A), o destino (B) e uma linha entre eles. */
      mostrarCorrida: function (corrida) {
        camadaCorrida.clearLayers();
        if (!corrida) return;
        var a = [corrida.origem.lat, corrida.origem.lng];
        var b = [corrida.destino.lat, corrida.destino.lng];
        L.marker(a, { icon: iconePonto("A", "ponto-origem") })
          .bindTooltip("Origem: " + u.escaparHtml(corrida.origem.nome)).addTo(camadaCorrida);
        L.marker(b, { icon: iconePonto("B", "ponto-destino") })
          .bindTooltip("Destino: " + u.escaparHtml(corrida.destino.nome)).addTo(camadaCorrida);
        L.polyline([a, b], { className: "linha-corrida" }).addTo(camadaCorrida);
      },

      limparCorrida: function () { camadaCorrida.clearLayers(); },

      /* Marca um ponto avulso (usado ao escolher origem/destino no mapa). */
      marcarPonto: function (ponto, letra, classe) {
        if (!ponto) return;
        L.marker([ponto.lat, ponto.lng], { icon: iconePonto(letra, classe) }).addTo(camadaPontos);
      },
      limparPontos: function () { camadaPontos.clearLayers(); },

      /* Chama fn({lat, lng}) quando o usuário clica no mapa. */
      aoClicar: function (fn) {
        mapa.on("click", function (ev) { fn({ lat: ev.latlng.lat, lng: ev.latlng.lng }); });
      },

      /* Centraliza num ponto. */
      focar: function (ponto, zoom) {
        if (ponto) mapa.setView([ponto.lat, ponto.lng], zoom || mapa.getZoom());
      },

      /* Ajusta o zoom para caber todos os pontos informados. */
      enquadrar: function (pontos) {
        if (!pontos || pontos.length === 0) return;
        mapa.fitBounds(L.latLngBounds(pontos.map(function (p) { return [p.lat, p.lng]; })), { padding: [40, 40], maxZoom: 15 });
      },

      /* Necessário quando o mapa estava escondido e passa a aparecer. */
      redimensionar: function () { setTimeout(function () { mapa.invalidateSize(); }, 50); }
    };
  }
};
