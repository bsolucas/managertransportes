/* =============================================================================
   paginas/gestor-despesas.js — ABA "DESPESAS" DO GESTOR (plano Individual)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação (a aba só existe para quem tem o plano Individual)
     2. Resumo do mês: recebido, despesas e saldo
     3. Por categoria e lista de lançamentos
     4. Cadastro (janela): nova despesa ou edição
     5. Atualização

   "Recebido" = soma das corridas CONCLUÍDAS no mês (valor + extras).
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var CATS = App.despesas.CATEGORIAS;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var botaoMenu = ui.$('[data-aba="despesas"]');
  var secao = ui.$('[data-painel="despesas"]');
  var campoMes = document.getElementById("despesas-mes");
  var lancamentos = [];    // despesas do mês mostrado

  function mesAtual() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  campoMes.value = mesAtual();

  /* Só o plano Individual usa esta aba; os demais planos nem a veem. */
  function liberarSeIndividual(empresa) {
    var individual = empresa && empresa.modo_uso === "individual";
    botaoMenu.hidden = !individual;
    if (!individual) secao.hidden = true;
  }
  var sessao = App.sessao.atual() || {};
  liberarSeIndividual(sessao.empresa);
  App.auth.buscarEmpresa().then(liberarSeIndividual).catch(function () { /* mantém o que já está */ });

  function abaAberta() { return !secao.hidden; }
  function indicador(rotulo, valor, detalhe, classe) {
    return '<div class="cartao indicador"><div class="indicador-rotulo">' + rotulo + "</div>" +
           '<div class="indicador-valor ' + (classe || "") + '">' + valor + "</div>" +
           '<div class="indicador-detalhe">' + detalhe + "</div></div>";
  }
  function dataBr(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

  /* ==========================================================================
     2. RESUMO DO MÊS
     ========================================================================== */
  function recebidoNoMes(mes) {
    var p = mes.split("-");
    var ini = new Date(Number(p[0]), Number(p[1]) - 1, 1).getTime();
    var fim = new Date(Number(p[0]), Number(p[1]), 1).getTime();
    var feitas = App.nuvem.corridas().filter(function (c) { return c.status === "concluida" && c.concluidaEm >= ini && c.concluidaEm < fim; });
    return { qtd: feitas.length, total: feitas.reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0) };
  }

  function desenhar() {
    var recebido = recebidoNoMes(campoMes.value);
    var gasto = lancamentos.reduce(function (s, d) { return s + d.valor; }, 0);
    var saldo = recebido.total - gasto;

    document.getElementById("indicadores-despesas").innerHTML = [
      indicador("Recebido", u.moeda(recebido.total), u.plural(recebido.qtd, "corrida concluída", "corridas concluídas")),
      indicador("Despesas", u.moeda(gasto), u.plural(lancamentos.length, "lançamento", "lançamentos")),
      indicador("Saldo do mês", u.moeda(saldo), saldo >= 0 ? "recebido menos despesas" : "gastou mais do que recebeu", saldo < 0 ? "valor-negativo" : "")
    ].join("");

    /* 3. Por categoria (barras proporcionais ao maior gasto) */
    var porCat = {};
    lancamentos.forEach(function (d) { porCat[d.categoria] = (porCat[d.categoria] || 0) + d.valor; });
    var lista = Object.keys(porCat).map(function (k) { return { chave: k, total: porCat[k] }; })
      .sort(function (a, b) { return b.total - a.total; });
    var maior = lista.length ? lista[0].total : 1;
    document.getElementById("despesas-categorias").innerHTML = lista.length ? lista.map(function (g) {
      return '<div class="barra-categoria"><div class="barra-categoria-topo"><span>' + u.escaparHtml((CATS[g.chave] || {}).rotulo || g.chave) +
        "</span><strong>" + u.moeda(g.total) + '</strong></div><div class="barra-fundo"><div class="barra-preenchida" style="width:' +
        Math.max(3, Math.round(g.total / maior * 100)) + '%"></div></div></div>';
    }).join("") : '<p class="texto-suave">Nenhuma despesa neste mês.</p>';

    /* Lista de lançamentos */
    document.getElementById("tabela-despesas").innerHTML = lancamentos.length ? lancamentos.map(function (d) {
      return "<tr>" +
        '<td data-rotulo="Data" class="nao-quebra">' + dataBr(d.data) + "</td>" +
        '<td data-rotulo="Categoria">' + u.escaparHtml((CATS[d.categoria] || {}).rotulo || d.categoria) + "</td>" +
        '<td data-rotulo="Descrição">' + u.escaparHtml(d.descricao || "—") + "</td>" +
        '<td data-rotulo="Valor" class="direita numero"><strong>' + u.moeda(d.valor) + "</strong></td>" +
        '<td class="acoes-linha"><button class="botao botao-secundario botao-pequeno" data-editar-despesa="' + d.id + '">Editar</button> ' +
          '<button class="botao botao-perigo botao-pequeno" data-excluir-despesa="' + d.id + '">Excluir</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="tabela-vazia">Nenhuma despesa lançada neste mês.</td></tr>';
  }

  function carregar() {
    var mes = campoMes.value;
    return App.despesas.doMes(mes).then(function (lista) {
      if (mes !== campoMes.value) return;   // o gestor já trocou de mês
      lancamentos = lista;
      desenhar();
    }).catch(function (e) { ui.aviso(e.message, "erro"); });
  }

  campoMes.addEventListener("change", function () { if (campoMes.value) carregar(); });

  /* ==========================================================================
     4. CADASTRO (janela): nova despesa ou edição
     ========================================================================== */
  function abrirFormulario(id) {
    var d = lancamentos.filter(function (x) { return x.id === id; })[0] || { data: hoje(), categoria: "combustivel", descricao: "", valor: "" };
    function hoje() {
      var h = new Date();
      return h.getFullYear() + "-" + String(h.getMonth() + 1).padStart(2, "0") + "-" + String(h.getDate()).padStart(2, "0");
    }
    var corpo = ui.abrirModal(id ? "Editar despesa" : "Nova despesa",
      '<form id="form-despesa" novalidate>' +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="desp-data">Data *</label>' +
            '<input class="campo" id="desp-data" type="date" value="' + d.data + '" /></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="desp-valor">Valor (R$) *</label>' +
            '<input class="campo" id="desp-valor" type="number" step="0.01" min="0.01" inputmode="decimal" value="' + (d.valor || "") + '" />' +
            '<div class="erro-campo" id="desp-erro-valor"></div></div>' +
        "</div>" +
        '<div class="grupo-campo"><label class="rotulo" for="desp-categoria">Categoria *</label>' +
          '<select class="campo" id="desp-categoria">' + Object.keys(CATS).map(function (k) {
            return '<option value="' + k + '"' + (k === d.categoria ? " selected" : "") + ">" + u.escaparHtml(CATS[k].rotulo) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="grupo-campo"><label class="rotulo" for="desp-descricao">Descrição (opcional)</label>' +
          '<input class="campo" id="desp-descricao" maxlength="120" value="' + u.escaparHtml(d.descricao) + '" placeholder="Ex.: abastecimento posto Shell" autocomplete="off" /></div>' +
        '<div class="erro-login" id="desp-erro-geral" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">' + (id ? "Salvar alterações" : "Lançar despesa") + "</button>" +
        "</div>" +
      "</form>", { classe: "modal-pequeno" });

    corpo.querySelector("#form-despesa").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var valor = Number(corpo.querySelector("#desp-valor").value);
      var data = corpo.querySelector("#desp-data").value;
      var erroValor = corpo.querySelector("#desp-erro-valor");
      erroValor.textContent = valor > 0 ? "" : "Informe um valor maior que zero.";
      if (!(valor > 0) || !data) return;
      var botao = corpo.querySelector('button[type="submit"]');
      botao.disabled = true;
      App.despesas.salvar({
        id: id || undefined, data: data, valor: valor,
        categoria: corpo.querySelector("#desp-categoria").value,
        descricao: corpo.querySelector("#desp-descricao").value.trim()
      }).then(function () {
        ui.fecharModal();
        ui.aviso(id ? "Despesa atualizada." : "Despesa lançada.", "sucesso");
        /* Se a data cair em outro mês, mostra esse mês para o gestor ver o lançamento. */
        campoMes.value = data.slice(0, 7);
        carregar();
      }).catch(function (e) {
        corpo.querySelector("#desp-erro-geral").textContent = e.message;
        botao.disabled = false;
      });
    });
    corpo.querySelector("#desp-valor").focus();
  }

  document.getElementById("nova-despesa").addEventListener("click", function () { abrirFormulario(null); });

  document.getElementById("tabela-despesas").addEventListener("click", function (ev) {
    var editar = ev.target.closest("[data-editar-despesa]");
    if (editar) { abrirFormulario(editar.getAttribute("data-editar-despesa")); return; }
    var excluir = ev.target.closest("[data-excluir-despesa]");
    if (!excluir) return;
    var id = excluir.getAttribute("data-excluir-despesa");
    ui.confirmar("Excluir esta despesa?").then(function (sim) {
      if (!sim) return;
      App.despesas.excluir(id).then(function () {
        ui.aviso("Despesa excluída.", "info");
        carregar();
      }).catch(function (e) { ui.aviso(e.message, "erro"); });
    });
  });

  /* ==========================================================================
     5. ATUALIZAÇÃO
     ========================================================================== */
  botaoMenu.addEventListener("click", carregar);
  /* O "recebido" muda quando uma corrida é concluída. */
  App.nuvem.aoMudar(function (chave) { if (chave === "corridas" && abaAberta()) desenhar(); });
})();
