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
    $("ver-senha").textContent = mostrarSenha ? "🙈" : "👁";
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
    return Promise.all([sb.rpc("dono_resumo"), sb.rpc("dono_empresas"), sb.rpc("dono_cadastros")]).then(function (rs) {
      var falha = rs.filter(function (r) { return r.error; })[0];
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

  function desenharCadastros() {
    var situacao = $("filtro-situacao").value;
    var lista = estado.cadastros.filter(function (c) {
      return (!situacao || c.status === situacao) && achou([c.nome_responsavel, c.empresa_nome, c.email, c.documento, c.celular, c.plano_nome]);
    });
    $("cont-cadastros").textContent = estado.cadastros.length;
    $("tabela-cadastros").innerHTML = lista.length ? lista.map(function (c) {
      var zap = soNumeros(c.celular);
      return "<tr>" +
        '<td data-rotulo="Quando" class="nao-quebra">' + dataHora(c.criado_em) + "</td>" +
        '<td data-rotulo="Responsável">' + escapar(c.nome_responsavel) + "</td>" +
        '<td data-rotulo="Empresa">' + escapar(c.empresa_nome) + "</td>" +
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

  function desenhar() {
    desenharIndicadores();
    desenharEmpresas();
    desenharCadastros();
  }

  document.querySelectorAll(".aba").forEach(function (botao) {
    botao.addEventListener("click", function () {
      estado.aba = botao.getAttribute("data-aba");
      document.querySelectorAll(".aba").forEach(function (b) { b.classList.toggle("ativo", b === botao); });
      document.querySelectorAll("[data-painel]").forEach(function (p) { p.hidden = p.getAttribute("data-painel") !== estado.aba; });
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
