/* =============================================================================
   rastreio.js — POSIÇÃO DOS MOTORISTAS EM TEMPO REAL (Supabase Realtime)
   -----------------------------------------------------------------------------
   Tabela "posicoes" (uma linha por motorista, atualizada a cada envio).

     App.rastreio.assinar(aoMudar)   -> gestor: recebe {motorista_id, lat, lng, ...}
                                         de cada motorista da empresa, ao vivo
     App.rastreio.carregarTodas()    -> Promise com as últimas posições conhecidas
     App.rastreio.iniciarEnvio(motoristaId, empresaId, corridaId, opcoes)
                                     -> motorista: manda o GPS do aparelho (e mantém a
                                         tela acesa); devolve uma função para parar.
                                         opcoes = { aoPosicao(p), aoErro(msg) }
     App.rastreio.removerPosicao(id) -> motorista: apaga a posição (ficou offline)
     App.rastreio.definirStatus(id, status)
                                     -> motorista: avisa o banco (disponivel/em_corrida/offline)
     App.posicaoReal[id]             -> última posição GPS real {lat,lng} neste aparelho;
                                         simulacao.posicaoMotorista usa quando existe

   Quem envia precisa estar logado como motorista (papel "motorista" e linha em
   "motoristas" com user_id) — a segurança do banco só deixa gravar a própria.
   ============================================================================= */

App.rastreio = (function () {
  App.posicaoReal = App.posicaoReal || {};

  /* Gestor: avisa a cada posição nova. Quando o motorista fica offline e a
     posição é apagada, avisa com { motorista_id, removida: true }. */
  function assinar(aoMudar) {
    var sb = App.auth.conexao();
    return sb.channel("posicoes-empresa")
      .on("postgres_changes", { event: "*", schema: "public", table: "posicoes" },
          function (msg) {
            if (msg.eventType === "DELETE") {
              if (msg.old && msg.old.motorista_id) aoMudar({ motorista_id: msg.old.motorista_id, removida: true });
            } else if (msg.new && msg.new.motorista_id) aoMudar(msg.new);
          })
      .subscribe();
  }

  function carregarTodas() {
    return App.auth.conexao().from("posicoes").select("*").then(function (r) { return r.data || []; });
  }

  /* No máximo um envio a cada 3 segundos, para poupar bateria e o banco.
     Enquanto envia, pede ao aparelho para não apagar a tela: no navegador o GPS
     para quando a tela bloqueia (em segundo plano só com o app nativo). */
  function iniciarEnvio(motoristaId, empresaId, corridaId, opcoes) {
    opcoes = opcoes || {};
    if (!navigator.geolocation) {
      if (opcoes.aoErro) opcoes.aoErro("Este aparelho não tem GPS no navegador.");
      return function () {};
    }
    var sb = App.auth.conexao();
    var ultimo = 0;
    var bloqueioTela = null;

    function manterTelaAcesa() {
      if (!navigator.wakeLock) return;
      navigator.wakeLock.request("screen").then(function (b) { bloqueioTela = b; }, function () {});
    }
    function aoVoltarParaATela() { if (document.visibilityState === "visible") manterTelaAcesa(); }
    manterTelaAcesa();
    document.addEventListener("visibilitychange", aoVoltarParaATela);

    var id = navigator.geolocation.watchPosition(function (p) {
      App.posicaoReal[motoristaId] = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (opcoes.aoPosicao) opcoes.aoPosicao(p);
      var agora = Date.now();
      if (agora - ultimo < 3000) return;
      ultimo = agora;
      sb.from("posicoes").upsert({
        motorista_id: motoristaId,
        empresa_id: empresaId,
        corrida_id: corridaId || null,
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        rumo: p.coords.heading,
        velocidade: p.coords.speed == null ? null : p.coords.speed * 3.6,
        atualizada_em: new Date().toISOString()
      }).then(function () {});
    }, function (erro) {
      if (!opcoes.aoErro) return;
      opcoes.aoErro(erro.code === 1 ? "Permissão de localização negada. Libere o GPS nas configurações do navegador."
                                    : "Não foi possível obter a localização (GPS desligado ou sem sinal).");
    }, { enableHighAccuracy: true, maximumAge: 2000 });

    return function () {
      navigator.geolocation.clearWatch(id);
      document.removeEventListener("visibilitychange", aoVoltarParaATela);
      if (bloqueioTela) { bloqueioTela.release().catch(function () {}); bloqueioTela = null; }
      delete App.posicaoReal[motoristaId];
    };
  }

  /* Motorista offline: some do mapa do gestor. */
  function removerPosicao(motoristaId) {
    return App.auth.conexao().from("posicoes").delete().eq("motorista_id", motoristaId).then(function () {});
  }

  /* Motorista: grava a própria situação (o gestor vê a cor certa no mapa). */
  function definirStatus(motoristaId, status) {
    return App.auth.conexao().from("motoristas").update({ status: status }).eq("id", motoristaId).then(function () {});
  }

  return { assinar: assinar, carregarTodas: carregarTodas, iniciarEnvio: iniciarEnvio,
           removerPosicao: removerPosicao, definirStatus: definirStatus };
})();
