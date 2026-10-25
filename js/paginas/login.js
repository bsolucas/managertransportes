/* =============================================================================
   paginas/login.js — COMPORTAMENTO DA TELA INICIAL (index.html)
   -----------------------------------------------------------------------------
   1. Prepara os dados de teste (na primeira vez).
   2. Preenche as listas de motoristas e clientes de teste.
   3. Ao clicar em "Entrar", guarda o perfil escolhido NESTA aba e abre a
      página correspondente em /paginas.
   4. "Entrar como gestor" abre uma janela de usuário e senha (acessos
      provisórios de js/acessos-provisorios.js).
   ============================================================================= */

(function () {
  var ui = App.ui;

  App.banco.iniciar();
  document.getElementById("nome-app").textContent = App.config.NOME_APP;
  document.title = "Entrar • " + App.config.NOME_APP;

  /* Preenche os <select> com os usuários de teste. */
  function preencherListas() {
    ui.preencherSelect(document.getElementById("escolha-motorista"),
      App.banco.listarMotoristas().map(function (m) {
        return { valor: m.id, texto: m.nome + " — " + m.veiculo.modelo };
      }));
    ui.preencherSelect(document.getElementById("escolha-cliente"),
      App.banco.listarClientes().filter(function (c) { return c.ativo !== false; }).map(function (c) {
        return { valor: c.id, texto: c.nome + (c.empresa ? " (" + c.empresa + ")" : "") };
      }));
  }
  preencherListas();

  /* --- Botões "Entrar" ----------------------------------------------------- */
  /* Gestor: pede usuário e senha antes de abrir o painel. */
  document.getElementById("entrar-gestor").addEventListener("click", abrirLoginGestor);

  function abrirLoginGestor() {
    var empresa = App.banco.obterEmpresa();
    var corpo = ui.abrirModal("Entrar como gestor",
      '<form id="form-login-gestor" novalidate>' +
        '<p class="texto-suave texto-pequeno">Acesso de <strong>' + App.utils.escaparHtml(empresa.nome) + "</strong>.</p>" +
        '<div class="grupo-campo"><label class="rotulo" for="login-usuario">Usuário</label>' +
          '<input class="campo" id="login-usuario" autocomplete="username" autocapitalize="none" spellcheck="false" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="login-senha">Senha</label>' +
          '<input class="campo" id="login-senha" type="password" autocomplete="current-password" /></div>' +
        '<div class="erro-login" id="erro-login" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">Entrar</button>' +
        "</div>" +
      "</form>", { classe: "modal-pequeno" });

    corpo.querySelector("#form-login-gestor").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var acesso = App.acessos.conferir(corpo.querySelector("#login-usuario").value, corpo.querySelector("#login-senha").value);
      if (!acesso) {
        corpo.querySelector("#erro-login").textContent = "Usuário ou senha incorretos.";
        corpo.querySelector("#login-senha").value = "";
        corpo.querySelector("#login-senha").focus();
        return;
      }
      App.sessao.entrar({ tipo: "gestor", id: acesso.id, nome: acesso.nome });
      window.location.href = "paginas/gestor.html";
    });

    corpo.querySelector("#login-usuario").focus();
  }

  document.getElementById("entrar-motorista").addEventListener("click", function () {
    var m = App.banco.buscarMotorista(document.getElementById("escolha-motorista").value);
    App.sessao.entrar({ tipo: "motorista", id: m.id, nome: m.nome });
    window.location.href = "paginas/motorista.html";
  });

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
