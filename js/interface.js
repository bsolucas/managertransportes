/* =============================================================================
   interface.js — PEÇAS DE INTERFACE REUTILIZÁVEIS
   -----------------------------------------------------------------------------
   Coisas que todas as telas usam:
     • App.ui.aviso("texto", "sucesso")   -> notificação no canto da tela
     • App.ui.abrirModal(titulo, html)    -> janela por cima da página
     • App.ui.confirmar("Tem certeza?")   -> pergunta Sim/Não (Promise)
     • App.ui.seloStatus(status)          -> etiqueta colorida do status
     • App.ui.montarTopo()                -> nome do app, usuário e botão Sair
   O visual de tudo isso está em css/componentes.css.
   ============================================================================= */

App.ui = {

  /* Atalho para document.querySelector */
  $: function (seletor, raiz) { return (raiz || document).querySelector(seletor); },
  $$: function (seletor, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(seletor)); },

  /* ---------------------------------------------------------------------------
     Notificação temporária (some sozinha depois de alguns segundos).
     tipo: "info" | "sucesso" | "erro"
     --------------------------------------------------------------------------- */
  aviso: function (texto, tipo) {
    var area = document.getElementById("area-avisos");
    if (!area) {
      area = document.createElement("div");
      area.id = "area-avisos";
      area.className = "area-avisos";
      document.body.appendChild(area);
    }
    var el = document.createElement("div");
    el.className = "aviso aviso-" + (tipo || "info");
    el.textContent = texto;
    area.appendChild(el);
    setTimeout(function () { el.classList.add("aviso-saindo"); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
  },

  /* ---------------------------------------------------------------------------
     Janela modal. Devolve o elemento do conteúdo para a tela preencher eventos.
     --------------------------------------------------------------------------- */
  abrirModal: function (titulo, html, opcoes) {
    App.ui.fecharModal();
    var fundo = document.createElement("div");
    fundo.className = "modal-fundo";
    fundo.id = "modal-aberto";
    fundo.innerHTML =
      '<div class="modal ' + ((opcoes && opcoes.classe) || "") + '" role="dialog" aria-modal="true">' +
        '<div class="modal-cabecalho">' +
          "<h2>" + App.utils.escaparHtml(titulo) + "</h2>" +
          '<button class="botao-icone" data-fechar-modal aria-label="Fechar">' + App.icone("x") + '</button>' +
        "</div>" +
        '<div class="modal-corpo">' + html + "</div>" +
      "</div>";
    document.body.appendChild(fundo);
    /* Fecha clicando no X ou fora da janela. */
    fundo.addEventListener("click", function (ev) {
      if (ev.target === fundo || ev.target.hasAttribute("data-fechar-modal")) App.ui.fecharModal();
    });
    return fundo.querySelector(".modal-corpo");
  },

  fecharModal: function () {
    var m = document.getElementById("modal-aberto");
    if (m) m.remove();
  },

  /* Pergunta de confirmação. Uso: App.ui.confirmar("...").then(function(sim){...}) */
  confirmar: function (pergunta) {
    return new Promise(function (resolver) {
      var corpo = App.ui.abrirModal("Confirmar",
        '<p class="texto-modal">' + App.utils.escaparHtml(pergunta) + "</p>" +
        '<div class="acoes-modal">' +
          '<button class="botao botao-secundario" data-resposta="nao">Não</button>' +
          '<button class="botao botao-primario" data-resposta="sim">Sim</button>' +
        "</div>", { classe: "modal-pequeno" });
      corpo.addEventListener("click", function (ev) {
        var r = ev.target.getAttribute("data-resposta");
        if (!r) return;
        App.ui.fecharModal();
        resolver(r === "sim");
      });
    });
  },

  /* Etiqueta colorida com o status da corrida. */
  seloStatus: function (status) {
    var s = App.STATUS_CORRIDA[status] || { rotulo: status, classe: "" };
    return '<span class="selo ' + s.classe + '">' + s.rotulo + "</span>";
  },

  /* Etiqueta colorida com o status do motorista. */
  seloMotorista: function (status) {
    var s = App.STATUS_MOTORISTA[status] || { rotulo: status, classe: "" };
    return '<span class="selo ' + s.classe + '">' + s.rotulo + "</span>";
  },

  /* Avatar redondo com as iniciais. */
  avatar: function (nome, classeExtra) {
    return '<span class="avatar ' + (classeExtra || "") + '">' + App.utils.iniciais(nome) + "</span>";
  },

  /* ---------------------------------------------------------------------------
     Topo da página: preenche o nome do app e o usuário, e liga o botão Sair.
     Espera encontrar no HTML: #nome-app, #usuario-nome, #botao-sair
     --------------------------------------------------------------------------- */
  montarTopo: function () {
    var u = App.sessao.atual();
    var nomeApp = document.getElementById("nome-app");
    if (nomeApp) nomeApp.textContent = App.config.NOME_APP;
    var nome = document.getElementById("usuario-nome");
    if (nome && u) nome.textContent = u.nome;
    var sair = document.getElementById("botao-sair");
    if (sair) sair.addEventListener("click", App.sessao.sair);
    document.title = (document.title ? document.title + " • " : "") + App.config.NOME_APP;
  },

  /* Liga as abas de navegação. Botões com data-aba="x" mostram <section data-painel="x">. */
  ligarAbas: function (aoTrocar) {
    App.ui.$$("[data-aba]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var alvo = botao.getAttribute("data-aba");
        App.ui.$$("[data-aba]").forEach(function (b) { b.classList.toggle("ativo", b === botao); });
        App.ui.$$("[data-painel]").forEach(function (p) {
          p.hidden = p.getAttribute("data-painel") !== alvo;
        });
        App.ui.mostrarAbaNoMenu(botao);
        if (aoTrocar) aoTrocar(alvo);
      });
    });
  },

  /* No celular o menu é uma faixa que rola para o lado: traz o item ativo para o meio da faixa
     e, se a página estava rolada para baixo, volta ao topo da nova seção. */
  mostrarAbaNoMenu: function (botao) {
    var faixa = botao.parentNode;
    if (faixa && faixa.scrollWidth > faixa.clientWidth + 1) {
      var alvo = botao.offsetLeft - (faixa.clientWidth - botao.offsetWidth) / 2;
      if (faixa.scrollTo) faixa.scrollTo({ left: Math.max(0, alvo), behavior: "auto" }); else faixa.scrollLeft = alvo;
    }
    var topoDaPagina = window.scrollY || document.documentElement.scrollTop || 0;
    if (topoDaPagina > 120 && window.matchMedia("(max-width: 760px)").matches) window.scrollTo(0, 0);
  },

  /* Preenche um <select> com opções [{valor, texto}]. */
  preencherSelect: function (select, opcoes, valorAtual) {
    select.innerHTML = opcoes.map(function (o) {
      return '<option value="' + App.utils.escaparHtml(o.valor) + '"' +
             (o.valor === valorAtual ? " selected" : "") + ">" + App.utils.escaparHtml(o.texto) + "</option>";
    }).join("");
  }
};

/* Linhas e cartões clicáveis (role="button") também funcionam com Enter ou Espaço. */
document.addEventListener("keydown", function (ev) {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  var alvo = ev.target;
  if (!alvo || alvo.getAttribute("role") !== "button" || alvo.tagName === "BUTTON") return;
  ev.preventDefault();
  alvo.click();
});
