/* =============================================================================
   master.js — COMPORTAMENTO DO PAINEL DO DONO (master/index.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação (conexão com o Supabase e ajudantes)
     2. Entrar e sair
     3. Carregar os dados (resumo, empresas e cadastros)
     4. Desenhar (indicadores, tabelas e janela de detalhe)
     5. Início

   O login usa uma "gaveta" própria no navegador (storageKey) para não se misturar
   com o login do painel do gestor. Quem manda de verdade é o banco: as funções
   dono_* só respondem para quem está na tabela "donos"; aqui a tela só mostra ou
   esconde. Todos os textos vindos do banco passam por escapar() antes de ir ao HTML.
   ============================================================================= */

(function () {
  /* Ícones Lucide (ISC) usados só aqui: o painel do dono não carrega js/icones.js. */
  var ICONE_OLHO = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /> <circle cx="12" cy="12" r="3" /></svg>';
  var ICONE_OLHO_FECHADO = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /> <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /> <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /> <path d="m2 2 20 20" /></svg>';

  var cfg = App.supabaseConfig;

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var sb = window.supabase.createClient(cfg.url, cfg.chavePublica, {
    auth: { storageKey: "sb-master", persistSession: true, autoRefreshToken: true }
  });

  function $(id) { return document.getElementById(id); }
  function escapar(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function moeda(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  /* Datas "só do dia" (2026-10-25) são lidas como dia local, para não aparecer o dia anterior por causa do fuso. */
  function data(iso) {
    if (!iso) return "—";
    var so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return (so ? new Date(+so[1], +so[2] - 1, +so[3]) : new Date(iso)).toLocaleDateString("pt-BR");
  }
  function dataHora(iso) {
    return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  }
  function soNumeros(t) { return String(t || "").replace(/\D/g, ""); }
  function formatarDocumento(t) {
    var d = soNumeros(t);
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    return t || "—";
  }
  function formatarCelular(t) {
    var d = soNumeros(t);
    return d.length === 11 ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3") : (t || "—");
  }

  var ROTULO_SITUACAO = {
    ativa: "Ativa", teste: "Em teste", suspensa: "Suspensa", cancelada: "Cancelada",
    aguardando_pagamento: "Aguardando pagamento", ativado: "Ativado", cancelado: "Cancelado"
  };
  function selo(situacao) {
    return '<span class="selo selo-' + escapar(situacao) + '">' + escapar(ROTULO_SITUACAO[situacao] || situacao) + "</span>";
  }

  var estado = { resumo: null, empresas: [], cadastros: [], aba: "empresas", email: "" };
  var temporizador = null;

  /* ==========================================================================
     2. ENTRAR E SAIR
     ========================================================================== */
  function mostrar(tela) {
    $("tela-entrar").hidden = tela !== "entrar";
    $("tela-painel").hidden = tela !== "painel";
  }

  /* Confere no banco se esta conta é de dono. Sem isso, nada é mostrado. */
  function confirmarDono() {
    return sb.rpc("eu_sou_dono").then(function (r) { return !r.error && r.data === true; });
  }

  function sair(mensagem) {
    clearInterval(temporizador);
    temporizador = null;
    estado = { resumo: null, empresas: [], cadastros: [], aba: "empresas", email: "" };
    /* Esvazia a tela, para nada ficar escondido no HTML depois de sair. */
    ["indicadores", "tabela-empresas", "tabela-cadastros", "modal-corpo"].forEach(function (id) { $(id).innerHTML = ""; });
    $("usuario-email").textContent = "";
    $("modal").hidden = true;
    return sb.auth.signOut().then(function () {
      $("en-senha").value = "";
      $("erro-entrar").textContent = mensagem || "";
      mostrar("entrar");
    });
  }

  $("ver-senha").addEventListener("click", function () {
    var campo = $("en-senha");
    var mostrarSenha = campo.type === "password";
    campo.type = mostrarSenha ? "text" : "password";
    $("ver-senha").innerHTML = mostrarSenha ? ICONE_OLHO_FECHADO : ICONE_OLHO;
    $("ver-senha").title = mostrarSenha ? "Esconder senha" : "Mostrar senha";
    campo.focus();
  });

  $("form-entrar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var botao = $("botao-entrar");
    $("erro-entrar").textContent = "";
    botao.disabled = true;
    botao.textContent = "Entrando…";
    sb.auth.signInWithPassword({ email: $("en-email").value.trim(), password: $("en-senha").value })
      .then(function (r) {
        if (r.error) throw new Error("E-mail ou senha incorretos.");
        return confirmarDono().then(function (ehDono) {
          if (!ehDono) return sair("Esta conta não tem acesso a este painel.").then(function () { return false; });
          return iniciarPainel(r.data.user.email).then(function () { return true; });
        });
      })
      .catch(function (e) { $("erro-entrar").textContent = e.message || "Não foi possível entrar."; })
      .then(function () { botao.disabled = false; botao.textContent = "Entrar"; });
  });

  $("botao-sair").addEventListener("click", function () { sair(""); });

  /* ==========================================================================
     3. CARREGAR OS DADOS
     ========================================================================== */
  function carregar() {
    $("erro-painel").textContent = "";
    return Promise.all([sb.rpc("dono_resumo"), sb.rpc("dono_empresas"), sb.rpc("dono_cadastros"), sb.rpc("dono_uso", { p_dias: 30 })]).then(function (rs) {
      estado.uso = rs[3].error ? null : rs[3].data;   // a aba de uso é um extra: se faltar o banco/25, o resto continua
      var falha = rs.slice(0, 3).filter(function (r) { return r.error; })[0];
      if (falha) {
        if (/Acesso negado/i.test(falha.error.message || "")) return sair("Esta conta não tem acesso a este painel.");
        throw new Error("Não foi possível carregar os dados agora.");
      }
      estado.resumo = rs[0].data;
      estado.empresas = rs[1].data || [];
      estado.cadastros = rs[2].data || [];
      desenhar();
      $("rodape-atualizado").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + " · a tela se atualiza sozinha a cada minuto.";
    }).catch(function (e) { $("erro-painel").textContent = e.message; });
  }

  function iniciarPainel(email) {
    estado.email = email || "";
    $("usuario-email").textContent = estado.email;
    mostrar("painel");
    clearInterval(temporizador);
    temporizador = setInterval(carregar, 60000);
    return carregar();
  }

  $("botao-atualizar").addEventListener("click", function () { carregar(); });

  /* ==========================================================================
     4. DESENHAR
     ========================================================================== */
  function indicador(rotulo, valor, detalhe, destaque) {
    return '<div class="indicador' + (destaque ? " indicador-destaque" : "") + '"><div class="indicador-rotulo">' + escapar(rotulo) + "</div>" +
           '<div class="indicador-valor">' + escapar(valor) + '</div><div class="indicador-detalhe">' + escapar(detalhe || "") + "</div></div>";
  }

  function desenharIndicadores() {
    var r = estado.resumo || {};
    var porPlano = (r.por_plano || []).map(function (p) { return p.qtd + " " + p.plano; }).join(" · ");
    $("indicadores").innerHTML = [
      indicador("Receita mensal", moeda(r.receita_mensal), "empresas ativas com plano", true),
      indicador("Empresas ativas", r.empresas_ativas || 0, "de " + (r.empresas_total || 0) + " cadastradas" + (r.empresas_suspensas ? " · " + r.empresas_suspensas + " suspensa(s)" : "")),
      indicador("Cadastros novos", r.cadastros_aguardando || 0, "aguardando pagamento"),
      indicador("Corridas (30 dias)", r.corridas_30d || 0, "em todas as empresas"),
      indicador("Motoristas", r.motoristas || 0, "em todas as empresas"),
      indicador("Clientes", r.clientes || 0, porPlano || "—")
    ].join("");
  }

  function textoBusca() { return $("busca").value.trim().toLowerCase(); }
  function achou(campos) { var b = textoBusca(); return !b || campos.join(" ").toLowerCase().indexOf(b) !== -1; }

  function desenharEmpresas() {
    var situacao = $("filtro-situacao").value;
    var lista = estado.empresas.filter(function (e) {
      return (!situacao || e.assinatura_status === situacao) && achou([e.nome, e.sigla, e.cidade, e.uf, e.plano_nome]);
    });
    $("cont-empresas").textContent = estado.empresas.length;
    $("tabela-empresas").innerHTML = lista.length ? lista.map(function (e) {
      return '<tr class="clicavel" data-empresa="' + escapar(e.id) + '">' +
        '<td data-rotulo="Empresa"><div class="empresa-celula"><strong>' + escapar(e.nome) + "</strong><small>" +
          escapar([e.cidade, e.uf].filter(Boolean).join("/") || "—") + "</small></div></td>" +
        '<td data-rotulo="Plano">' + escapar(e.plano_nome || "Sem plano") + "</td>" +
        '<td data-rotulo="Situação">' + selo(e.assinatura_status) + "</td>" +
        '<td data-rotulo="Clientes" class="direita">' + e.clientes + "</td>" +
        '<td data-rotulo="Motoristas" class="direita">' + e.motoristas + "</td>" +
        '<td data-rotulo="Corridas 30 d" class="direita">' + e.corridas_30d + "</td>" +
        '<td data-rotulo="Última corrida" class="nao-quebra">' + dataHora(e.ultima_corrida) + "</td>" +
        '<td data-rotulo="Mensal" class="direita nao-quebra">' + (e.plano ? moeda(e.valor_mensal) : "—") + "</td>" +
      "</tr>";
    }).join("") : '<tr><td colspan="8" class="tabela-vazia">' + (estado.empresas.length ? "Nenhuma empresa encontrada." : "Nenhuma empresa cadastrada ainda.") + "</td></tr>";
  }

  var TIPOS = { taxi: "Táxi e executivos", van: "Vans e fretamento", onibus: "Ônibus", frota: "Frota de veículos", interno: "Transporte interno", outro: "Outro" };
  function tipoTexto(id) { return TIPOS[id] || "—"; }

  function desenharCadastros() {
    var situacao = $("filtro-situacao").value;
    var lista = estado.cadastros.filter(function (c) {
      return (!situacao || c.status === situacao) && achou([c.nome_responsavel, c.empresa_nome, c.email, c.documento, c.celular, c.plano_nome, tipoTexto(c.tipo_empresa)]);
    });
    $("cont-cadastros").textContent = estado.cadastros.length;
    $("tabela-cadastros").innerHTML = lista.length ? lista.map(function (c) {
      var zap = soNumeros(c.celular);
      return "<tr>" +
        '<td data-rotulo="Quando" class="nao-quebra">' + dataHora(c.criado_em) + "</td>" +
        '<td data-rotulo="Responsável">' + escapar(c.nome_responsavel) + "</td>" +
        '<td data-rotulo="Empresa"><div class="empresa-celula">' + escapar(c.empresa_nome) + "<small>" + escapar(tipoTexto(c.tipo_empresa) + (c.modo_uso === "individual" ? " · trabalha sozinho" : "")) + "</small></div></td>" +
        '<td data-rotulo="' + (c.tipo_documento === "cnpj" ? "CNPJ" : "CPF") + '" class="nao-quebra">' + escapar(formatarDocumento(c.documento)) + "</td>" +
        '<td data-rotulo="Contato"><div class="empresa-celula">' + escapar(formatarCelular(c.celular)) + "<small>" + escapar(c.email) + "</small></div>" +
          (zap.length >= 10 ? ' <a class="botao botao-borda botao-pequeno" target="_blank" rel="noopener" href="https://wa.me/55' + zap + '">WhatsApp</a>' : "") + "</td>" +
        '<td data-rotulo="Plano">' + escapar(c.plano_nome || c.plano) + "</td>" +
        '<td data-rotulo="Situação">' + selo(c.status) + "</td>" +
      "</tr>";
    }).join("") : '<tr><td colspan="7" class="tabela-vazia">' + (estado.cadastros.length ? "Nenhum cadastro encontrado." : "Nenhum cadastro novo ainda.") + "</td></tr>";
  }

  /* O filtro de situação muda conforme a aba aberta. */
  function preencherFiltro() {
    var opcoes = estado.aba === "empresas"
      ? [["", "Todas as situações"], ["ativa", "Ativas"], ["teste", "Em teste"], ["suspensa", "Suspensas"], ["cancelada", "Canceladas"]]
      : [["", "Todas as situações"], ["aguardando_pagamento", "Aguardando pagamento"], ["ativado", "Ativados"], ["cancelado", "Cancelados"]];
    $("filtro-situacao").innerHTML = opcoes.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("");
  }


  /* ==========================================================================
     4b. USO E LIMITES (banco/25-monitor-de-uso.sql)
     Mostra o quanto de cada plano gratuito já foi usado, para decidir se é hora de pagar um plano maior.
     ========================================================================== */
  var LIMITES = {
    banco: 524288000,        // Supabase gratuito: 500 MB de banco
    usuarios: 50000,         // Supabase gratuito: 50 mil usuários ativos por mês
    mapas: 10000,            // Google Maps: 10 mil carregamentos grátis por mês
    emails: 100,             // Gmail pelo Apps Script: cerca de 100 e-mails por dia
    pushes: 20000            // Apps Script: cerca de 20 mil chamadas externas por dia
  };
  function num(v) { return Number(v || 0).toLocaleString("pt-BR"); }
  function tamanho(b) {
    b = Number(b || 0);
    return b >= 1073741824 ? (b / 1073741824).toFixed(2).replace(".", ",") + " GB"
         : b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.round(b / 1024) + " KB";
  }
  function diaCurto(iso) { var p = String(iso).split("-"); return p[2] + "/" + p[1]; }
  function somar(dias, campo) { return dias.reduce(function (t, d) { return t + Number(d[campo] || 0); }, 0); }

  function cartaoLimite(titulo, usado, limite, textoUsado, dica, extra) {
    var pct = limite ? usado / limite * 100 : 0;
    var nivel = pct >= 90 ? "alto" : pct >= 70 ? "medio" : "ok";
    var situacao = pct >= 90 ? "Perto do limite" : pct >= 70 ? "Atenção" : "Tranquilo";
    return '<div class="uso-cartao uso-' + nivel + '">' +
      '<div class="uso-topo"><span>' + titulo + '</span><span class="uso-selo">' + situacao + "</span></div>" +
      '<div class="uso-valor">' + textoUsado + "</div>" +
      '<div class="uso-barra"><i style="width:' + Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct)).toFixed(1) + '%"></i></div>' +
      '<div class="uso-rodape">' + pct.toFixed(pct < 10 ? 1 : 0).replace(".", ",") + "% do limite gratuito" + (extra ? " · " + extra : "") + "</div>" +
      '<div class="uso-dica">' + dica + "</div></div>";
  }

  function desenharUso() {
    var u = estado.uso;
    if (!u) {
      $("uso-intro").textContent = "O monitor de uso ainda não está ativo: aplique o arquivo banco/25-monitor-de-uso.sql no Supabase.";
      $("uso-limites").innerHTML = ""; $("uso-dias").innerHTML = ""; $("uso-tabelas").innerHTML = ""; $("uso-links").innerHTML = "";
      return;
    }
    var dias = u.dias || [];                           // do mais antigo ao de hoje
    var hoje = dias[dias.length - 1] || {};
    var mapas30 = somar(dias, "google_maps");
    var custoMapas = Math.max(0, mapas30 - LIMITES.mapas) / 1000 * 7;
    $("uso-intro").textContent = "Contadores de Google Maps, e-mails, push e logins" + (u.desde ? " começam em " + data(u.desde + "T12:00:00") : "") +
      ". Corridas, notificações, mensagens e cadastros vêm direto do banco, com todo o histórico.";

    $("uso-limites").innerHTML =
      cartaoLimite("Banco de dados (Supabase)", u.banco.bytes, u.banco.limite || LIMITES.banco,
        tamanho(u.banco.bytes) + " <small>de " + tamanho(u.banco.limite || LIMITES.banco) + "</small>",
        "Acima de 70%, vale pensar no plano Pro do Supabase (US$ 25/mês, 8 GB). O plano gratuito também pausa por inatividade.",
        "seus dados: " + tamanho(u.banco.bytes_app)) +
      cartaoLimite("Usuários ativos (30 dias)", u.usuarios.ativos_30d, u.usuarios.limite || LIMITES.usuarios,
        num(u.usuarios.ativos_30d) + " <small>de " + num(u.usuarios.limite || LIMITES.usuarios) + "</small>",
        "Conta quem entrou nos últimos 30 dias. Total de logins criados: " + num(u.usuarios.total) + ".") +
      cartaoLimite("Google Maps (30 dias)", mapas30, LIMITES.mapas,
        num(mapas30) + " <small>de " + num(LIMITES.mapas) + "</small>",
        "Cada mapa aberto no painel do gestor conta 1. Depois do limite: cerca de US$ 7 por 1.000." +
        (custoMapas > 0 ? " Estimativa do excesso: US$ " + custoMapas.toFixed(2).replace(".", ",") + "." : "") +
        " Estimativa nossa; o Google tem o número oficial.",
        "hoje: " + num(hoje.google_maps)) +
      cartaoLimite("E-mails hoje (Gmail do script)", hoje.email || 0, LIMITES.emails,
        num(hoje.email) + " <small>de ~" + num(LIMITES.emails) + " por dia</small>",
        "Limite da conta Google dona do script, somando todas as empresas. Perto de 70%, migre para domínio próprio + Resend.") +
      cartaoLimite("Push hoje (Apps Script)", hoje.push || 0, LIMITES.pushes,
        num(hoje.push) + " <small>de ~" + num(LIMITES.pushes) + " por dia</small>",
        "Cada aparelho avisado conta 1 chamada. Perto de 70%, troque o envio por uma Edge Function do Supabase.",
        num(hoje.push_chamadas) + " pedidos ao script hoje");

    /* Tabela dia a dia, do mais recente ao mais antigo, com barrinhas proporcionais ao maior valor da coluna. */
    var colunas = [["google_maps", "Google Maps"], ["login", "Logins"], ["email", "E-mails"], ["push", "Push"],
                   ["corridas", "Corridas"], ["notificacoes", "Notificações"], ["mensagens", "Mensagens"], ["cadastros", "Cadastros"]];
    var maximos = {};
    colunas.forEach(function (c) { maximos[c[0]] = Math.max.apply(null, dias.map(function (d) { return Number(d[c[0]] || 0); }).concat([1])); });
    var recentes = dias.slice().reverse().slice(0, 14);
    $("uso-dias").innerHTML = "<thead><tr><th>Dia</th>" + colunas.map(function (c) { return '<th class="direita">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      recentes.map(function (d) {
        return "<tr><td>" + diaCurto(d.dia) + "</td>" + colunas.map(function (c) {
          var v = Number(d[c[0]] || 0);
          return '<td class="direita uso-celula"><i style="width:' + (v / maximos[c[0]] * 100).toFixed(0) + '%"></i><span>' + (v ? num(v) : "·") + "</span></td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody>" +
      '<tfoot><tr><td>Total ' + dias.length + " dias</td>" + colunas.map(function (c) { return '<td class="direita">' + num(somar(dias, c[0])) + "</td>"; }).join("") + "</tr></tfoot>";

    var maiorTabela = Math.max.apply(null, (u.banco.tabelas || []).map(function (t) { return t.bytes; }).concat([1]));
    $("uso-tabelas").innerHTML = (u.banco.tabelas || []).map(function (t) {
      return '<div class="uso-linha"><span>' + escapar(t.nome) + '</span><div class="uso-barra pequena"><i style="width:' + (t.bytes / maiorTabela * 100).toFixed(0) + '%"></i></div><span class="suave">' + tamanho(t.bytes) + "</span></div>";
    }).join("") + '<p class="suave nota">O restante do tamanho total é do próprio Supabase (login, agendador, extensões).</p>';

    $("uso-links").innerHTML = [
      ["Supabase: uso do projeto", "https://supabase.com/dashboard/project/qjccecmfnwiypyivwwqb/reports"],
      ["Google Cloud: uso do Maps", "https://console.cloud.google.com/google/maps-apis/metrics"],
      ["Apps Script: execuções e erros", "https://script.google.com"],
      ["Firebase: projeto do push", "https://console.firebase.google.com/project/projetoalerta-d3334/overview"]
    ].map(function (l) { return '<a class="botao botao-borda botao-pequeno" target="_blank" rel="noopener" href="' + l[1] + '">' + l[0] + "</a>"; }).join("");
  }

  function desenhar() {
    desenharIndicadores();
    desenharEmpresas();
    desenharCadastros();
    desenharUso();
  }

  document.querySelectorAll(".aba").forEach(function (botao) {
    botao.addEventListener("click", function () {
      estado.aba = botao.getAttribute("data-aba");
      document.querySelectorAll(".aba").forEach(function (b) { b.classList.toggle("ativo", b === botao); });
      document.querySelectorAll("[data-painel]").forEach(function (p) { p.hidden = p.getAttribute("data-painel") !== estado.aba; });
      $("filtros").hidden = estado.aba === "uso";
      preencherFiltro();
      desenhar();
    });
  });
  $("busca").addEventListener("input", desenhar);
  $("filtro-situacao").addEventListener("change", desenhar);

  /* --- Janela de detalhe de uma empresa -------------------------------- */
  function fecharModal() { $("modal").hidden = true; }
  $("modal-fechar").addEventListener("click", fecharModal);
  $("modal").addEventListener("click", function (ev) { if (ev.target === $("modal")) fecharModal(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fecharModal(); });

  $("tabela-empresas").addEventListener("click", function (ev) {
    var linha = ev.target.closest("[data-empresa]");
    if (!linha) return;
    var e = estado.empresas.filter(function (x) { return x.id === linha.getAttribute("data-empresa"); })[0];
    if (!e) return;
    $("modal-titulo").textContent = e.nome;
    $("modal-corpo").innerHTML = '<dl class="lista-dados">' +
      "<dt>Situação</dt><dd>" + selo(e.assinatura_status) + "</dd>" +
      "<dt>Tipo de empresa</dt><dd>" + escapar(tipoTexto(e.tipo_empresa) + (e.modo_uso === "individual" ? " · trabalha sozinho" : "")) + "</dd>" +
      "<dt>Plano</dt><dd>" + escapar(e.plano_nome || "Sem plano definido") + (e.plano ? " · " + moeda(e.valor_mensal) + "/mês" : "") + "</dd>" +
      "<dt>Cidade</dt><dd>" + escapar([e.cidade, e.uf].filter(Boolean).join(" / ") || "—") + "</dd>" +
      "<dt>Cliente desde</dt><dd>" + data(e.criada_em) + "</dd>" +
      "<dt>Início da assinatura</dt><dd>" + data(e.assinatura_inicio) + "</dd>" +
      "<dt>Gestores (logins)</dt><dd>" + e.gestores + "</dd>" +
      "<dt>Clientes cadastrados</dt><dd>" + e.clientes + "</dd>" +
      "<dt>Motoristas</dt><dd>" + e.motoristas + "</dd>" +
      "<dt>Corridas (total)</dt><dd>" + e.corridas_total + "</dd>" +
      "<dt>Corridas (30 dias)</dt><dd>" + e.corridas_30d + "</dd>" +
      "<dt>Última corrida</dt><dd>" + dataHora(e.ultima_corrida) + "</dd></dl>" +
      '<p class="suave">Por privacidade, o painel mostra só números da empresa: o conteúdo das corridas, clientes e motoristas fica restrito a ela.</p>';
    $("modal").hidden = false;
  });

  /* ==========================================================================
     5. INÍCIO
     ========================================================================== */
  preencherFiltro();
  sb.auth.getSession().then(function (r) {
    var sessao = r.data && r.data.session;
    if (!sessao) { mostrar("entrar"); return; }
    return confirmarDono().then(function (ehDono) {
      if (!ehDono) return sair("Esta conta não tem acesso a este painel.");
      return iniciarPainel(sessao.user.email);
    });
  }).catch(function () { mostrar("entrar"); });
})();
