/* =============================================================================
   cadastro.js — COMPORTAMENTO DA PÁGINA DE CADASTRO (cadastro.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Preparação (conexão com o Supabase, telas e ajudantes)
     2. Login com Google ou Microsoft
     3. Formulário (validação e gravação em "cadastros")
     4. Cadastro recebido (resumo e ida para o pagamento)
     5. Início: descobre em que passo a pessoa está

   O login usa uma "gaveta" própria no navegador (storageKey) para NÃO se misturar
   com o login do painel do gestor, que fica no mesmo site.
   O banco confere tudo de novo (banco/05-cadastro-assinantes.sql).
   ============================================================================= */

(function () {
  var cfg = window.CONFIG || {};
  var V = window.Validacao;
  var planos = cfg.planos || [];

  /* ==========================================================================
     1. PREPARAÇÃO
     ========================================================================== */
  var sb = window.supabase.createClient(cfg.supabase.url, cfg.supabase.chavePublica, {
    auth: { storageKey: "sb-landing-cadastro", flowType: "pkce", persistSession: true, detectSessionInUrl: true }
  });

  function $(id) { return document.getElementById(id); }
  var TELAS = ["estado-carregando", "estado-entrar", "estado-recusado", "estado-form", "estado-pronto"];
  function mostrar(tela) { TELAS.forEach(function (t) { $(t).hidden = t !== tela; }); }

  function mensagem(id, texto, tipo) {
    var el = $(id);
    el.textContent = texto || "";
    el.className = "mensagem" + (tipo ? " " + tipo : "");
  }

  var parametros = new URLSearchParams(location.search);
  function planoDaUrl() {
    var id = parametros.get("plano");
    return planos.some(function (p) { return p.id === id; }) ? id : (planos[0] || {}).id;
  }
  var tipos = cfg.tiposEmpresa || [];
  function tipoDaUrl() {
    var id = parametros.get("tipo");
    return tipos.some(function (t) { return t.id === id; }) ? id : "";
  }
  function tipoPorId(id) { return tipos.filter(function (t) { return t.id === id; })[0]; }
  var modos = cfg.modosBasico || [];
  function modoDaUrl() {
    var id = parametros.get("modo");
    return modos.some(function (m) { return m.id === id; }) ? id : "equipe";
  }
  function modoPorId(id) { return modos.filter(function (m) { return m.id === id; })[0]; }
  function planoPorId(id) { return planos.filter(function (p) { return p.id === id; })[0]; }

  var usuario = null;        // usuário logado (Supabase)
  var cadastroAtual = null;  // linha de "cadastros" dele, se já existir

  document.querySelectorAll("[data-marca]").forEach(function (el) { el.textContent = cfg.marca; });
  document.title = "Cadastro — " + cfg.marca;
  $("ano").textContent = new Date().getFullYear();

  /* ==========================================================================
     2. LOGIN COM GOOGLE OU MICROSOFT
     ========================================================================== */
  var BOTOES = { google: "entrar-google", azure: "entrar-microsoft" }; // "azure" é o nome da Microsoft no Supabase

  /* Volta para esta mesma página (com o plano escolhido) depois do login.
     Esse endereço precisa estar liberado no Supabase (veja o guia em banco/). */
  function enderecoDeVolta() {
    return location.origin + location.pathname + "?plano=" + encodeURIComponent(planoDaUrl() || "") + "&tipo=" + encodeURIComponent(tipoDaUrl()) + "&modo=" + encodeURIComponent(modoDaUrl());
  }

  function entrarCom(provedor) {
    mensagem("mensagem-entrar", "Abrindo o login…");
    sb.auth.signInWithOAuth({
      provider: provedor,
      options: {
        redirectTo: enderecoDeVolta(),
        scopes: provedor === "azure" ? "email" : undefined,
        queryParams: { prompt: "select_account" }   // deixa escolher qual conta usar
      }
    }).then(function (r) {
      if (r.error) mensagem("mensagem-entrar", "Não foi possível abrir o login: " + r.error.message, "erro");
    });
  }

  /* Pergunta ao Supabase quais logins já foram ativados e desliga os botões dos outros. */
  function conferirProvedores() {
    return fetch(cfg.supabase.url + "/auth/v1/settings", { headers: { apikey: cfg.supabase.chavePublica } })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        var ativos = s.external || {};
        Object.keys(BOTOES).forEach(function (prov) {
          if (ativos[prov]) return;
          var botao = $(BOTOES[prov]);
          botao.disabled = true;
          botao.querySelector("span").insertAdjacentHTML("beforeend", "<small>Disponível em breve</small>");
        });
      })
      .catch(function () { /* sem a consulta, os botões ficam ativos e o erro aparece ao clicar */ });
  }

  Object.keys(BOTOES).forEach(function (prov) {
    $(BOTOES[prov]).addEventListener("click", function () { entrarCom(prov); });
  });

  function sair() {
    return sb.auth.signOut().then(function () {
      usuario = null;
      cadastroAtual = null;
      mostrar("estado-entrar");
    });
  }
  ["trocar-conta", "sair-form", "sair-pronto"].forEach(function (id) { $(id).addEventListener("click", sair); });

  /* ==========================================================================
     3. FORMULÁRIO
     ========================================================================== */
  function desenharPlanos(idSelecionado) {
    $("cd-plano").innerHTML = planos.map(function (p) {
      return '<option value="' + V.escapar(p.id) + '"' + (p.id === idSelecionado ? " selected" : "") + ">" +
        V.escapar(p.nome) + " — " + V.moeda(p.preco) + "/mês</option>";
    }).join("");
  }

  /* Sozinho x equipe: só no plano Básico (nos outros o modo é sempre "equipe"). */
  function desenharModos(idSelecionado) {
    $("opcoes-modo").innerHTML = modos.map(function (m) {
      return '<label class="opcao-modo"><input type="radio" name="modo" value="' + V.escapar(m.id) + '"' + (m.id === idSelecionado ? " checked" : "") + " />" +
        "<span><b>" + V.escapar(m.nome) + "</b>" + V.escapar(m.descricao) + "</span></label>";
    }).join("");
  }
  function modoEscolhido() {
    if ($("cd-plano").value !== "basico") return "equipe";
    var marcado = document.querySelector('input[name="modo"]:checked');
    return marcado ? marcado.value : "equipe";
  }
  function mostrarModos() { $("grupo-modo").hidden = $("cd-plano").value !== "basico"; }
  $("cd-plano").addEventListener("change", mostrarModos);

  function desenharTipos(idSelecionado) {
    $("cd-tipo").innerHTML = '<option value="">Selecione...</option>' + tipos.map(function (t) {
      return '<option value="' + V.escapar(t.id) + '"' + (t.id === idSelecionado ? " selected" : "") + ">" + V.escapar(t.nome) + "</option>";
    }).join("");
  }

  function erroCampo(campo, texto) {
    var el = document.querySelector('[data-erro="' + campo + '"]');
    var entrada = { nome: "cd-nome", empresa: "cd-empresa", tipo: "cd-tipo", documento: "cd-documento", celular: "cd-celular" }[campo];
    el.textContent = texto || "";
    $(entrada).classList.toggle("invalido", !!texto);
    return !texto;
  }

  function validarFormulario() {
    var ok = true;
    ok = erroCampo("nome", $("cd-nome").value.trim().split(/\s+/).length < 2 ? "Informe nome e sobrenome." : "") && ok;
    ok = erroCampo("empresa", $("cd-empresa").value.trim().length < 2 ? "Informe o nome da empresa." : "") && ok;
    ok = erroCampo("tipo", $("cd-tipo").value ? "" : "Escolha o tipo de empresa.") && ok;
    ok = erroCampo("documento", V.documentoValido($("cd-documento").value) ? "" : "CPF ou CNPJ inválido.") && ok;
    ok = erroCampo("celular", V.celularValido($("cd-celular").value) ? "" : "Informe o celular com DDD (11 números).") && ok;
    return ok;
  }

  /* Abre o formulário, vazio (primeiro cadastro) ou com os dados já salvos (correção). */
  function abrirFormulario() {
    var c = cadastroAtual;
    $("email-logado").textContent = usuario.email;
    var nomeDoLogin = (usuario.user_metadata && (usuario.user_metadata.full_name || usuario.user_metadata.name)) || "";
    $("cd-nome").value = c ? c.nome_responsavel : nomeDoLogin;
    $("cd-empresa").value = c ? c.empresa_nome : "";
    $("cd-documento").value = c ? V.formatarDocumento(c.documento) : "";
    $("cd-celular").value = c ? V.formatarTelefone(c.celular) : "";
    desenharPlanos(c ? c.plano : planoDaUrl());
    desenharTipos(c ? c.tipo_empresa : tipoDaUrl());
    desenharModos(c ? c.modo_uso : modoDaUrl());
    mostrarModos();
    ["nome", "empresa", "tipo", "documento", "celular"].forEach(function (campo) { erroCampo(campo, ""); });
    mensagem("mensagem-form", "");
    mostrar("estado-form");
  }

  $("cd-documento").addEventListener("input", function (ev) { ev.target.value = V.formatarDocumento(ev.target.value); });
  $("cd-celular").addEventListener("input", function (ev) { ev.target.value = V.formatarTelefone(ev.target.value); });

  /* Traduz o erro do banco para uma mensagem clara. */
  function textoDoErro(e) {
    if (e.code === "23505") return "Este CPF ou CNPJ já está cadastrado. Se for o seu, entre com a conta que usou na primeira vez.";
    if (e.code === "P0001") return e.message;   // mensagens já escritas em português pelo banco
    return "Não foi possível salvar agora. Tente novamente.";
  }

  $("estado-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    mensagem("mensagem-form", "");
    if (!validarFormulario()) return;

    var dados = {
      nome_responsavel: $("cd-nome").value.trim(),
      empresa_nome: $("cd-empresa").value.trim(),
      documento: V.soNumeros($("cd-documento").value),
      celular: V.soNumeros($("cd-celular").value),
      plano: $("cd-plano").value,
      tipo_empresa: $("cd-tipo").value,
      modo_uso: modoEscolhido()
    };
    var botao = $("botao-salvar");
    botao.disabled = true;
    botao.textContent = "Salvando…";

    var consulta = cadastroAtual
      ? sb.from("cadastros").update(dados).eq("user_id", usuario.id)
      : sb.from("cadastros").insert(Object.assign({ user_id: usuario.id }, dados));
    consulta.select().single().then(function (r) {
      if (r.error) throw r.error;
      cadastroAtual = r.data;
      desenharPronto();
    }).catch(function (e) {
      mensagem("mensagem-form", textoDoErro(e), "erro");
    }).then(function () {
      botao.disabled = false;
      botao.textContent = "Salvar e continuar";
    });
  });

  /* ==========================================================================
     4. CADASTRO RECEBIDO
     ========================================================================== */
  function desenharPronto() {
    var c = cadastroAtual;
    var plano = planoPorId(c.plano);
    var linhas = [
      ["Responsável", c.nome_responsavel],
      ["Empresa", c.empresa_nome],
      ["Tipo", (tipoPorId(c.tipo_empresa) || {}).nome || "—"],
      [c.tipo_documento === "cnpj" ? "CNPJ" : "CPF", V.formatarDocumento(c.documento)],
      ["Celular", V.formatarTelefone(c.celular)],
      ["E-mail", c.email],
      ["Plano", (plano ? plano.nome + " — " + V.moeda(plano.preco) + "/mês" : c.plano) +
        (c.plano === "basico" ? " (" + ((modoPorId(c.modo_uso) || {}).nome || "") + ")" : "")]
    ];
    $("resumo-cadastro").innerHTML = linhas.map(function (l) {
      return "<div><dt>" + V.escapar(l[0]) + "</dt><dd>" + V.escapar(l[1]) + "</dd></div>";
    }).join("");
    $("ir-pagamento").href = "pagamento.html?plano=" + encodeURIComponent(c.plano);
    mostrar("estado-pronto");
  }
  $("editar-dados").addEventListener("click", abrirFormulario);

  /* ==========================================================================
     5. INÍCIO
     ========================================================================== */
  function iniciar() {
    // Se o Google/Microsoft devolveu um erro (ex.: a pessoa cancelou), mostra na tela de entrada.
    var erroLogin = parametros.get("error_description");

    return sb.auth.getSession().then(function (r) {
      var sessao = r.data && r.data.session;
      if (!sessao) {
        mostrar("estado-entrar");
        if (erroLogin) mensagem("mensagem-entrar", "Não foi possível entrar: " + erroLogin.replace(/\+/g, " "), "erro");
        return;
      }
      usuario = sessao.user;

      if (!V.emailPessoalValido(usuario.email)) {
        $("email-recusado").textContent = usuario.email;
        mostrar("estado-recusado");
        return;
      }
      return sb.from("cadastros").select("*").maybeSingle().then(function (resp) {
        if (resp.error) throw resp.error;
        cadastroAtual = resp.data;
        if (cadastroAtual) desenharPronto(); else abrirFormulario();
      });
    }).catch(function () {
      mostrar("estado-entrar");
      mensagem("mensagem-entrar", "Não foi possível carregar agora. Atualize a página.", "erro");
    });
  }

  conferirProvedores();
  iniciar();
})();
