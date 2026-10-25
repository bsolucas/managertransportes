/* =============================================================================
   planilhas.js — CONVERSÃO DE PLANILHAS DE CORRIDAS (CSV "embaraçado" -> XLSX)
   -----------------------------------------------------------------------------
   O problema que este arquivo resolve:
   o sistema da empresa exporta um arquivo ".csv" que, na verdade, é uma planilha
   do Excel com a linha INTEIRA escrita dentro da coluna A (os campos separados
   por vírgula, mas todos colados numa célula só). Por isso o Excel não consegue
   somar os valores, e os acentos aparecem quebrados ("SÃ£o" no lugar de "São").

   O que acontece aqui, em ordem:
     1. lerArquivo ........ abre o arquivo (planilha de verdade OU csv de texto)
                            e devolve uma tabela de textos (linhas x colunas)
     2. tratar ............ separa as colunas, corrige os acentos, transforma
                            valores em número e datas em data de verdade
     3. somar ............. totais gerais, por motorista e por status
     4. montarXlsx ........ gera a planilha final já com a linha de TOTAL
                            (fórmula SOMA) e a aba "Resumo"

   As funções 2 e 3 não usam o navegador: dá para testá-las no Node.
   As funções 1 e 4 usam a biblioteca ExcelJS (carregada no gestor.html).
   ============================================================================= */

App.planilhas = (function () {

  /* ==========================================================================
     TEXTO: acentos quebrados e separadores
     ========================================================================== */

  /* Caracteres que o Windows-1252 coloca nas posições 0x80–0x9F.
     Precisamos deles para "desfazer" o erro de acentuação (ver corrigirTexto). */
  var CP1252 = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
    "ˆ": 0x88, "‰": 0x89, "Š": 0x8A, "‹": 0x8B, "Œ": 0x8C, "Ž": 0x8E, "‘": 0x91,
    "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
    "™": 0x99, "š": 0x9A, "›": 0x9B, "œ": 0x9C, "ž": 0x9E, "Ÿ": 0x9F
  };

  /* Conserta texto com acentos quebrados. O erro típico: o arquivo estava em
     UTF-8, mas foi lido como Windows-1252, então "São" virou "SÃ£o".
     Desfazemos: cada caractere volta a ser o byte original e lemos como UTF-8.
     Se o texto não tem esse defeito (ou não dá para consertar), volta igual. */
  function corrigirTexto(texto) {
    if (typeof texto !== "string" || !/[ÂÃ]/.test(texto)) return texto;
    var bytes = [];
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charCodeAt(i);
      if (c < 0x100) bytes.push(c);
      else if (CP1252[texto.charAt(i)] !== undefined) bytes.push(CP1252[texto.charAt(i)]);
      else return texto; // tem um caractere que não vem desse erro: deixa como está
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    } catch (e) {
      return texto;
    }
  }

  /* Lê um texto CSV (aceita campos entre aspas, aspas duplas "" e quebras de
     linha dentro de aspas) e devolve uma lista de linhas, cada uma uma lista de campos. */
  function lerCsvTexto(texto, separador) {
    var linhas = [], linha = [], campo = "", entreAspas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charAt(i);
      if (entreAspas) {
        if (c === '"') {
          if (texto.charAt(i + 1) === '"') { campo += '"'; i++; } else entreAspas = false;
        } else campo += c;
      } else if (c === '"') {
        entreAspas = true;
      } else if (c === separador) {
        linha.push(campo); campo = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto.charAt(i + 1) === "\n") i++;
        linha.push(campo); campo = "";
        linhas.push(linha); linha = [];
      } else campo += c;
    }
    if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas.filter(function (l) { return l.some(function (x) { return String(x).trim() !== ""; }); });
  }

  /* Descobre o separador olhando a primeira linha: ";" , "," ou tabulação. */
  function descobrirSeparador(primeiraLinha) {
    var melhor = ",", maior = -1;
    [",", ";", "\t"].forEach(function (s) {
      var n = primeiraLinha.split(s).length - 1;
      if (n > maior) { maior = n; melhor = s; }
    });
    return melhor;
  }

  /* ==========================================================================
     1. LER O ARQUIVO
     ========================================================================== */

  /* Valor de uma célula do ExcelJS -> texto ou número simples. */
  function valorDaCelula(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v;
    if (typeof v === "object") {
      if (v.richText) return v.richText.map(function (p) { return p.text; }).join("");
      if (v.result !== undefined) return v.result;       // célula com fórmula
      if (v.text !== undefined) return v.text;           // link
      return String(v);
    }
    return v;
  }

  /* Abre o arquivo e devolve, em uma Promise:
       { linhas: [[...], ...], avisos: ["o que foi corrigido", ...] }
     "buffer" é o conteúdo do arquivo (ArrayBuffer) e "nome" o nome dele. */
  function lerArquivo(buffer, nome) {
    var bytes = new Uint8Array(buffer);
    var ehZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B; // "PK": é um .xlsx
    var avisos = [];

    /* Planilha antiga do Excel (.xls, formato binário): o navegador não consegue ler. */
    if (bytes.length > 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      return Promise.reject(new Error("Este é um .xls antigo. Abra no Excel e use Salvar como → Pasta de Trabalho do Excel (.xlsx), ou Salvar como CSV, e anexe de novo."));
    }

    if (!ehZip) {
      /* CSV de texto de verdade. Tenta UTF-8; se não der, Windows-1252. */
      var texto;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch (e) { texto = new TextDecoder("windows-1252").decode(bytes); avisos.push("O arquivo estava em Windows-1252 (acentos antigos); converti para UTF-8."); }
      texto = texto.replace(/^﻿/, "");
      var sep = descobrirSeparador(texto.split(/\r?\n/)[0] || "");
      return Promise.resolve({ linhas: lerCsvTexto(texto, sep), avisos: avisos });
    }

    /* É uma planilha do Excel (mesmo que o nome termine em .csv). */
    if (/\.csv$/i.test(nome || "")) avisos.push("O arquivo tinha o nome .csv, mas era uma planilha do Excel (.xlsx).");
    var wb = new ExcelJS.Workbook();
    return wb.xlsx.load(buffer).then(function () {
      var aba = wb.worksheets[0];
      if (!aba) throw new Error("A planilha está vazia.");
      var linhas = [];
      aba.eachRow({ includeEmpty: false }, function (row) {
        var celulas = [];
        for (var c = 1; c <= row.cellCount; c++) celulas.push(valorDaCelula(row.getCell(c).value));
        linhas.push(celulas);
      });
      linhas = linhas.filter(function (l) { return l.some(function (x) { return String(x).trim() !== ""; }); });

      /* O defeito: tudo dentro da coluna A. Cada linha tem só uma célula com
         vários campos separados por vírgula. Separamos como um CSV. */
      var soColunaA = linhas.length > 0 && linhas.every(function (l) {
        return l.filter(function (x) { return String(x).trim() !== ""; }).length === 1;
      });
      var primeira = soColunaA ? String(linhas[0][0]) : "";
      if (soColunaA && /[,;\t]/.test(primeira)) {
        var sepA = descobrirSeparador(primeira);
        var texto2 = linhas.map(function (l) { return String(l[0]); }).join("\n");
        linhas = lerCsvTexto(texto2, sepA);
        avisos.push("Todos os campos estavam colados na coluna A; separei em " + linhas[0].length + " colunas.");
      }
      return { linhas: linhas, avisos: avisos };
    });
  }

  /* ==========================================================================
     2. TRATAR: colunas, números e datas
     ========================================================================== */

  /* Tira acento, deixa minúsculo e sem espaços nas pontas (para comparar títulos). */
  function normalizar(t) {
    return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  /* Transforma "158.4", "158,4" ou "1.234,50" em número. Devolve null se não for número. */
  function paraNumero(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v === null || v === undefined ? "" : v).trim().replace(/^R\$\s*/i, "");
    if (s === "") return null;
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,50
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");                              // 158,4
    else if (!/^-?\d+(\.\d+)?$/.test(s)) return null;                                      // 158.4 ou 158
    return parseFloat(s);
  }

  /* Transforma "01/10/2026 00:01" em data. Usa UTC para o Excel mostrar a mesma hora
     digitada (sem deslocar por fuso horário). Devolve null se não for data. */
  function paraData(v) {
    if (v instanceof Date) return v;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(v).trim());
    if (!m) return null;
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  }

  /* Define o tipo de cada coluna pelo título:
       "dinheiro" ... títulos com "valor" (Valor Total, Valor Estimado)
       "km" ......... título "km"
       "inteiro" .... "acompanhantes"
       "data" ....... títulos que começam com "data"
       "texto" ...... o resto */
  function tipoDaColuna(titulo) {
    var t = normalizar(titulo);
    if (t.indexOf("valor") === 0) return "dinheiro";
    if (t === "km") return "km";
    if (t === "acompanhantes") return "inteiro";
    if (t.indexOf("data") === 0) return "data";
    return "texto";
  }

  /* Recebe a tabela de textos (primeira linha = títulos) e devolve:
       { colunas: [{titulo, tipo}], registros: [[valor, ...]], problemas: ["..."] }
     Os valores já saem como número, data ou texto limpo (sem acento quebrado). */
  function tratar(linhas) {
    if (!linhas || linhas.length < 2) throw new Error("Não encontrei corridas no arquivo (só o título ou nada).");
    var colunas = linhas[0].map(function (t) {
      var titulo = String(corrigirTexto(String(t))).trim();
      return { titulo: titulo, tipo: tipoDaColuna(titulo) };
    });
    var problemas = [];
    var registros = [];
    for (var i = 1; i < linhas.length; i++) {
      var crua = linhas[i];
      var reg = colunas.map(function (col, k) {
        var v = crua[k] === undefined ? "" : crua[k];
        if (col.tipo === "texto") {
          if (v instanceof Date) return v;
          return String(corrigirTexto(String(v))).trim();
        }
        if (String(v).trim() === "") return null;
        var r = col.tipo === "data" ? paraData(v) : paraNumero(v);
        if (r === null) problemas.push("Linha " + (i + 1) + ", coluna \"" + col.titulo + "\": não entendi o valor \"" + v + "\".");
        return r;
      });
      registros.push(reg);
    }
    return { colunas: colunas, registros: registros, problemas: problemas };
  }

  /* ==========================================================================
     3. SOMAR
     ========================================================================== */

  /* Soma em centavos para não acumular erro de arredondamento (0,1 + 0,2 = 0,30). */
  function somaExata(lista) {
    var centavos = 0;
    lista.forEach(function (n) { if (typeof n === "number") centavos += Math.round(n * 100); });
    return centavos / 100;
  }

  function indiceDaColuna(dados, nome) {
    for (var i = 0; i < dados.colunas.length; i++) if (normalizar(dados.colunas[i].titulo) === normalizar(nome)) return i;
    return -1;
  }

  /* Agrupa os registros por uma coluna de texto e soma as colunas numéricas.
     Devolve [{ chave, corridas, somas: {titulo: total} }] do maior para o menor "Valor Total". */
  function agrupar(dados, nomeColuna) {
    var ix = indiceDaColuna(dados, nomeColuna);
    if (ix < 0) return [];
    var grupos = {}, ordem = [];
    dados.registros.forEach(function (reg) {
      var chave = String(reg[ix] || "").trim() || "(vazio)";
      if (!grupos[chave]) { grupos[chave] = []; ordem.push(chave); }
      grupos[chave].push(reg);
    });
    var principal = indiceDaColuna(dados, "Valor Total");
    var lista = ordem.map(function (chave) {
      var somas = {};
      dados.colunas.forEach(function (col, k) {
        if (col.tipo === "dinheiro" || col.tipo === "km") somas[col.titulo] = somaExata(grupos[chave].map(function (r) { return r[k]; }));
      });
      return { chave: chave, corridas: grupos[chave].length, somas: somas };
    });
    var titulo = principal >= 0 ? dados.colunas[principal].titulo : null;
    if (titulo) lista.sort(function (a, b) { return b.somas[titulo] - a.somas[titulo]; });
    return lista;
  }

  /* Totais gerais: quantidade de corridas e a soma de cada coluna de dinheiro/km. */
  function somar(dados) {
    var somas = {};
    dados.colunas.forEach(function (col, k) {
      if (col.tipo === "dinheiro" || col.tipo === "km") somas[col.titulo] = somaExata(dados.registros.map(function (r) { return r[k]; }));
    });
    return {
      corridas: dados.registros.length,
      somas: somas,
      porMotorista: agrupar(dados, "Motorista"),
      porStatus: agrupar(dados, "Status")
    };
  }

  /* ==========================================================================
     4. GERAR A PLANILHA FINAL (.xlsx)
     ========================================================================== */

  var FORMATO_DINHEIRO = '[$R$ -416] #,##0.00';
  var FORMATO_DATA = "dd/mm/yyyy hh:mm";

  function letraDaColuna(n) { // 1 -> A, 2 -> B ... 27 -> AA
    var s = "";
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  /* Monta o arquivo e devolve, em uma Promise, o conteúdo (ArrayBuffer) para baixar. */
  function montarXlsx(dados, totais) {
    var wb = new ExcelJS.Workbook();
    wb.creator = App.config.NOME_APP;
    wb.created = new Date();

    var corAzul = "FF0047FF";
    var borda = { style: "thin", color: { argb: "FFBFC5D2" } };
    var bordas = { top: borda, left: borda, bottom: borda, right: borda };

    /* ---------- Aba "Corridas" ---------- */
    var aba = wb.addWorksheet("Corridas", { views: [{ state: "frozen", ySplit: 1 }] });
    aba.addRow(dados.colunas.map(function (c) { return c.titulo; }));
    dados.registros.forEach(function (reg) { aba.addRow(reg); });

    var ultima = dados.registros.length + 1;     // última linha de corrida
    var linhaTotal = ultima + 1;

    /* Cabeçalho */
    aba.getRow(1).eachCell(function (cel) {
      cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corAzul } };
      cel.alignment = { vertical: "middle" };
      cel.border = bordas;
    });
    aba.getRow(1).height = 22;

    /* Formato e largura de cada coluna */
    dados.colunas.forEach(function (col, k) {
      var coluna = aba.getColumn(k + 1);
      var maior = col.titulo.length;
      dados.registros.forEach(function (r) {
        var v = r[k];
        var n = v instanceof Date ? 16 : v === null ? 0 : (typeof v === "number" ? 12 : String(v).length);
        if (n > maior) maior = n;
      });
      coluna.width = Math.min(Math.max(maior + 2, 10), 60);
      if (col.tipo === "dinheiro") coluna.numFmt = FORMATO_DINHEIRO;
      if (col.tipo === "data") coluna.numFmt = FORMATO_DATA;
      if (col.tipo === "km") coluna.numFmt = "0.00";
    });

    /* Linha de TOTAL: fórmula SOMA em cada coluna de dinheiro e km
       (com o resultado já gravado, para qualquer leitor mostrar o número). */
    var rowTotal = aba.getRow(linhaTotal);
    rowTotal.getCell(1).value = "TOTAL";
    dados.colunas.forEach(function (col, k) {
      if (col.tipo !== "dinheiro" && col.tipo !== "km") return;
      var L = letraDaColuna(k + 1);
      var cel = rowTotal.getCell(k + 1);
      cel.value = { formula: "SUM(" + L + "2:" + L + ultima + ")", result: totais.somas[col.titulo] };
      cel.numFmt = col.tipo === "dinheiro" ? FORMATO_DINHEIRO : "0.00";
    });
    rowTotal.eachCell({ includeEmpty: true }, function (cel, n) {
      if (n > dados.colunas.length) return;
      cel.font = { bold: true };
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFF" } };
      cel.border = bordas;
    });
    aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dados.colunas.length } };

    /* ---------- Aba "Resumo" ---------- */
    var res = wb.addWorksheet("Resumo");
    var titulosSoma = dados.colunas.filter(function (c) { return c.tipo === "dinheiro" || c.tipo === "km"; });

    function cabecalho(row) {
      row.eachCell(function (cel) {
        cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corAzul } };
      });
    }
    function formatoDe(titulo) {
      var col = dados.colunas.filter(function (c) { return c.titulo === titulo; })[0];
      return col && col.tipo === "dinheiro" ? FORMATO_DINHEIRO : "0.00";
    }
    function tabelaAgrupada(tituloBloco, rotulo, lista) {
      var t = res.addRow([tituloBloco]); t.font = { bold: true, size: 13 };
      var cab = res.addRow([rotulo, "Corridas"].concat(titulosSoma.map(function (c) { return c.titulo; })));
      cabecalho(cab);
      lista.forEach(function (g) {
        var r = res.addRow([g.chave, g.corridas].concat(titulosSoma.map(function (c) { return g.somas[c.titulo]; })));
        titulosSoma.forEach(function (c, i) { r.getCell(3 + i).numFmt = formatoDe(c.titulo); });
      });
      var tot = res.addRow(["TOTAL", totais.corridas].concat(titulosSoma.map(function (c) { return totais.somas[c.titulo]; })));
      tot.font = { bold: true };
      titulosSoma.forEach(function (c, i) { tot.getCell(3 + i).numFmt = formatoDe(c.titulo); });
      res.addRow([]);
    }
    tabelaAgrupada("Por motorista", "Motorista", totais.porMotorista);
    tabelaAgrupada("Por status", "Status", totais.porStatus);
    res.getColumn(1).width = 30;
    for (var j = 2; j <= titulosSoma.length + 2; j++) res.getColumn(j).width = 18;

    return wb.xlsx.writeBuffer();
  }

  /* Tudo em um passo: lê, trata, soma e já devolve a planilha pronta.
     Usado pela tela do gestor. */
  function processar(buffer, nome) {
    return lerArquivo(buffer, nome).then(function (lido) {
      var dados = tratar(lido.linhas);
      var totais = somar(dados);
      return montarXlsx(dados, totais).then(function (xlsx) {
        return { dados: dados, totais: totais, avisos: lido.avisos, problemas: dados.problemas, xlsx: xlsx };
      });
    });
  }

  return {
    corrigirTexto: corrigirTexto,
    lerCsvTexto: lerCsvTexto,
    lerArquivo: lerArquivo,
    tratar: tratar,
    somar: somar,
    montarXlsx: montarXlsx,
    processar: processar,
    paraNumero: paraNumero,
    paraData: paraData
  };
})();
