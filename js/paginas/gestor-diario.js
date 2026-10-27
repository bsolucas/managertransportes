/* =============================================================================
   paginas/gestor-diario.js — ABA "DIÁRIO" DO GESTOR
   -----------------------------------------------------------------------------
   Para quem administra o próprio negócio (taxista, van escolar...): em cada dia
   lança o km inicial e final, o faturamento e, se quiser, o número de corridas.
   Organização:
     1. Preparação
     2. Resumo do mês (faturamento, km, R$ por km, dias trabalhados)
     3. Lista de dias
     4. Lançar / editar um dia (janela)
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var botaoMenu = ui.$('[data-aba="diario"]');
  var campoMes = document.getElementById("diario-mes");
  var dias = [];   // lançamentos do mês mostrado

  function dois(n) { return String(n).padStart(2, "0"); }
  function hojeIso() { var h = new Date(); return h.getFullYear() + "-" + dois(h.getMonth() + 1) + "-" + dois(h.getDate()); }
  function dataBr(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function km(n) { return n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"; }
  function kmRodados(d) { return d.kmInicial !== null && d.kmFinal !== null ? d.kmFinal - d.kmInicial : null; }
  function indicador(rotulo, valor, detalhe) {
    return '<div class="cartao indicador"><div class="indicador-rotulo">' + rotulo + "</div>" +
           '<div class="indicador-valor">' + valor + '</div><div class="indicador-detalhe">' + detalhe + "</div></div>";
  }

  campoMes.value = hojeIso().slice(0, 7);

  /* ==========================================================================
     2 e 3. RESUMO E LISTA
     ========================================================================== */
  function desenhar() {
    var faturado = dias.reduce(function (s, d) { return s + d.faturamento; }, 0);
    var rodados = dias.reduce(function (s, d) { return s + (kmRodados(d) || 0); }, 0);
    var kmComFat = dias.reduce(function (s, d) { return kmRodados(d) ? s + d.faturamento : s; }, 0);   // só dias com km, para o R$/km ser justo
    var comKm = dias.filter(function (d) { return kmRodados(d); });
    var corridas = dias.reduce(function (s, d) { return s + (d.corridas || 0); }, 0);

    document.getElementById("indicadores-diario").innerHTML = [
      indicador("Faturamento do mês", u.moeda(faturado), u.plural(dias.length, "dia trabalhado", "dias trabalhados") +
        (dias.length ? " • média " + u.moeda(faturado / dias.length) + " por dia" : "")),
      indicador("Km rodados", rodados ? km(rodados) : "—", comKm.length ? "média " + km(rodados / comKm.length) + " por dia" : "lance o km inicial e final"),
      indicador("Faturamento por km", rodados ? u.moeda(kmComFat / rodados) : "—", "quanto cada km rendeu"),
      indicador("Corridas", corridas || "—", "informadas nos dias lançados")
    ].join("");

    document.getElementById("tabela-diario").innerHTML = dias.length ? dias.map(function (d) {
      var r = kmRodados(d);
      return "<tr>" +
        '<td data-rotulo="Dia" class="nao-quebra"><strong>' + dataBr(d.data) + "</strong></td>" +
        '<td data-rotulo="Km inicial" class="direita numero">' + km(d.kmInicial) + "</td>" +
        '<td data-rotulo="Km final" class="direita numero">' + km(d.kmFinal) + "</td>" +
        '<td data-rotulo="Rodados" class="direita numero">' + (r === null ? "—" : km(r)) + "</td>" +
        '<td data-rotulo="Corridas" class="direita numero">' + (d.corridas === null ? "—" : d.corridas) + "</td>" +
        '<td data-rotulo="Faturamento" class="direita numero"><strong>' + u.moeda(d.faturamento) + "</strong></td>" +
        '<td class="acoes-linha"><button class="botao botao-secundario botao-pequeno" data-editar-dia="' + d.id + '">Editar</button> ' +
          '<button class="botao botao-perigo botao-pequeno" data-excluir-dia="' + d.id + '">Excluir</button></td></tr>';
    }).join("") : '<tr><td colspan="7" class="tabela-vazia">Nenhum dia lançado neste mês. Clique em "+ Lançar dia".</td></tr>';
  }

  function carregar() {
    var mes = campoMes.value;
    return App.diario.doMes(mes).then(function (lista) {
      if (mes !== campoMes.value) return;
      dias = lista;
      desenhar();
    }).catch(function (e) { ui.aviso(e.message, "erro"); });
  }
  campoMes.addEventListener("change", function () { if (campoMes.value) carregar(); });
  botaoMenu.addEventListener("click", carregar);

  /* ==========================================================================
     4. LANÇAR / EDITAR UM DIA (janela)
     ========================================================================== */
  function abrirFormulario(id) {
    var d = dias.filter(function (x) { return x.id === id; })[0] ||
            { data: hojeIso(), kmInicial: null, kmFinal: null, faturamento: "", corridas: null, observacoes: "" };
    var v = function (n) { return n === null || n === undefined ? "" : n; };

    var corpo = ui.abrirModal(id ? "Editar dia" : "Lançar dia",
      '<form id="form-diario" novalidate>' +
        '<div class="grupo-campo"><label class="rotulo" for="dia-data">Dia *</label>' +
          '<input class="campo" id="dia-data" type="date" value="' + d.data + '"' + (id ? " disabled" : "") + " />" +
          '<p class="texto-suave texto-pequeno" id="dia-aviso-existe" hidden>Este dia já foi lançado: ao salvar, os valores serão atualizados.</p></div>' +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="dia-km-ini">Km inicial</label>' +
            '<input class="campo" id="dia-km-ini" type="number" step="0.1" min="0" inputmode="decimal" value="' + v(d.kmInicial) + '" placeholder="Painel ao sair" /></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="dia-km-fim">Km final</label>' +
            '<input class="campo" id="dia-km-fim" type="number" step="0.1" min="0" inputmode="decimal" value="' + v(d.kmFinal) + '" placeholder="Painel ao parar" /></div>' +
        "</div>" +
        '<p class="texto-suave texto-pequeno" id="dia-rodados"></p>' +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="dia-fat">Faturamento do dia (R$) *</label>' +
            '<input class="campo" id="dia-fat" type="number" step="0.01" min="0" inputmode="decimal" value="' + v(d.faturamento) + '" /></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="dia-corridas">Nº de corridas</label>' +
            '<input class="campo" id="dia-corridas" type="number" step="1" min="0" inputmode="numeric" value="' + v(d.corridas) + '" placeholder="opcional" /></div>' +
        "</div>" +
        '<div class="grupo-campo"><label class="rotulo" for="dia-obs">Observações</label>' +
          '<input class="campo" id="dia-obs" maxlength="200" value="' + u.escaparHtml(d.observacoes) + '" placeholder="Ex.: chuva, evento no centro" autocomplete="off" /></div>' +
        '<div class="erro-login" id="dia-erro" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">' + (id ? "Salvar alterações" : "Salvar dia") + "</button>" +
        "</div>" +
      "</form>", { classe: "modal-pequeno" });

    var kmIni = corpo.querySelector("#dia-km-ini"), kmFim = corpo.querySelector("#dia-km-fim");
    var campoData = corpo.querySelector("#dia-data");

    function mostrarRodados() {
      var a = parseFloat(kmIni.value), b = parseFloat(kmFim.value);
      corpo.querySelector("#dia-rodados").textContent = !isNaN(a) && !isNaN(b) && b >= a ? "Rodados no dia: " + km(b - a) : "";
    }
    kmIni.addEventListener("input", mostrarRodados); kmFim.addEventListener("input", mostrarRodados);
    mostrarRodados();

    /* Dia novo: o km inicial sugerido é o km final do último dia lançado. */
    function sugerirKmInicial() {
      if (id || kmIni.value) return;
      App.diario.ultimoAntes(campoData.value).then(function (ant) {
        if (ant && ant.kmFinal !== null && !kmIni.value) { kmIni.value = ant.kmFinal; mostrarRodados(); }
      });
    }
    function avisarSeExiste() {
      corpo.querySelector("#dia-aviso-existe").hidden = id || !dias.some(function (x) { return x.data === campoData.value; });
    }
    campoData.addEventListener("change", function () { avisarSeExiste(); });
    sugerirKmInicial();
    avisarSeExiste();

    corpo.querySelector("#form-diario").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var erro = corpo.querySelector("#dia-erro");
      var num = function (sel) { var t = corpo.querySelector(sel).value; return t === "" ? null : Number(t); };
      var dados = { data: campoData.value, kmInicial: num("#dia-km-ini"), kmFinal: num("#dia-km-fim"),
                    faturamento: num("#dia-fat"), corridas: num("#dia-corridas"), observacoes: corpo.querySelector("#dia-obs").value.trim() };
      erro.textContent = "";
      if (!dados.data) { erro.textContent = "Escolha o dia."; return; }
      if (dados.faturamento === null || dados.faturamento < 0) { erro.textContent = "Informe o faturamento do dia (pode ser 0)."; return; }
      if (dados.kmInicial !== null && dados.kmFinal !== null && dados.kmFinal < dados.kmInicial) { erro.textContent = "O km final não pode ser menor que o km inicial."; return; }
      var botao = corpo.querySelector('button[type="submit"]');
      botao.disabled = true;
      App.diario.salvar(dados).then(function () {
        ui.fecharModal();
        ui.aviso("Dia salvo.", "sucesso");
        campoMes.value = dados.data.slice(0, 7);
        carregar();
      }).catch(function (e) { erro.textContent = e.message; botao.disabled = false; });
    });
    corpo.querySelector("#dia-fat").focus();
  }

  document.getElementById("novo-dia").addEventListener("click", function () { abrirFormulario(null); });

  document.getElementById("tabela-diario").addEventListener("click", function (ev) {
    var editar = ev.target.closest("[data-editar-dia]");
    if (editar) { abrirFormulario(editar.getAttribute("data-editar-dia")); return; }
    var excluir = ev.target.closest("[data-excluir-dia]");
    if (!excluir) return;
    var id = excluir.getAttribute("data-excluir-dia");
    ui.confirmar("Excluir este dia do diário?").then(function (sim) {
      if (!sim) return;
      App.diario.excluir(id).then(function () { ui.aviso("Dia excluído.", "info"); carregar(); })
        .catch(function (e) { ui.aviso(e.message, "erro"); });
    });
  });
})();
