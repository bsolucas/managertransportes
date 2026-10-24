/* =============================================================================
   paginas/login.js — COMPORTAMENTO DA TELA INICIAL (index.html)
   -----------------------------------------------------------------------------
   1. Prepara os dados de teste (na primeira vez).
   2. Preenche as listas de motoristas e clientes de teste.
   3. Ao clicar em "Entrar", guarda o perfil escolhido NESTA aba e abre a
      página correspondente em /paginas.
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
      App.banco.listarClientes().map(function (c) {
        return { valor: c.id, texto: c.nome + (c.empresa ? " (" + c.empresa + ")" : "") };
      }));
  }
  preencherListas();

  /* --- Botões "Entrar" ----------------------------------------------------- */
  document.getElementById("entrar-gestor").addEventListener("click", function () {
    var g = App.banco.obterGestor();
    App.sessao.entrar({ tipo: "gestor", id: g.id, nome: g.nome });
    window.location.href = "paginas/gestor.html";
  });

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
