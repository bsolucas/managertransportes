/* =============================================================================
   precos.js — CÁLCULO DO VALOR DAS CORRIDAS
   -----------------------------------------------------------------------------
   Dois modos de preço:

   1) FIXO: valor fechado, cadastrado na "tabela fixa" das tarifas para um
      trajeto (origem -> destino) e um serviço. Se o trajeto não estiver na
      tabela, o cálculo cai automaticamente no modo variável (e avisa).

   2) VARIÁVEL ("volátil"): depende da ocasião.
        valor = base + (km × preço por km) + (minutos × preço por minuto)
        respeitando o valor mínimo do serviço,
        e depois multiplicado por cada ocasião marcada
        (pico, noturno, chuva, feriado, urgente).

   Além disso, cada corrida pode ter EXTRAS somados ao final
   (pedágio, hora de espera, ajudante...). O total da corrida é:
        total = valor calculado + soma dos extras

   A função principal devolve não só o valor, mas também as "linhas" do
   cálculo, para mostrar ao cliente/gestor como o preço foi formado.
   ============================================================================= */

App.precos = {

  /* ---------------------------------------------------------------------------
     calcular(pedido, tarifas)
     pedido = { origem:{id,lat,lng}, destino:{id,lat,lng}, servico, modo,
                ocasioes:["pico", ...] }
     devolve = { valor, modoUsado, distanciaKm, tempoMin, linhas:[{texto,valor}],
                 aviso }
     --------------------------------------------------------------------------- */
  calcular: function (pedido, tarifas) {
    var u = App.utils;
    var distancia = u.distanciaRuaKm(pedido.origem, pedido.destino);
    var tempoMin = distancia / App.config.VELOCIDADE_MEDIA_REAL_KMH * 60;
    var resultado = {
      distanciaKm: u.arredondar(distancia),
      tempoMin: Math.max(1, Math.round(tempoMin)),
      linhas: [],
      aviso: ""
    };

    /* --- Modo FIXO: procura o trajeto na tabela ---------------------------- */
    if (pedido.modo === "fixo") {
      var fixo = App.precos.buscarTarifaFixa(pedido, tarifas);
      if (fixo) {
        resultado.modoUsado = "fixo";
        resultado.valor = fixo.valor;
        resultado.linhas.push({ texto: "Valor fixo do trajeto", valor: fixo.valor });
        return resultado;
      }
      resultado.aviso = "Trajeto sem valor fixo cadastrado: usado o cálculo variável.";
    }

    /* --- Modo VARIÁVEL ----------------------------------------------------- */
    var t = tarifas.servicos[pedido.servico];
    var parcialKm = distancia * t.porKm;
    var parcialMin = resultado.tempoMin * t.porMinuto;
    var valor = t.base + parcialKm + parcialMin;

    resultado.linhas.push({ texto: "Tarifa base", valor: t.base });
    resultado.linhas.push({ texto: resultado.distanciaKm.toFixed(1) + " km × " + u.moeda(t.porKm), valor: parcialKm });
    resultado.linhas.push({ texto: resultado.tempoMin + " min × " + u.moeda(t.porMinuto), valor: parcialMin });

    if (valor < t.minimo) {
      resultado.linhas.push({ texto: "Ajuste para o valor mínimo", valor: t.minimo - valor });
      valor = t.minimo;
    }

    /* Cada ocasião marcada multiplica o valor (ex.: chuva = +15%). */
    (pedido.ocasioes || []).forEach(function (chave) {
      var oc = tarifas.ocasioes[chave];
      if (!oc) return;
      var acrescimo = valor * (oc.multiplicador - 1);
      resultado.linhas.push({
        texto: oc.rotulo + " (×" + oc.multiplicador.toFixed(2) + ")",
        valor: acrescimo
      });
      valor += acrescimo;
    });

    resultado.modoUsado = "variavel";
    resultado.valor = u.arredondar(valor);
    resultado.linhas.forEach(function (l) { l.valor = u.arredondar(l.valor); });
    return resultado;
  },

  /* Procura um valor fixo para o trajeto. Aceita também o trajeto inverso
     (destino -> origem), já que normalmente o preço é o mesmo na volta. */
  buscarTarifaFixa: function (pedido, tarifas) {
    if (!pedido.origem.id || !pedido.destino.id) return null;
    return tarifas.tabelaFixa.find(function (f) {
      var mesmoServico = f.servico === pedido.servico;
      var ida = f.origemId === pedido.origem.id && f.destinoId === pedido.destino.id;
      var volta = f.origemId === pedido.destino.id && f.destinoId === pedido.origem.id;
      return mesmoServico && (ida || volta);
    }) || null;
  },

  /* Soma dos extras de uma corrida (pedágio, espera...). */
  totalExtras: function (corrida) {
    return (corrida.extras || []).reduce(function (soma, e) { return soma + (Number(e.valor) || 0); }, 0);
  },

  /* Valor final cobrado: valor da corrida + extras. */
  totalCorrida: function (corrida) {
    return App.utils.arredondar((corrida.valor || 0) + App.precos.totalExtras(corrida));
  },

  /* Sugere ocasiões automáticas pela data/hora atual
     (pico: 7h–9h e 17h–19h em dia útil; noturno: 22h–6h; fim de semana). */
  ocasioesSugeridas: function (data) {
    data = data || new Date();
    var h = data.getHours();
    var diaSemana = data.getDay(); // 0 = domingo, 6 = sábado
    var sugeridas = [];
    var diaUtil = diaSemana >= 1 && diaSemana <= 5;
    if (diaUtil && ((h >= 7 && h < 9) || (h >= 17 && h < 19))) sugeridas.push("pico");
    if (h >= 22 || h < 6) sugeridas.push("noturno");
    if (!diaUtil) sugeridas.push("feriado");
    return sugeridas;
  }
};
