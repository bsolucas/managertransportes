/* =============================================================================
   paginas/gestor-modulos.js — MOSTRA SÓ O QUE A EMPRESA USA + CORRIDA PRÓPRIA
   -----------------------------------------------------------------------------
   1. Esconde do menu as partes que a empresa não usa (veja js/modulos.js). Quem
      trabalha sozinho não vê Motoristas nem Chat, por exemplo, e abre direto no Diário.
   2. Quem trabalha sozinho (modo individual) ganha o botão "+ Registrar corrida":
      lança a corrida que ele mesmo fez, já concluída, com o valor que recebeu
      (sem preço de tabela, cliente opcional).
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var nuvem = App.nuvem;
  var primeiraVez = true;
  var individual = false;

  /* ==========================================================================
     1. MENU
     ========================================================================== */
  function aplicar(empresa) {
    var m = App.modulos.da(empresa);
    individual = !!empresa && empresa.modo_uso === "individual";

    Object.keys(App.modulos.ABAS).forEach(function (modulo) {
      var aba = App.modulos.ABAS[modulo];
      var botao = ui.$('.menu-item[data-aba="' + aba + '"]');
      if (botao) botao.hidden = !m[modulo];
    });

    /* Atalhos do topo/visão geral que levam à planilha, se a aba estiver escondida. */
    ui.$$("[data-atalho-planilhas]").forEach(function (el) { el.hidden = !m.planilhas; });

    /* Corridas: quem trabalha sozinho registra a própria em vez de "pedir" a um motorista. */
    document.getElementById("nova-corrida").hidden = individual;
    document.getElementById("registrar-corrida").hidden = !individual;
    var texto = ui.$('[data-painel="corridas"] .cabecalho-secao p');
    if (individual) texto.textContent = "As corridas que você fez. Use \"+ Registrar corrida\" com o valor que recebeu.";

    /* Se a aba aberta ficou escondida (ou é a primeira vez de quem trabalha sozinho), abre uma que exista. */
    var ativo = ui.$(".menu-item.ativo");
    if ((ativo && ativo.hidden) || (primeiraVez && individual)) {
      var alvo = ui.$('.menu-item[data-aba="diario"]:not([hidden])') || ui.$(".menu-item:not([hidden])");
      if (alvo) alvo.click();
    }
    primeiraVez = false;
  }

  aplicar((App.sessao.atual() || {}).empresa);
  App.auth.buscarEmpresa().then(aplicar).catch(function () { /* mantém o que já está na tela */ });

  /* ==========================================================================
     2. REGISTRAR CORRIDA PRÓPRIA (modo individual)
     ========================================================================== */
  function dois(n) { return String(n).padStart(2, "0"); }
  function agoraLocal() {
    var d = new Date();
    return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()) + "T" + dois(d.getHours()) + ":" + dois(d.getMinutes());
  }

  function abrirRegistro() {
    var clientes = nuvem.clientes().filter(function (c) { return c.ativo; })
      .sort(function (a, b) { return (a.empresa || a.nome).localeCompare(b.empresa || b.nome, "pt-BR"); });
    var rotas = (nuvem.tarifas() || {}).trajetos || [];

    var corpo = ui.abrirModal("Registrar corrida",
      '<form id="form-registro" novalidate>' +
        '<div class="grupo-campo"><label class="rotulo" for="reg-valor">Valor recebido (R$) *</label>' +
          '<input class="campo" id="reg-valor" type="number" step="0.01" min="0.01" inputmode="decimal" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="reg-quando">Quando</label>' +
          '<input class="campo" id="reg-quando" type="datetime-local" value="' + agoraLocal() + '" max="' + agoraLocal() + '" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="reg-trajeto">Trajeto (opcional)</label>' +
          '<input class="campo" id="reg-trajeto" list="reg-rotas" maxlength="120" placeholder="Ex.: Centro x Aeroporto" autocomplete="off" />' +
          '<datalist id="reg-rotas">' + rotas.map(function (t) { return '<option value="' + u.escaparHtml(t.nome) + '"></option>'; }).join("") + "</datalist></div>" +
        (clientes.length
          ? '<div class="grupo-campo"><label class="rotulo" for="reg-cliente">Cliente (opcional)</label>' +
            '<select class="campo" id="reg-cliente"><option value="">— sem cliente —</option>' + clientes.map(function (c) {
              return '<option value="' + c.id + '">' + u.escaparHtml(c.empresa ? c.empresa + " — " + c.nome : c.nome) + "</option>";
            }).join("") + "</select></div>"
          : "") +
        '<div class="grupo-campo"><label class="rotulo" for="reg-obs">Observações</label>' +
          '<input class="campo" id="reg-obs" maxlength="200" autocomplete="off" /></div>' +
        '<div class="erro-login" id="reg-erro" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">Registrar</button>' +
        "</div>" +
      "</form>", { classe: "modal-pequeno" });

    /* Escolheu um trajeto da lista de rotas? Sugere o valor dele (pode trocar). */
    var campoTrajeto = corpo.querySelector("#reg-trajeto"), campoValor = corpo.querySelector("#reg-valor");
    campoTrajeto.addEventListener("input", function () {
      var rota = rotas.filter(function (t) { return t.nome === campoTrajeto.value; })[0];
      if (rota && !campoValor.value) campoValor.value = rota.valor;
    });

    corpo.querySelector("#form-registro").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var erro = corpo.querySelector("#reg-erro");
      var valor = Number(campoValor.value);
      var quando = corpo.querySelector("#reg-quando").value;
      erro.textContent = "";
      if (!(valor > 0)) { erro.textContent = "Informe o valor recebido."; return; }
      var seletor = corpo.querySelector("#reg-cliente");
      var botao = corpo.querySelector('button[type="submit"]');
      botao.disabled = true;
      nuvem.registrarCorridaPropria({
        valor: valor, trajeto: campoTrajeto.value.trim(), clienteId: seletor ? seletor.value || null : null,
        concluidaEm: quando ? new Date(quando).getTime() : null, observacoes: corpo.querySelector("#reg-obs").value.trim()
      }).then(function (c) {
        ui.fecharModal();
        ui.aviso("Corrida " + c.codigo + " registrada: " + u.moeda(c.valor) + ".", "sucesso");
      }).catch(function (e) { erro.textContent = e.message; botao.disabled = false; });
    });
    campoValor.focus();
  }

  document.getElementById("registrar-corrida").addEventListener("click", abrirRegistro);
})();
