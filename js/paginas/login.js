/* =============================================================================
   paginas/login.js — COMPORTAMENTO DA TELA INICIAL (index.html)
   -----------------------------------------------------------------------------
   1. Prepara os dados de teste (na primeira vez).
   2. Preenche as listas de motoristas e clientes de teste.
   3. Ao clicar em "Entrar", guarda o perfil escolhido NESTA aba e abre a
      página correspondente em /paginas.
   4. "Entrar como gestor" e "Entrar como motorista" abrem uma janela de
      usuário e senha e fazem o login real no Supabase (js/auth-supabase.js).
      O cliente ainda é de teste (sem senha).
   ============================================================================= */

(function () {
  var ui = App.ui;

  App.banco.iniciar();
  document.getElementById("nome-app").textContent = App.config.NOME_APP;
  document.title = "Entrar • " + App.config.NOME_APP;

  /* Preenche a lista de clientes de teste. */
  function preencherListas() {
    ui.preencherSelect(document.getElementById("escolha-cliente"),
      App.banco.listarClientes().filter(function (c) { return c.ativo !== false; }).map(function (c) {
        return { valor: c.id, texto: c.nome + (c.empresa ? " (" + c.empresa + ")" : "") };
      }));
  }
  preencherListas();

  /* --- Botões "Entrar" ----------------------------------------------------- */
  /* Gestor e motorista: pedem usuário e senha antes de abrir a página. */
  document.getElementById("entrar-gestor").addEventListener("click", function () {
    abrirLogin({ titulo: "Entrar como gestor", texto: "Acesso do gestor da empresa.", papeis: ["gestor", "master"],
                 erroPapel: "Este usuário não é gestor.", destino: "paginas/gestor.html", tipo: "gestor" });
  });
  document.getElementById("entrar-motorista").addEventListener("click", function () {
    abrirLogin({ titulo: "Entrar como motorista", texto: "Use o usuário e a senha que a empresa passou para você.",
                 papeis: ["motorista"], erroPapel: "Este usuário não é motorista.",
                 destino: "paginas/motorista.html", tipo: "motorista" });
  });

  /* Janela de login. cfg = { titulo, texto, papeis, erroPapel, destino, tipo } */
  function abrirLogin(cfg) {
    var corpo = ui.abrirModal(cfg.titulo,
      '<form id="form-login" novalidate>' +
        '<p class="texto-suave texto-pequeno">' + cfg.texto + '</p>' +
        '<div class="grupo-campo"><label class="rotulo" for="login-usuario">Usuário</label>' +
          '<input class="campo" id="login-usuario" autocomplete="username" autocapitalize="none" spellcheck="false" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="login-senha">Senha</label>' +
          '<div class="campo-senha">' +
            '<input class="campo" id="login-senha" type="password" autocomplete="current-password" />' +
            '<button type="button" class="botao-olho" id="ver-senha" aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">👁</button>' +
          '</div></div>' +
        '<div class="erro-login" id="erro-login" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">Entrar</button>' +
        "</div>" +
      "</form>", { classe: "modal-pequeno" });

    /* Olho: alterna entre senha escondida e visível. */
    var campoSenha = corpo.querySelector("#login-senha");
    var botaoOlho = corpo.querySelector("#ver-senha");
    botaoOlho.addEventListener("click", function () {
      var mostrar = campoSenha.type === "password";
      campoSenha.type = mostrar ? "text" : "password";
      botaoOlho.textContent = mostrar ? "🙈" : "👁";
      botaoOlho.setAttribute("aria-pressed", mostrar ? "true" : "false");
      botaoOlho.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
      botaoOlho.title = mostrar ? "Esconder senha" : "Mostrar senha";
      campoSenha.focus();
    });

    corpo.querySelector("#form-login").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var erro = corpo.querySelector("#erro-login");
      var botao = corpo.querySelector('button[type="submit"]');
      erro.textContent = "";
      botao.disabled = true;
      botao.textContent = "Entrando…";
      App.auth.entrar(corpo.querySelector("#login-usuario").value, corpo.querySelector("#login-senha").value)
        .then(function (acesso) {
          if (cfg.papeis.indexOf(acesso.papel) === -1) {
            // Login certo, mas é de outro tipo de usuário: encerra e avisa.
            return App.auth.sair().then(function () { throw new Error(cfg.erroPapel); });
          }
          var sessao = { tipo: cfg.tipo, id: acesso.id, nome: acesso.nome, papel: acesso.papel, empresa: acesso.empresa };
          if (cfg.tipo !== "motorista") return sessao;
          // Motorista: o id da sessão passa a ser o do cadastro dele (tabela "motoristas").
          return App.auth.buscarMotorista().then(function (m) {
            sessao.id = m.id;
            sessao.nome = m.nome;
            sessao.dados = m; // usado para criar a cópia local (veja banco.garantirMotorista)
            return sessao;
          });
        })
        .then(function (sessao) {
          App.sessao.entrar(sessao);
          window.location.href = cfg.destino;
        })
        .catch(function (e) {
          erro.textContent = e.message || "Não foi possível entrar.";
          botao.disabled = false;
          botao.textContent = "Entrar";
          corpo.querySelector("#login-senha").value = "";
          corpo.querySelector("#login-senha").focus();
        });
    });

    corpo.querySelector("#login-usuario").focus();
  }

  document.getElementById("entrar-cliente").addEventListener("click", function () {
    var c = App.banco.buscarCliente(document.getElementById("escolha-cliente").value);
    App.sessao.entrar({ tipo: "cliente", id: c.id, nome: c.nome });
    window.location.href = "paginas/cliente.html";
  });

  /* --- Resetar dados de teste --------------------------------------------- */
  document.getElementById("resetar-dados").addEventListener("click", function () {
    ui.confirmar("Apagar todas as corridas e mensagens e voltar aos dados de teste originais?")
      .then(function (sim) {
        if (!sim) return;
        App.banco.resetar();
        preencherListas();
        ui.aviso("Dados de teste restaurados.", "sucesso");
      });
  });
})();
