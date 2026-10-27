/* =============================================================================
   paginas/gestor-motoristas.js — JANELA "NOVO MOTORISTA" (aba Motoristas)
   -----------------------------------------------------------------------------
     App.gestorMotoristas.abrirCadastro(aoSalvar)
       Abre o formulário (nome, telefone, veículo, serviços, usuário e senha),
       cria o motorista e o login no Supabase e depois chama aoSalvar().

   A lista de cartões e o botão "Remover" ficam em js/paginas/gestor.js.
   ============================================================================= */

App.gestorMotoristas = (function () {
  var u = App.utils;
  var ui = App.ui;

  function abrirCadastro(aoSalvar) {
    var servicos = Object.keys(App.SERVICOS).map(function (chave) {
      return '<label class="opcao-servico"><input type="checkbox" name="mot-servico" value="' + chave + '"' +
        (chave === "carro" ? " checked" : "") + " /> " + App.SERVICOS[chave].icone + " " + u.escaparHtml(App.SERVICOS[chave].rotulo) + "</label>";
    }).join("");

    var corpo = ui.abrirModal("Novo motorista",
      '<form class="formulario-cliente" id="form-motorista" novalidate>' +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="mot-nome">Nome *</label>' +
            '<input class="campo" id="mot-nome" placeholder="Nome completo" autocomplete="off" /></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="mot-telefone">Telefone</label>' +
            '<input class="campo" id="mot-telefone" placeholder="(51) 99999-9999" inputmode="tel" autocomplete="off" /></div>' +
        "</div>" +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="mot-modelo">Veículo (modelo)</label>' +
            '<input class="campo" id="mot-modelo" placeholder="Ex.: Gol G5" autocomplete="off" /></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="mot-placa">Placa</label>' +
            '<input class="campo" id="mot-placa" placeholder="ABC-1D23" autocapitalize="characters" autocomplete="off" /></div>' +
        "</div>" +
        '<div class="grupo-campo"><label class="rotulo" for="mot-cor">Cor do veículo</label>' +
          '<input class="campo" id="mot-cor" placeholder="Ex.: Prata" autocomplete="off" /></div>' +
        '<div class="grupo-campo"><span class="rotulo">Serviços que atende *</span><div class="opcoes-servico">' + servicos + "</div></div>" +
        '<hr class="separador" />' +
        '<p class="texto-suave texto-pequeno">Login do motorista no aplicativo:</p>' +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="mot-usuario">Usuário *</label>' +
            '<input class="campo" id="mot-usuario" placeholder="Ex.: lucas.nascimento" autocapitalize="none" spellcheck="false" autocomplete="off" /></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="mot-senha">Senha * (mín. 6)</label>' +
            '<div class="campo-senha">' +
              '<input class="campo" id="mot-senha" type="password" autocomplete="new-password" />' +
              '<button type="button" class="botao-olho" id="mot-ver-senha" aria-label="Mostrar senha" title="Mostrar senha">' + App.icone("eye") + '</button>' +
            "</div></div>" +
        "</div>" +
        '<div class="erro-login" id="erro-motorista" role="alert"></div>' +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">Cadastrar motorista</button>' +
        "</div>" +
      "</form>", {});

    function valor(id) { return corpo.querySelector("#" + id).value.trim(); }

    /* Olho: mostra/esconde a senha digitada. */
    var campoSenha = corpo.querySelector("#mot-senha");
    var olho = corpo.querySelector("#mot-ver-senha");
    olho.addEventListener("click", function () {
      var mostrar = campoSenha.type === "password";
      campoSenha.type = mostrar ? "text" : "password";
      olho.innerHTML = App.icone(mostrar ? "eye-off" : "eye");
      olho.title = mostrar ? "Esconder senha" : "Mostrar senha";
      campoSenha.focus();
    });

    /* A placa fica sempre em maiúsculas. */
    corpo.querySelector("#mot-placa").addEventListener("input", function (ev) {
      ev.target.value = ev.target.value.toUpperCase();
    });

    corpo.querySelector("#form-motorista").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var erro = corpo.querySelector("#erro-motorista");
      var botao = corpo.querySelector('button[type="submit"]');
      var marcados = Array.prototype.slice.call(corpo.querySelectorAll('input[name="mot-servico"]:checked'))
        .map(function (c) { return c.value; });

      if (!valor("mot-nome")) { erro.textContent = "Informe o nome do motorista."; return; }
      if (!marcados.length) { erro.textContent = "Escolha ao menos um serviço."; return; }
      if (!valor("mot-usuario")) { erro.textContent = "Informe o usuário de login."; return; }
      if (campoSenha.value.length < 6) { erro.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }

      erro.textContent = "";
      botao.disabled = true;
      botao.textContent = "Cadastrando…";
      App.motoristasDb.criar({
        usuario: valor("mot-usuario"), senha: campoSenha.value, nome: valor("mot-nome"),
        telefone: valor("mot-telefone"), servicos: marcados,
        veiculo: { modelo: valor("mot-modelo"), placa: valor("mot-placa"), cor: valor("mot-cor") }
      }).then(function () {
        ui.fecharModal();
        ui.aviso("Motorista cadastrado. Ele já pode entrar no app com o usuário e a senha.", "sucesso");
        if (aoSalvar) aoSalvar();
      }).catch(function (e) {
        erro.textContent = e.message || "Não foi possível cadastrar.";
        botao.disabled = false;
        botao.textContent = "Cadastrar motorista";
      });
    });

    corpo.querySelector("#mot-nome").focus();
  }

  return { abrirCadastro: abrirCadastro };
})();
