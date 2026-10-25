/* =============================================================================
   notificacoes.js — AVISOS DE CORRIDA EM TEMPO REAL (Supabase Realtime)
   -----------------------------------------------------------------------------
   O banco cria uma linha em "notificacoes" quando uma corrida nasce, é aceita,
   concluída ou cancelada (veja banco/03-*.sql). Este arquivo escuta essas linhas
   para o usuário logado e mostra:
     • o aviso no canto da tela (App.ui.aviso)
     • um "bip" curto
     • a notificação do navegador/celular (se o usuário permitiu)

     App.notificacoes.iniciar()   -> começa a escutar (chamar depois do login)

   Notificação com o app FECHADO (push do Android) precisa do Firebase (FCM):
   o token do aparelho vai para a tabela "dispositivos" — veja banco/DECISOES.md.
   ============================================================================= */

App.notificacoes = (function () {
  var canal = null;

  /* Bip curto, gerado pelo navegador (sem arquivo de som). */
  function bip() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var ganho = ctx.createGain();
      osc.frequency.value = 880;
      ganho.gain.value = 0.08;
      osc.connect(ganho); ganho.connect(ctx.destination);
      osc.start();
      setTimeout(function () { osc.stop(); ctx.close(); }, 250);
    } catch (e) { /* sem áudio: tudo bem */ }
  }

  function mostrar(n) {
    var tipo = n.tipo === "corrida_cancelada" ? "erro" : (n.tipo === "nova_corrida" ? "info" : "sucesso");
    App.ui.aviso(n.titulo + (n.corpo ? " — " + n.corpo : ""), tipo);
    bip();
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification(n.titulo, { body: n.corpo || "" }); } catch (e) { /* alguns celulares exigem service worker */ }
    }
  }

  /* O navegador só deixa pedir permissão depois de um clique do usuário. */
  function pedirPermissaoNoPrimeiroClique() {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    document.addEventListener("click", function pedir() {
      document.removeEventListener("click", pedir);
      try { Notification.requestPermission(); } catch (e) { /* ignora */ }
    });
  }

  function iniciar() {
    pedirPermissaoNoPrimeiroClique();
    var sb = App.auth.conexao();
    sb.auth.getUser().then(function (r) {
      if (!r.data || !r.data.user || canal) return;
      canal = sb.channel("notificacoes-" + r.data.user.id)
        .on("postgres_changes",
            { event: "INSERT", schema: "public", table: "notificacoes", filter: "user_id=eq." + r.data.user.id },
            function (msg) { mostrar(msg.new); })
        .subscribe();
    });
  }

  return { iniciar: iniciar };
})();
