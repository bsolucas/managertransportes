/* =============================================================================
   paginas/gestor-planilhas.js — ABA "PLANILHAS" DO PAINEL DO GESTOR
   -----------------------------------------------------------------------------
   Liga a tela (paginas/gestor.html, seção data-painel="planilhas") à conversão
   que está em js/planilhas.js:
     1. O gestor anexa (ou arrasta) o arquivo de corridas da empresa.
     2. Mostramos o que foi corrigido, os totais em reais, as somas por motorista
        e por status, e uma prévia das corridas.
     3. O botão "Baixar planilha" entrega o .xlsx pronto, com a linha de TOTAL.
   O arquivo NÃO sai do computador: tudo é feito no navegador.
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;

  var entrada = document.getElementById("arquivo-planilha");
  var area = document.getElementById("area-anexo");
  var estado = document.getElementById("estado-planilha");
  var resultado = document.getElementById("resultado-planilha");

  /* Resultado da última conversão (guardado para o botão de baixar). */
  var ultimo = null;

  var MAX_PREVIA = 100; // linhas mostradas na prévia (o arquivo baixado tem todas)

  /* ==========================================================================
     Atalhos: o botão do topo e o cartão da Visão geral levam direto para esta aba
     (no celular o menu lateral rola para o lado e esta aba ficaria escondida).
     ========================================================================== */
  ui.$$("[data-atalho-planilhas]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      ui.$('[data-aba="planilhas"]').click();
      window.scrollTo(0, 0);
    });
  });

  /* ==========================================================================
     Anexar: clique, seleção ou arrastar
     ========================================================================== */
  entrada.addEventListener("change", function () {
    if (entrada.files && entrada.files[0]) abrirArquivo(entrada.files[0]);
    entrada.value = ""; // permite anexar o mesmo arquivo de novo
  });

  ["dragenter", "dragover"].forEach(function (nome) {
    area.addEventListener(nome, function (ev) { ev.preventDefault(); area.classList.add("arrastando"); });
  });
  ["dragleave", "drop"].forEach(function (nome) {
    area.addEventListener(nome, function (ev) { ev.preventDefault(); area.classList.remove("arrastando"); });
  });
  area.addEventListener("drop", function (ev) {
    var arquivo = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (arquivo) abrirArquivo(arquivo);
  });

  document.getElementById("anexar-outra").addEventListener("click", function () { entrada.click(); });

  /* ==========================================================================
     Converter
     ========================================================================== */
  function abrirArquivo(arquivo) {
    estado.textContent = "Lendo \"" + arquivo.name + "\"…";
    resultado.hidden = true;
    ultimo = null;

    arquivo.arrayBuffer()
      .then(function (buffer) { return App.planilhas.processar(buffer, arquivo.name); })
      .then(function (r) {
        ultimo = r;
        estado.textContent = "Arquivo: " + arquivo.name + " — " + u.plural(r.totais.corridas, "corrida", "corridas") + ".";
        desenhar(r);
        ui.aviso("Planilha convertida e somada.", "sucesso");
      })
      .catch(function (erro) {
        estado.textContent = "";
        ui.aviso("Não consegui ler o arquivo: " + (erro && erro.message ? erro.message : erro), "erro");
      });
  }

  /* ==========================================================================
     Mostrar o resultado
     ========================================================================== */
  function numero(n, casas) {
    return Number(n || 0).toLocaleString(App.config.LOCALIDADE, { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function indicador(rotulo, valor, detalhe) {
    return '<div class="cartao indicador"><div class="indicador-rotulo">' + rotulo + "</div>" +
           '<div class="indicador-valor">' + valor + "</div>" +
           '<div class="indicador-detalhe">' + (detalhe || "") + "</div></div>";
  }

  function desenhar(r) {
    var somas = r.totais.somas;
    var titulos = r.dados.colunas.map(function (c) { return c.titulo; });

    /* Avisos: o que foi corrigido + valores que não deu para entender */
    var itens = r.avisos.map(function (a) { return "<li>✔ " + u.escaparHtml(a) + "</li>"; });
    if (r.dados.registros.some(function (reg) { return reg.some(function (v) { return typeof v === "string" && /[ÃÂ][\u0080-¿]/.test(v); }); })) {
      itens.push('<li class="problema">Ainda há textos com acento estranho; confira a prévia.</li>');
    }
    r.problemas.slice(0, 5).forEach(function (p) { itens.push('<li class="problema">⚠ ' + u.escaparHtml(p) + "</li>"); });
    if (r.problemas.length > 5) itens.push('<li class="problema">⚠ … e mais ' + (r.problemas.length - 5) + " valores que não entendi.</li>");
    var outrosStatus = r.totais.porStatus.length > 1;
    if (outrosStatus) itens.push('<li class="problema">⚠ O arquivo tem corridas com mais de um status; o total soma TODAS. Veja "Por status" abaixo.</li>');
    document.getElementById("avisos-planilha").innerHTML = itens.join("");

    /* Indicadores principais */
    var cards = [indicador("Corridas", r.totais.corridas, "linhas no arquivo")];
    r.dados.colunas.forEach(function (col) {
      if (col.tipo === "dinheiro") cards.push(indicador(col.titulo, u.moeda(somas[col.titulo]), "soma de todas as corridas"));
      if (col.tipo === "km") cards.push(indicador("Km rodados", numero(somas[col.titulo], 2) + " km", "soma da coluna Km"));
    });
    document.getElementById("indicadores-planilha").innerHTML = cards.join("");

    /* Por motorista e por status (usa "Valor Total" e "Km", se existirem) */
    var tValor = titulos.filter(function (t) { return /^valor total$/i.test(t); })[0] || titulos.filter(function (t) { return /^valor/i.test(t); })[0];
    var tKm = titulos.filter(function (t) { return /^km$/i.test(t); })[0];
    function valorDe(g, t) { return t ? g.somas[t] : 0; }
    document.getElementById("planilha-motoristas").innerHTML = r.totais.porMotorista.length ? r.totais.porMotorista.map(function (g) {
      return "<tr><td>" + u.escaparHtml(g.chave) + '</td><td class="direita">' + g.corridas +
             '</td><td class="direita oculto-celular">' + numero(valorDe(g, tKm), 2) +
             '</td><td class="direita"><strong>' + u.moeda(valorDe(g, tValor)) + "</strong></td></tr>";
    }).join("") : '<tr><td colspan="4" class="tabela-vazia">O arquivo não tem a coluna Motorista.</td></tr>';
    document.getElementById("planilha-status").innerHTML = r.totais.porStatus.length ? r.totais.porStatus.map(function (g) {
      return "<tr><td>" + u.escaparHtml(g.chave) + '</td><td class="direita">' + g.corridas +
             '</td><td class="direita"><strong>' + u.moeda(valorDe(g, tValor)) + "</strong></td></tr>";
    }).join("") : '<tr><td colspan="3" class="tabela-vazia">O arquivo não tem a coluna Status.</td></tr>';

    /* Prévia das corridas, com a linha de total no fim */
    document.getElementById("planilha-previa-cabecalho").innerHTML =
      "<tr>" + r.dados.colunas.map(function (c) {
        return "<th" + (c.tipo === "dinheiro" || c.tipo === "km" ? ' class="direita"' : "") + ">" + u.escaparHtml(c.titulo) + "</th>";
      }).join("") + "</tr>";
    document.getElementById("planilha-previa").innerHTML = r.dados.registros.slice(0, MAX_PREVIA).map(function (reg) {
      return "<tr>" + reg.map(function (v, k) { return celula(r.dados.colunas[k], v); }).join("") + "</tr>";
    }).join("");
    document.getElementById("planilha-previa-total").innerHTML =
      "<tr>" + r.dados.colunas.map(function (c, k) {
        if (k === 0) return "<td>TOTAL</td>";
        if (c.tipo === "dinheiro") return '<td class="direita">' + u.moeda(somas[c.titulo]) + "</td>";
        if (c.tipo === "km") return '<td class="direita">' + numero(somas[c.titulo], 2) + "</td>";
        return "<td></td>";
      }).join("") + "</tr>";
    document.getElementById("planilha-previa-info").textContent = r.dados.registros.length > MAX_PREVIA
      ? "Mostrando as primeiras " + MAX_PREVIA + " de " + r.dados.registros.length + " (a planilha baixada tem todas)."
      : "Todas as " + r.dados.registros.length + " corridas.";

    resultado.hidden = false;
  }

  /* Uma célula da prévia, formatada conforme o tipo da coluna. */
  function celula(coluna, v) {
    if (v === null || v === undefined) return "<td></td>";
    if (coluna.tipo === "dinheiro") return '<td class="direita">' + u.moeda(v) + "</td>";
    if (coluna.tipo === "km") return '<td class="direita">' + numero(v, 2) + "</td>";
    if (coluna.tipo === "data" && v instanceof Date) {
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      return "<td>" + p(v.getUTCDate()) + "/" + p(v.getUTCMonth() + 1) + "/" + v.getUTCFullYear() + " " + p(v.getUTCHours()) + ":" + p(v.getUTCMinutes()) + "</td>";
    }
    var texto = String(v);
    return '<td title="' + u.escaparHtml(texto) + '">' + u.escaparHtml(texto) + "</td>";
  }

  /* ==========================================================================
     Baixar a planilha pronta
     ========================================================================== */
  document.getElementById("baixar-planilha").addEventListener("click", function () {
    if (!ultimo) return;
    var hoje = new Date().toISOString().slice(0, 10);
    var blob = new Blob([ultimo.xlsx], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "corridas-corrigidas-" + hoje + ".xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
  });
})();
