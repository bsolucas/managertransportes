/* =============================================================================
   notificacoes.js — AVISOS EM TEMPO REAL + SININHO (Supabase Realtime)
   -----------------------------------------------------------------------------
   PENDENTES: corrida que ainda espera motorista continua aparecendo no sininho (seção "Pendentes",
   em amarelo) mesmo depois de a notificação ser lida, e só some quando a corrida é atribuída,
   cancelada ou concluída. Para o gestor: corridas sem motorista; para o motorista disponível:
   corridas que ele pode aceitar; para o cliente: os pedidos dele ainda sem motorista.

   O banco cria uma linha em "notificacoes" para quem deve ser avisado (veja
   banco/03, 18): corrida nova, motorista designado, aceita, iniciada, concluída,
   cancelada, "sem motorista livre" e mensagem nova no chat. Este arquivo mostra:
     • o aviso no canto da tela e um "bip" curto;
     • o SININHO no topo, com a lista das últimas notificações e o contador de não lidas;
     • a notificação do celular/computador (Notification API, via service worker no Android),
       mesmo com o app em segundo plano; e o número no ícone do app, quando o aparelho deixa.

     App.notificacoes.iniciar(aoAbrir)  -> começa (chamar depois do login). "aoAbrir(n)" é
                                           chamado quando a pessoa clica numa notificação
                                           (n.corrida_id, n.tipo...) para a tela navegar.

   Notificação com o app FECHADO por completo (push) precisa do Firebase (FCM): o token do
   aparelho iria para a tabela "dispositivos" — veja banco/DECISOES.md.
   ============================================================================= */

App.notificacoes = (function () {
  var canal = null;
  var lista = [];            // mais nova primeiro
  var aoAbrir = null;
  var elSino = null, elContador = null, elPainel = null, elLista = null, elAtivar = null;
  var MAXIMO = 30;

  var ICONES = { nova_corrida: "clipboard-list", corrida_designada: "car-front", corrida_aceita: "check",
                 corrida_iniciada: "navigation", corrida_concluida: "check-check", corrida_cancelada: "triangle-alert",
                 sem_motorista: "triangle-alert", mensagem: "message-circle" };

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

  function tipoDoAviso(n) {
    if (n.tipo === "corrida_cancelada" || n.tipo === "sem_motorista") return "erro";
    if (n.tipo === "nova_corrida" || n.tipo === "corrida_designada" || n.tipo === "mensagem") return "info";
    return "sucesso";
  }

  /* Notificação do sistema (aparece com o app em segundo plano). No Android o Chrome só aceita
     pelo service worker; no computador vale o "new Notification". */
  function notificarSistema(n) {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    var opcoes = { body: n.corpo || "", tag: n.id, icon: "../icones/icone-192.png", badge: "../icones/icone-192.png", data: { corrida: n.corrida_id }, vibrate: [120, 60, 120] };
    var direto = function () { try { new Notification(n.titulo, opcoes); } catch (e) { /* sem suporte */ } };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(n.titulo, opcoes); }).catch(direto);
    } else direto();
  }

  /* ---------------------------- pendentes ---------------------------- */
  /* Corridas que ainda esperam motorista, do ponto de vista de quem está olhando. */
  function pendentes() {
    var nu = App.nuvem;
    if (!nu || !nu.corridas) return [];
    var eu = App.sessao.atual() || {};
    var lista = nu.corridas().filter(function (c) { return c.status === "aguardando"; });
    if (eu.tipo === "motorista") {
      var m = nu.meuMotorista && nu.meuMotorista();
      if (!m || m.status !== "disponivel") return [];
      lista = lista.filter(function (c) { return m.servicos.indexOf(c.servico) !== -1; });
    } else if (eu.tipo === "cliente") {
      lista = lista.filter(function (c) { return c.clienteId === eu.id; });
    }
    return lista.sort(function (a, b) { return a.criadaEm - b.criadaEm; });   // a mais antiga primeiro
  }

  function textoPendente(c) {
    var tipo = (App.sessao.atual() || {}).tipo;
    return tipo === "motorista" ? "Corrida " + c.codigo + " aguardando você aceitar"
         : tipo === "cliente" ? "Corrida " + c.codigo + ": procurando motorista"
         : "Corrida " + c.codigo + " aguardando motorista";
  }

  /* As notificações de "corrida nova / sem motorista" de uma corrida que ainda está pendente já
     aparecem na seção Pendentes: não repetem na lista nem contam em dobro. */
  function ehDePendente(n, ids) {
    return (n.tipo === "nova_corrida" || n.tipo === "sem_motorista") && ids.indexOf(n.corrida_id) !== -1;
  }

  /* ---------------------------- sininho ---------------------------- */
  function naoLidas(idsPendentes) { return lista.filter(function (n) { return !n.lida && !ehDePendente(n, idsPendentes || []); }).length; }

  function desenharSino() {
    if (!elSino) return;
    var pend = pendentes();
    var idsPend = pend.map(function (c) { return c.id; });
    var total = pend.length + naoLidas(idsPend);
    elContador.hidden = !total;
    elContador.textContent = total > 99 ? "99+" : total;
    elContador.classList.toggle("pendente", pend.length > 0);
    elSino.classList.toggle("sino-pendente", pend.length > 0);
    elSino.setAttribute("aria-label", total ? total + " notificações, " + pend.length + " pendentes" : "Notificações");
    try { if (navigator.setAppBadge) { total ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } } catch (e) { /* sem suporte */ }

    elAtivar.hidden = !("Notification" in window) || Notification.permission !== "default";
    var secaoPendentes = pend.length
      ? '<div class="notificacao-secao notificacao-secao-pendente">Pendentes (' + pend.length + ")</div>" + pend.map(function (c) {
          return '<button type="button" class="notificacao-item pendente" data-pendente="' + c.id + '">' +
            '<span class="notificacao-icone">' + App.icone("clipboard-list") + "</span>" +
            '<span class="notificacao-texto"><strong>' + App.utils.escaparHtml(textoPendente(c)) + "</strong>" +
              "<span>" + App.utils.escaparHtml(c.trajeto + (c.clienteNome && (App.sessao.atual() || {}).tipo !== "cliente" ? " • " + c.clienteNome : "")) + "</span>" +
              "<small>pedida " + App.utils.tempoRelativo(c.criadaEm) + "</small></span></button>";
        }).join("")
      : "";
    var recentes = lista.filter(function (n) { return !ehDePendente(n, idsPend); });
    elLista.innerHTML = secaoPendentes + (pend.length && recentes.length ? '<div class="notificacao-secao">Recentes</div>' : "") + (recentes.length || pend.length ? recentes.map(function (n) {
      return '<button type="button" class="notificacao-item' + (n.lida ? "" : " nova") + '" data-notificacao="' + n.id + '">' +
        '<span class="notificacao-icone">' + App.icone(ICONES[n.tipo] || "bell") + "</span>" +
        '<span class="notificacao-texto"><strong>' + App.utils.escaparHtml(n.titulo) + "</strong>" +
          (n.corpo ? "<span>" + App.utils.escaparHtml(n.corpo) + "</span>" : "") +
          "<small>" + App.utils.tempoRelativo(new Date(n.criada_em).getTime()) + "</small></span></button>";
    }).join("") : '<p class="notificacao-vazia">Nenhuma notificação ainda.</p>');
  }

  function marcarLidas(ids) {
    if (!ids.length) return;
    lista.forEach(function (n) { if (ids.indexOf(n.id) !== -1) n.lida = true; });
    desenharSino();
    App.auth.conexao().from("notificacoes").update({ lida: true }).in("id", ids).then(function () {});
  }

  function montarSino() {
    var ondeFica = document.querySelector(".topo-usuario");
    if (!ondeFica || document.getElementById("sino-notificacoes")) return;
    var caixa = document.createElement("div");
    caixa.className = "sino-caixa";
    caixa.innerHTML =
      '<button type="button" class="botao-icone sino" id="sino-notificacoes" aria-haspopup="true" aria-expanded="false" aria-label="Notificações">' +
        App.icone("bell") + '<span class="sino-contador" hidden>0</span></button>' +
      '<div class="painel-notificacoes" hidden role="dialog" aria-label="Notificações">' +
        '<div class="painel-notificacoes-topo"><strong>Notificações</strong>' +
          '<button type="button" class="botao botao-secundario botao-pequeno" data-ler-todas>' + App.icone("check-check") + " Marcar como lidas</button></div>" +
        '<button type="button" class="botao botao-primario botao-pequeno painel-notificacoes-ativar" data-ativar-avisos hidden>' +
          App.icone("bell") + " Ativar avisos neste aparelho</button>" +
        '<div class="painel-notificacoes-lista"></div></div>';
    ondeFica.parentNode.insertBefore(caixa, ondeFica);
    elSino = caixa.querySelector("#sino-notificacoes");
    elContador = caixa.querySelector(".sino-contador");
    elPainel = caixa.querySelector(".painel-notificacoes");
    elLista = caixa.querySelector(".painel-notificacoes-lista");
    elAtivar = caixa.querySelector("[data-ativar-avisos]");

    function alternar(abrir) {
      elPainel.hidden = !abrir;
      elSino.setAttribute("aria-expanded", abrir ? "true" : "false");
    }
    elSino.addEventListener("click", function (ev) { ev.stopPropagation(); alternar(elPainel.hidden); });
    document.addEventListener("click", function (ev) { if (!caixa.contains(ev.target)) alternar(false); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") alternar(false); });

    caixa.querySelector("[data-ler-todas]").addEventListener("click", function () {
      marcarLidas(lista.filter(function (n) { return !n.lida; }).map(function (n) { return n.id; }));
    });
    elAtivar.addEventListener("click", function () {
      try { Notification.requestPermission().then(desenharSino); } catch (e) { /* ignora */ }
    });
    elLista.addEventListener("click", function (ev) {
      var pendente = ev.target.closest("[data-pendente]");
      if (pendente) {
        alternar(false);
        if (aoAbrir) aoAbrir({ tipo: "pendente", corrida_id: pendente.getAttribute("data-pendente") });
        return;
      }
      var item = ev.target.closest("[data-notificacao]");
      if (!item) return;
      var n = lista.filter(function (x) { return x.id === item.getAttribute("data-notificacao"); })[0];
      if (!n) return;
      marcarLidas([n.id]);
      alternar(false);
      if (aoAbrir) aoAbrir(n);
    });
  }

  function chegou(n) {
    if (lista.some(function (x) { return x.id === n.id; })) return;
    lista.unshift(n);
    lista = lista.slice(0, MAXIMO);
    desenharSino();
    App.ui.aviso(n.titulo + (n.corpo ? " — " + n.corpo : ""), tipoDoAviso(n));
    bip();
    notificarSistema(n);
  }

  function iniciar(quandoAbrir) {
    aoAbrir = quandoAbrir || null;
    montarSino();
    /* A seção Pendentes acompanha as corridas ao vivo (e o tempo relativo é atualizado a cada minuto). */
    if (App.nuvem && App.nuvem.aoMudar) App.nuvem.aoMudar(function (chave) { if (chave === "corridas" || chave === "motoristas") desenharSino(); });
    setInterval(desenharSino, 60000);
    var sb = App.auth.conexao();
    sb.auth.getUser().then(function (r) {
      if (!r.data || !r.data.user || canal) return;
      var uid = r.data.user.id;
      /* Últimas notificações (inclui as que chegaram com o app fechado). */
      sb.from("notificacoes").select("*").order("criada_em", { ascending: false }).limit(MAXIMO).then(function (resp) {
        if (resp.data) { lista = resp.data; desenharSino(); }
      });
      canal = sb.channel("notificacoes-" + uid)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: "user_id=eq." + uid },
            function (msg) { chegou(msg.new); })
        .subscribe();
    });
    /* O navegador só deixa pedir permissão depois de um clique do usuário. */
    if ("Notification" in window && Notification.permission === "default") {
      document.addEventListener("click", function pedir(ev) {
        if (ev.target.closest && ev.target.closest(".sino-caixa")) return;   // o botão do sino tem o próprio pedido
        document.removeEventListener("click", pedir);
        try { Notification.requestPermission().then(desenharSino); } catch (e) { /* ignora */ }
      });
    }
  }

  return { iniciar: iniciar };
})();
