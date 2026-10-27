/* =============================================================================
   paginas/gestor-pagamentos.js — ABA "PAGAMENTOS" DO GESTOR
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação
     2. Comissão de todos os motoristas ("Aplicar a todos")
     3. Quanto pagar em cada período (quinzena ou mês)
     4. Janela "Alterar pagamento" de um motorista (comissão própria ou CLT)
        — também aberta pelo botão "Alterar comissão" na aba Motoristas.

   Regras: a comissão só existe depois que a corrida é CONCLUÍDA e é calculada pelo
   banco (valor + extras) com a % da hora; mudar a % depois não mexe no que já foi
   ganho. O salário do CLT só o gestor enxerga.
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var pg = App.pagamentos;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var botaoMenu = ui.$('[data-aba="pagamentos"]');
  var campoPeriodo = document.getElementById("pagamentos-periodo");
  var campoPadrao = document.getElementById("comissao-padrao");

  campoPeriodo.innerHTML = pg.PERIODOS.map(function (p) { return '<option value="' + p.id + '">' + u.escaparHtml(p.rotulo()) + "</option>"; }).join("");
  campoPeriodo.value = "mes_atual";
  function periodo() { return pg.PERIODOS.filter(function (p) { return p.id === campoPeriodo.value; })[0]; }

  function indicador(rotulo, valor, detalhe) {
    return '<div class="cartao indicador"><div class="indicador-rotulo">' + rotulo + "</div>" +
           '<div class="indicador-valor">' + valor + '</div><div class="indicador-detalhe">' + detalhe + "</div></div>";
  }
  function pct(n) { return String(n).replace(".", ",") + "%"; }

  /* Texto da forma de pagamento de um motorista (usado aqui e na aba Motoristas). */
  function resumoForma(id) {
    var p = pg.doMotorista(id);
    if (p.tipo === "clt") return "CLT" + (p.salario !== null ? " • " + u.moeda(p.salario) + "/mês" : " • salário não informado");
    return "Comissão " + pct(p.efetivo) + (p.percentual === null ? " (padrão)" : " (própria)");
  }

  /* ==========================================================================
     2. COMISSÃO DE TODOS OS MOTORISTAS
     ========================================================================== */
  function desenharPadrao() {
    if (document.activeElement !== campoPadrao) campoPadrao.value = pg.padrao();
    var proprias = nuvemMotoristas().filter(function (m) { return pg.doMotorista(m.id).percentual !== null; }).length;
    document.getElementById("comissao-aviso").textContent = proprias
      ? u.plural(proprias, "motorista tem", "motoristas têm") + " comissão própria. \"Aplicar a todos\" troca todas pela comissão acima."
      : "Todos os motoristas com comissão usam esta porcentagem.";
  }

  function nuvemMotoristas() { return App.nuvem.motoristas(); }

  document.getElementById("aplicar-comissao-todos").addEventListener("click", function () {
    var valor = Number(campoPadrao.value);
    if (campoPadrao.value === "" || isNaN(valor) || valor < 0 || valor > 100) { ui.aviso("Informe uma porcentagem entre 0 e 100.", "erro"); return; }
    var proprias = nuvemMotoristas().filter(function (m) { return pg.doMotorista(m.id).percentual !== null; }).length;
    var seguir = proprias ? ui.confirmar("Aplicar " + pct(valor) + " a todos? As " + u.plural(proprias, "comissão própria", "comissões próprias") + " serão substituídas.") : Promise.resolve(true);
    seguir.then(function (sim) {
      if (!sim) return;
      pg.definirPadrao(valor, true).then(function () { ui.aviso("Comissão de " + pct(valor) + " aplicada a todos.", "sucesso"); })
        .catch(function (e) { ui.aviso(e.message, "erro"); });
    });
  });

  /* ==========================================================================
     3. QUANTO PAGAR NO PERÍODO
     ========================================================================== */
  function desenhar() {
    desenharPadrao();
    var per = periodo();
    var de = per.de(), ate = per.ate();
    var feitas = App.nuvem.corridas().filter(function (c) {
      return c.status === "concluida" && c.motoristaId && c.concluidaEm >= de && c.concluidaEm < ate;
    });

    var totalComissoes = 0, totalSalarios = 0, totalCorridas = 0;
    var linhas = nuvemMotoristas().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); }).map(function (m) {
      var p = pg.doMotorista(m.id);
      var minhas = feitas.filter(function (c) { return c.motoristaId === m.id; });
      var aPagar, detalhe;
      if (p.tipo === "clt") {
        aPagar = per.mensal ? (p.salario || 0) : null;
        totalSalarios += aPagar || 0;
        detalhe = per.mensal ? u.moeda(aPagar) : '<span class="texto-suave">salário mensal</span>';
      } else {
        aPagar = minhas.reduce(function (s, c) { return s + (c.comissaoValor || 0); }, 0);
        totalComissoes += aPagar;
        detalhe = "<strong>" + u.moeda(aPagar) + "</strong>";
      }
      totalCorridas += minhas.length;
      return "<tr>" +
        '<td data-rotulo="Motorista"><strong>' + u.escaparHtml(m.nome) + "</strong></td>" +
        '<td data-rotulo="Forma">' + u.escaparHtml(resumoForma(m.id)) + "</td>" +
        '<td data-rotulo="Corridas" class="direita">' + minhas.length + "</td>" +
        '<td data-rotulo="A pagar" class="direita numero">' + detalhe + "</td>" +
        '<td class="acoes-linha"><button class="botao botao-secundario botao-pequeno" data-alterar-pagamento="' + m.id + '">Alterar</button></td></tr>';
    });

    document.getElementById("indicadores-pagamentos").innerHTML = [
      indicador("Total a pagar", u.moeda(totalComissoes + totalSalarios), per.mensal ? "comissões + salários CLT" : "comissões (salário CLT é mensal)"),
      indicador("Comissões", u.moeda(totalComissoes), "das corridas concluídas no período"),
      indicador("Salários CLT", per.mensal ? u.moeda(totalSalarios) : "—", per.mensal ? "salários do mês" : "veja em um período mensal"),
      indicador("Corridas concluídas", totalCorridas, "com motorista")
    ].join("");

    document.getElementById("tabela-pagamentos").innerHTML = linhas.length ? linhas.join("")
      : '<tr><td colspan="5" class="tabela-vazia">Nenhum motorista cadastrado ainda. Cadastre pela aba Motoristas.</td></tr>';
  }

  campoPeriodo.addEventListener("change", desenhar);
  botaoMenu.addEventListener("click", function () { pg.carregar().catch(function () {}); desenhar(); });
  pg.aoMudar(function () { desenhar(); if (App.gestorPagamentos.aoMudar) App.gestorPagamentos.aoMudar(); });
  App.nuvem.aoMudar(function (chave) { if (chave === "corridas" || chave === "motoristas") desenhar(); });

  document.getElementById("tabela-pagamentos").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-alterar-pagamento]");
    if (b) abrir(b.getAttribute("data-alterar-pagamento"));
  });

  /* ==========================================================================
     4. ALTERAR O PAGAMENTO DE UM MOTORISTA
     ========================================================================== */
  function abrir(motoristaId) {
    var m = App.nuvem.buscarMotorista(motoristaId);
    if (!m) return;
    var p = pg.doMotorista(motoristaId);
    var propria = p.percentual !== null;

    var corpo = ui.abrirModal("Pagamento de " + m.nome,
      '<form id="form-pagamento" novalidate>' +
        '<div class="grupo-campo"><span class="rotulo">Forma de pagamento</span>' +
          '<div class="opcoes-pilula">' +
            '<label class="pilula"><input type="radio" name="forma" value="comissao"' + (p.tipo === "comissao" ? " checked" : "") + " /> Comissão</label>" +
            '<label class="pilula"><input type="radio" name="forma" value="clt"' + (p.tipo === "clt" ? " checked" : "") + " /> CLT (salário)</label>" +
          "</div></div>" +
        '<div id="bloco-comissao">' +
          '<div class="grupo-campo"><label class="rotulo">Comissão</label>' +
            '<label class="pilula pilula-bloco"><input type="radio" name="origem" value="padrao"' + (!propria ? " checked" : "") + " /> Usar a comissão de todos (" + pct(pg.padrao()) + ")</label>" +
            '<label class="pilula pilula-bloco"><input type="radio" name="origem" value="propria"' + (propria ? " checked" : "") + " /> Comissão só deste motorista</label>" +
            '<div class="campo-percentual campo-percentual-modal"><input class="campo" id="pag-percentual" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="' +
              (propria ? p.percentual : pg.padrao()) + '" aria-label="Comissão em porcentagem" /><span>%</span></div></div>' +
          '<p class="texto-suave texto-pequeno">A comissão aparece para o motorista só depois que a corrida é concluída.</p>' +
        "</div>" +
        '<div id="bloco-clt" hidden>' +
          '<div class="grupo-campo"><label class="rotulo" for="pag-salario">Salário mensal (R$)</label>' +
            '<input class="campo" id="pag-salario" type="number" min="0" step="0.01" inputmode="decimal" value="' + (p.salario === null ? "" : p.salario) + '" /></div>' +
          '<p class="texto-suave texto-pequeno">O motorista CLT não vê este valor nem a aba de ganhos.</p>' +
        "</div>" +
        '<div class="erro-login" id="pag-erro" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">Salvar</button>' +
        "</div>" +
      "</form>", { classe: "modal-pequeno" });

    var forma = function () { return corpo.querySelector('input[name="forma"]:checked').value; };
    var origem = function () { return corpo.querySelector('input[name="origem"]:checked').value; };
    var campoPct = corpo.querySelector("#pag-percentual");
    function ajustar() {
      corpo.querySelector("#bloco-comissao").hidden = forma() !== "comissao";
      corpo.querySelector("#bloco-clt").hidden = forma() !== "clt";
      campoPct.hidden = campoPct.parentNode.hidden = origem() !== "propria";
    }
    corpo.addEventListener("change", ajustar);
    ajustar();

    corpo.querySelector("#form-pagamento").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var erro = corpo.querySelector("#pag-erro");
      erro.textContent = "";
      var dados = { tipo: forma(), percentual: null, salario: null };
      if (dados.tipo === "comissao" && origem() === "propria") {
        var v = Number(campoPct.value);
        if (campoPct.value === "" || isNaN(v) || v < 0 || v > 100) { erro.textContent = "Informe uma porcentagem entre 0 e 100."; return; }
        dados.percentual = v;
      }
      if (dados.tipo === "clt") {
        var s = corpo.querySelector("#pag-salario").value;
        if (s === "" || Number(s) < 0) { erro.textContent = "Informe o salário (pode ser 0 se ainda não definiu)."; return; }
        dados.salario = Number(s);
      }
      var botao = corpo.querySelector('button[type="submit"]');
      botao.disabled = true;
      pg.salvarMotorista(motoristaId, dados).then(function () {
        ui.fecharModal();
        ui.aviso("Pagamento de " + m.nome + " atualizado.", "sucesso");
      }).catch(function (e) { erro.textContent = e.message; botao.disabled = false; });
    });
  }

  /* A aba Motoristas (gestor.js) usa estas duas funções. */
  App.gestorPagamentos = { abrir: abrir, resumoForma: resumoForma, aoMudar: function () { if (!document.querySelector('[data-painel="motoristas"]').hidden) App.__redesenharMotoristas && App.__redesenharMotoristas(); } };

  pg.carregar().catch(function () { /* sem a tabela/permissão: a aba só fica vazia */ });
  desenhar();
})();
