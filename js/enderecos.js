/* =============================================================================
   enderecos.js — SUGESTÃO DE ENDEREÇO ENQUANTO O CLIENTE DIGITA
   -----------------------------------------------------------------------------
   Usa a Places API (nova) do Google, com a mesma chave do mapa (js/config-mapa.js).
   Como funciona:
     • só começa a buscar depois de 4 letras e espera o cliente parar de digitar (0,45 s);
     • mostra até 5 sugestões (rua e número em destaque, bairro e cidade embaixo);
     • tocar numa sugestão preenche o campo; o cliente também pode digitar tudo à mão;
     • cada busca conta no monitor de uso do dono (tipo "places", banco/29);
     • se o Google recusar (API desligada, cota, chave), as sugestões se desligam sozinhas e o campo
       continua funcionando como um campo de texto comum.
   Uso:  App.enderecos.ativar(campoInput, { aoEscolher: function () { ... } });
   ============================================================================= */
(function () {
  var MIN_LETRAS = 4, ESPERA_MS = 450, MAX_SUGESTOES = 5;
  var desligado = false;   // vira true se o Google recusar o pedido

  function chave() { return App.mapaConfig && App.mapaConfig.googleChave; }
  function novoToken() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  }
  /* Tira o ", Brasil" do fim, que só ocupa espaço. */
  function limpar(texto) { return String(texto || "").replace(/,\s*Brasil\s*$/i, ""); }

  function ativar(campo, opcoes) {
    opcoes = opcoes || {};
    if (!chave() || !campo) return;
    var linha = campo.closest(".linha-rota") || campo.parentNode;
    var caixa = linha.parentNode;
    var lista = document.createElement("ul");
    lista.className = "sugestoes"; lista.setAttribute("role", "listbox"); lista.hidden = true;
    caixa.appendChild(lista);
    campo.setAttribute("role", "combobox"); campo.setAttribute("aria-autocomplete", "list"); campo.setAttribute("aria-expanded", "false");

    var token = novoToken(), timer = null, controle = null, itens = [], ativo = -1, ultima = "", suprimir = false;
    var cache = {};   // texto digitado -> sugestões (evita repetir a mesma busca na mesma sessão)

    function fechar() { lista.hidden = true; ativo = -1; campo.setAttribute("aria-expanded", "false"); }
    function marcar(i) {
      ativo = i;
      [].forEach.call(lista.querySelectorAll("li[data-i]"), function (li) { li.classList.toggle("ativo", Number(li.getAttribute("data-i")) === i); });
    }
    function mostrar() {
      if (!itens.length) { fechar(); return; }
      lista.innerHTML = itens.map(function (s, i) {
        return '<li role="option" data-i="' + i + '"><span class="sugestao-icone">' + App.icone("map-pin") + "</span>" +
               '<span class="sugestao-texto"><strong>' + App.utils.escaparHtml(s.principal) + "</strong>" +
               (s.secundario ? "<small>" + App.utils.escaparHtml(s.secundario) + "</small>" : "") + "</span></li>";
      }).join("") + '<li class="sugestoes-rodape" aria-hidden="true">Google Maps</li>';   // exigência do Google: mostrar a origem
      lista.style.top = (linha.offsetTop + linha.offsetHeight) + "px";
      lista.hidden = false; campo.setAttribute("aria-expanded", "true"); ativo = -1;
    }
    function escolher(i) {
      var s = itens[i]; if (!s) return;
      suprimir = true;                       // o preenchimento não deve disparar outra busca
      campo.value = s.texto;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      suprimir = false;
      itens = []; fechar();
      token = novoToken();                   // a sessão de digitação terminou
      if (opcoes.aoEscolher) opcoes.aoEscolher(s);
    }

    function buscar(texto) {
      if (cache[texto]) { itens = cache[texto]; mostrar(); return; }
      if (controle) controle.abort();
      controle = window.AbortController ? new AbortController() : null;
      var corpo = { input: texto, sessionToken: token, includedRegionCodes: ["br"], languageCode: "pt-BR" };
      var centro = App.config && App.config.MAPA_CENTRO;   // dá preferência a endereços perto da região da empresa
      if (centro) corpo.locationBias = { circle: { center: { latitude: centro[0], longitude: centro[1] }, radius: 50000 } };
      if (App.auth && App.auth.registrarUso) App.auth.registrarUso("places");   // monitor de uso do dono
      fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST", signal: controle ? controle.signal : undefined,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave() }, body: JSON.stringify(corpo)
      }).then(function (r) {
        if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 429) { desligado = true; fechar(); return null; }
        return r.ok ? r.json() : null;
      }).then(function (j) {
        if (!j || texto !== campo.value.trim()) return;   // o cliente já digitou outra coisa
        itens = (j.suggestions || []).filter(function (s) { return s.placePrediction; }).slice(0, MAX_SUGESTOES).map(function (s) {
          var p = s.placePrediction, f = p.structuredFormat || {};
          return { texto: limpar(p.text && p.text.text), principal: (f.mainText && f.mainText.text) || limpar(p.text && p.text.text),
                   secundario: limpar(f.secondaryText && f.secondaryText.text), placeId: p.placeId };
        });
        cache[texto] = itens;
        mostrar();
      }).catch(function () { /* sem rede ou busca cancelada: segue sem sugestões */ });
    }

    campo.addEventListener("input", function () {
      if (suprimir || desligado) return;
      clearTimeout(timer);
      var t = campo.value.trim();
      if (t.length < MIN_LETRAS) { itens = []; fechar(); return; }
      if (t === ultima) return;
      timer = setTimeout(function () { ultima = t; buscar(t); }, ESPERA_MS);
    });
    campo.addEventListener("keydown", function (ev) {
      if (lista.hidden) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); marcar(Math.min(itens.length - 1, ativo + 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); marcar(Math.max(0, ativo - 1)); }
      else if (ev.key === "Enter" && ativo >= 0) { ev.preventDefault(); escolher(ativo); }
      else if (ev.key === "Escape") { fechar(); }
    });
    /* pointerdown (e não click): acontece antes de o campo perder o foco, então a escolha não se perde */
    lista.addEventListener("pointerdown", function (ev) {
      var li = ev.target.closest("li[data-i]");
      if (!li) return;
      ev.preventDefault();
      escolher(Number(li.getAttribute("data-i")));
    });
    campo.addEventListener("blur", function () { setTimeout(fechar, 150); });
    campo.addEventListener("focus", function () { if (itens.length && campo.value.trim() === ultima) mostrar(); });
  }

  App.enderecos = { ativar: ativar };
})();
