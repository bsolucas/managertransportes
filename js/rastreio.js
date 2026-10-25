/* =============================================================================
   rastreio.js — POSIÇÃO DOS MOTORISTAS EM TEMPO REAL (Supabase Realtime)
   -----------------------------------------------------------------------------
   Tabela "posicoes" (uma linha por motorista, atualizada a cada envio).

     App.rastreio.assinar(aoMudar)   -> gestor: recebe {motorista_id, lat, lng, ...}
                                         de cada motorista da empresa, ao vivo
     App.rastreio.carregarTodas()    -> Promise com as últimas posições conhecidas
     App.rastreio.iniciarEnvio(id)   -> motorista: manda o GPS do aparelho a cada
                                         mudança (devolve uma função para parar)

   Quem envia precisa estar logado como motorista (papel "motorista" e linha em
   "motoristas" com user_id) — a segurança do banco só deixa gravar a própria.
   ============================================================================= */

App.rastreio = (function () {
  function assinar(aoMudar) {
    var sb = App.auth.conexao();
    return sb.channel("posicoes-empresa")
      .on("postgres_changes", { event: "*", schema: "public", table: "posicoes" },
          function (msg) { if (msg.new && msg.new.motorista_id) aoMudar(msg.new); })
      .subscribe();
  }

  function carregarTodas() {
    return App.auth.conexao().from("posicoes").select("*").then(function (r) { return r.data || []; });
  }

  /* No máximo um envio a cada 3 segundos, para poupar bateria e o banco. */
  function iniciarEnvio(motoristaId, empresaId, corridaId) {
    if (!navigator.geolocation) return function () {};
    var sb = App.auth.conexao();
    var ultimo = 0;
    var id = navigator.geolocation.watchPosition(function (p) {
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
    }, function () {}, { enableHighAccuracy: true, maximumAge: 2000 });
    return function () { navigator.geolocation.clearWatch(id); };
  }

  return { assinar: assinar, carregarTodas: carregarTodas, iniciarEnvio: iniciarEnvio };
})();
