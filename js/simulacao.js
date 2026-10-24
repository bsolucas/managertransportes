/* =============================================================================
   simulacao.js — SIMULAÇÃO DE "TEMPO REAL" (GPS FALSO + MOTORISTAS ROBÔS)
   -----------------------------------------------------------------------------
   No app de verdade, a posição de cada motorista virá do GPS do celular dele.
   Aqui ela é CALCULADA a partir do relógio, o que tem uma vantagem: todas as
   abas abertas calculam exatamente a mesma posição, sem precisar trocar dados.

   Regras de movimento:
     • motorista livre ........ circula pelos pontos da sua "rotaLivre";
     • corrida aceita ......... vai de onde estava até a ORIGEM do cliente;
     • corrida em andamento ... vai da ORIGEM até o DESTINO;
     • depois de terminar ..... volta do destino para a sua rota de circulação;
     • offline ................ fica parado.

   "Motor" automático (só para os motoristas de teste que NINGUÉM está
   controlando pela tela do motorista):
     • aceita sozinho corridas que ficaram muito tempo sem resposta;
     • inicia a corrida ao chegar na origem e conclui ao chegar no destino;
     • responde mensagens do chat com frases prontas.
   Para não fazer tudo em dobro quando há várias abas abertas, só UMA aba
   (a "líder") executa o motor.
   ============================================================================= */

App.simulacao = (function () {
  var u = App.utils;
  var ID_ABA = u.novoId("aba");
  var timerMotor = null;

  /* Quantos milissegundos o motorista leva para andar "km" na simulação. */
  function duracaoMs(km) {
    return km / App.config.VELOCIDADE_SIMULADA_KMH * 3600000;
  }

  /* Posição ao longo de uma rota fechada (volta ao primeiro ponto no fim). */
  function posicaoNaRotaLivre(rota, agora) {
    if (!rota || rota.length === 0) return { lat: App.config.MAPA_CENTRO[0], lng: App.config.MAPA_CENTRO[1] };
    if (rota.length === 1) return rota[0];
    var trechos = rota.map(function (p, i) {
      var prox = rota[(i + 1) % rota.length];
      return { de: p, ate: prox, km: u.distanciaKm(p, prox) };
    });
    var total = trechos.reduce(function (s, t) { return s + t.km; }, 0);
    /* Velocidade de circulação = metade da velocidade de corrida. */
    var kmPercorridos = (agora / 3600000) * (App.config.VELOCIDADE_SIMULADA_KMH / 2);
    var resto = kmPercorridos % total;
    for (var i = 0; i < trechos.length; i++) {
      if (resto <= trechos[i].km) return u.interpolar(trechos[i].de, trechos[i].ate, resto / trechos[i].km);
      resto -= trechos[i].km;
    }
    return rota[0];
  }

  /* Trecho atual de uma corrida ativa: de onde para onde e desde quando. */
  function trechoDaCorrida(motorista, corrida) {
    if (corrida.status === "aceita") {
      var partida = corrida.partidaMotorista || motorista.rotaLivre[0];
      return { de: partida, ate: corrida.origem, inicio: corrida.aceitaEm };
    }
    if (corrida.status === "em_andamento") {
      return { de: corrida.origem, ate: corrida.destino, inicio: corrida.iniciadaEm };
    }
    return null;
  }

  /* Progresso de 0 a 1 do trecho atual da corrida (1 = chegou). */
  function progressoCorrida(corrida, agora) {
    var motorista = App.banco.buscarMotorista(corrida.motoristaId);
    if (!motorista) return 0;
    var trecho = trechoDaCorrida(motorista, corrida);
    if (!trecho) return corrida.status === "concluida" ? 1 : 0;
    var dur = duracaoMs(u.distanciaKm(trecho.de, trecho.ate));
    return dur <= 0 ? 1 : Math.min(1, ((agora || Date.now()) - trecho.inicio) / dur);
  }

  /* Tempo estimado (em segundos de simulação) para terminar o trecho atual. */
  function segundosRestantes(corrida, agora) {
    var motorista = App.banco.buscarMotorista(corrida.motoristaId);
    var trecho = motorista && trechoDaCorrida(motorista, corrida);
    if (!trecho) return 0;
    var dur = duracaoMs(u.distanciaKm(trecho.de, trecho.ate));
    return Math.max(0, Math.round((trecho.inicio + dur - (agora || Date.now())) / 1000));
  }

  /* ------------------------------------------------------------------------
     posicaoMotorista(motorista, agora) -> { lat, lng }
     É a função "GPS": diz onde o motorista está neste instante.
     ------------------------------------------------------------------------ */
  function posicaoMotorista(motorista, agora) {
    agora = agora || Date.now();
    if (!motorista) return null;

    /* 1) Em corrida: anda pelo trecho atual. */
    var corrida = App.banco.corridaAtivaDoMotorista(motorista.id);
    if (corrida) {
      var trecho = trechoDaCorrida(motorista, corrida);
      var dur = duracaoMs(u.distanciaKm(trecho.de, trecho.ate));
      return u.interpolar(trecho.de, trecho.ate, dur <= 0 ? 1 : (agora - trecho.inicio) / dur);
    }

    /* 2) Offline: parado no primeiro ponto da rota. */
    if (motorista.status === "offline") return motorista.rotaLivre[0];

    /* 3) Acabou de terminar uma corrida: volta do destino para a rota. */
    if (motorista.ultimaLiberacao) {
      var ultima = ultimaCorridaEncerrada(motorista.id);
      if (ultima) {
        var deOnde = ultima.status === "concluida" ? ultima.destino : ultima.origem;
        var paraOnde = posicaoNaRotaLivre(motorista.rotaLivre, motorista.ultimaLiberacao);
        var durVolta = duracaoMs(u.distanciaKm(deOnde, paraOnde));
        var t = (agora - motorista.ultimaLiberacao) / durVolta;
        if (t < 1) return u.interpolar(deOnde, posicaoNaRotaLivre(motorista.rotaLivre, agora), t);
      }
    }

    /* 4) Livre: circulando. */
    return posicaoNaRotaLivre(motorista.rotaLivre, agora);
  }

  function ultimaCorridaEncerrada(motoristaId) {
    return App.banco.listarCorridas()
      .filter(function (c) { return c.motoristaId === motoristaId && (c.concluidaEm || c.canceladaEm); })
      .sort(function (a, b) { return (b.concluidaEm || b.canceladaEm) - (a.concluidaEm || a.canceladaEm); })[0] || null;
  }

  /* Motorista disponível mais perto de um ponto (que faça o serviço pedido). */
  function motoristaMaisProximo(ponto, servico, somenteAutomaticos) {
    var agora = Date.now();
    var candidatos = App.banco.listarMotoristas().filter(function (m) {
      if (m.status !== "disponivel") return false;
      if (m.servicos.indexOf(servico) === -1) return false;
      if (somenteAutomaticos && App.banco.estaSobControleManual(m.id)) return false;
      return true;
    });
    candidatos.sort(function (a, b) {
      return u.distanciaKm(posicaoMotorista(a, agora), ponto) - u.distanciaKm(posicaoMotorista(b, agora), ponto);
    });
    return candidatos[0] || null;
  }

  /* ------------------------------------------------------------------------
     MOTOR AUTOMÁTICO
     ------------------------------------------------------------------------ */

  /* Liga/desliga o motor (preferência guardada no navegador). */
  function automaticoLigado() {
    return localStorage.getItem(App.config.PREFIXO_ARMAZENAMENTO + "simAuto") !== "nao";
  }
  function definirAutomatico(ligado) {
    localStorage.setItem(App.config.PREFIXO_ARMAZENAMENTO + "simAuto", ligado ? "sim" : "nao");
  }

  /* Esta aba é a líder? (a líder renova a "posse" a cada segundo) */
  function souLider() {
    var chave = App.config.PREFIXO_ARMAZENAMENTO + "simLider";
    var atual = null;
    try { atual = JSON.parse(localStorage.getItem(chave)); } catch (e) {}
    var agora = Date.now();
    if (!atual || atual.aba === ID_ABA || agora - atual.ts > 4000) {
      localStorage.setItem(chave, JSON.stringify({ aba: ID_ABA, ts: agora }));
      return true;
    }
    return false;
  }

  /* Frases prontas que os motoristas de teste usam no chat. */
  var RESPOSTAS = [
    "Olá! Já estou a caminho. 👍",
    "Combinado, chego em alguns minutos.",
    "Pode deixar, estou acompanhando pelo app.",
    "Certo! Qualquer coisa me chama aqui.",
    "Entendido, obrigado pelo aviso!"
  ];

  /* Um "passo" do motor: roda a cada segundo, só na aba líder. */
  function passoMotor() {
    if (!automaticoLigado() || !souLider()) return;
    var agora = Date.now();
    var banco = App.banco;

    banco.listarCorridas().forEach(function (c) {
      /* a) Corrida esperando há muito tempo: o robô mais próximo aceita. */
      if (c.status === "aguardando" && agora - c.criadaEm > App.config.AUTO_ACEITE_SEGUNDOS * 1000) {
        var m = motoristaMaisProximo(c.origem, c.servico, true);
        if (m) banco.aceitarCorrida(c.id, m.id, "simulacao");
        return;
      }
      if (!c.motoristaId || banco.estaSobControleManual(c.motoristaId)) return;

      /* b) Robô chegou na origem: inicia. c) Chegou no destino: conclui. */
      if (c.status === "aceita" && progressoCorrida(c, agora) >= 1) banco.iniciarCorrida(c.id);
      else if (c.status === "em_andamento" && progressoCorrida(c, agora) >= 1) banco.concluirCorrida(c.id);

      /* d) Robô responde mensagens do cliente/gestor depois de 3 segundos. */
      if (c.status === "aceita" || c.status === "em_andamento") responderChat(c, agora);
    });
  }

  function responderChat(corrida, agora) {
    var msgs = App.banco.listarMensagens(corrida.id);
    var ultima = msgs[msgs.length - 1];
    if (!ultima || ultima.autorTipo === "sistema" || ultima.autorTipo === "motorista") return;
    if (agora - ultima.em < 3000) return;
    var motorista = App.banco.buscarMotorista(corrida.motoristaId);
    var frase = RESPOSTAS[msgs.length % RESPOSTAS.length];
    App.banco.enviarMensagem(corrida.id, { tipo: "motorista", id: motorista.id, nome: motorista.nome }, frase);
  }

  function iniciarMotor() {
    if (timerMotor) return;
    timerMotor = setInterval(passoMotor, 1000);
  }

  return {
    posicaoMotorista: posicaoMotorista,
    progressoCorrida: progressoCorrida,
    segundosRestantes: segundosRestantes,
    motoristaMaisProximo: motoristaMaisProximo,
    automaticoLigado: automaticoLigado,
    definirAutomatico: definirAutomatico,
    iniciarMotor: iniciarMotor
  };
})();
