/* =============================================================================
   paginas/login.js — COMPORTAMENTO DA TELA INICIAL (index.html)
   -----------------------------------------------------------------------------
   1. Mostra o nome do app.
   2. "Entrar como gestor", "motorista" ou "cliente" abrem uma janela de
      usuário e senha e fazem o login real no Supabase (js/auth-supabase.js).
   3. Se o login der certo, guarda o perfil NESTA aba e abre a página
      correspondente em /paginas.
   4. "Salvar meu login neste aparelho": lembra o USUÁRIO (a senha nunca é guardada por
      aqui; o navegador oferece guardá-la no gerenciador dele) e, nas próximas vezes, entra
      sozinho enquanto o login do Supabase continuar válido. "Sair" desfaz isso.
   ============================================================================= */

(function () {
  var ui = App.ui;

  document.getElementById("nome-app").textContent = App.config.NOME_APP;
  document.title = "Entrar • " + App.config.NOME_APP;

  var P = App.config.PREFIXO_ARMAZENAMENTO;
  var PERFIS = {
    gestor:    { titulo: "Entrar como gestor", texto: "Acesso do gestor da empresa.", papeis: ["gestor", "master"],
                 erroPapel: "Este usuário não é gestor.", destino: "paginas/gestor.html", tipo: "gestor" },
    motorista: { titulo: "Entrar como motorista", texto: "Use o usuário e a senha que a empresa passou para você.",
                 papeis: ["motorista"], erroPapel: "Este usuário não é motorista.",
                 destino: "paginas/motorista.html", tipo: "motorista" },
    cliente:   { titulo: "Entrar como cliente", texto: "Use o usuário e a senha que a empresa passou para você.",
                 papeis: ["cliente"], erroPapel: "Este usuário não é cliente.",
                 destino: "paginas/cliente.html", tipo: "cliente" }
  };

  /* Leitura/gravação do que foi "salvo neste aparelho" (sempre protegida: pode não haver armazenamento). */
  function lerSalvo(chave) { try { return JSON.parse(localStorage.getItem(P + chave) || "null"); } catch (e) { return null; } }
  function gravarSalvo(chave, valor) { try { valor === null ? localStorage.removeItem(P + chave) : localStorage.setItem(P + chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ } }

  /* --- Botões "Entrar" ----------------------------------------------------- */
  Object.keys(PERFIS).forEach(function (tipo) {
    document.getElementById("entrar-" + tipo).addEventListener("click", function () { abrirLogin(PERFIS[tipo]); });
  });

  /* Transforma o login do Supabase na sessão desta aba (motorista e cliente usam o id do cadastro deles). */
  function montarSessao(acesso, cfg) {
    if (cfg.papeis.indexOf(acesso.papel) === -1) {
      // Login certo, mas é de outro tipo de usuário: encerra e avisa.
      return App.auth.sair().then(function () { throw new Error(cfg.erroPapel); });
    }
    var sessao = { tipo: cfg.tipo, id: acesso.id, nome: acesso.nome, papel: acesso.papel, empresa: acesso.empresa };
    if (cfg.tipo !== "motorista" && cfg.tipo !== "cliente") return Promise.resolve(sessao);
    var buscar = cfg.tipo === "motorista" ? App.auth.buscarMotorista : App.auth.buscarCliente;
    return buscar().then(function (cad) {
      sessao.id = cad.id;
      sessao.nome = cad.nome;
      return sessao;
    }).catch(function (e) {
      return App.auth.sair().then(function () { throw e; });
    });
  }

  /* --- Entrada automática (quem marcou "salvar meu login") ------------------ */
  (function entradaAutomatica() {
    var lembrado = lerSalvo("lembrar");
    var cfg = lembrado && PERFIS[lembrado.tipo];
    if (!cfg) return;
    var aviso = document.createElement("div");
    aviso.className = "entrada-automatica";
    aviso.innerHTML = '<span>Entrando como ' + cfg.tipo + ' (' + App.utils.escaparHtml(lembrado.usuario || "") + ')…</span> ' +
                      '<button type="button" class="botao botao-secundario botao-pequeno">Trocar de conta</button>';
    var principal = document.querySelector("main") || document.body;
    principal.insertBefore(aviso, principal.firstChild);
    var cancelado = false;
    aviso.querySelector("button").addEventListener("click", function () {
      cancelado = true;
      gravarSalvo("lembrar", null);
      aviso.remove();
      App.auth.sair();
    });
    App.auth.restaurar().then(function (acesso) { return montarSessao(acesso, cfg); }).then(function (sessao) {
      if (cancelado) return;
      App.sessao.entrar(sessao);
      window.location.href = cfg.destino;
    }).catch(function () {
      // login vencido ou de outro tipo: pede a senha de novo
      if (!cancelado) { gravarSalvo("lembrar", null); aviso.remove(); }
    });
  })();

  /* Janela de login. cfg = { titulo, texto, papeis, erroPapel, destino, tipo } */
  function abrirLogin(cfg) {
    var salvo = lerSalvo("login-" + cfg.tipo);
    var usuarioSalvo = (salvo && salvo.usuario) || "";
    var corpo = ui.abrirModal(cfg.titulo,
      '<form id="form-login" novalidate>' +
        '<p class="texto-suave texto-pequeno">' + cfg.texto + '</p>' +
        '<div class="grupo-campo"><label class="rotulo" for="login-usuario">Usuário</label>' +
          '<input class="campo" id="login-usuario" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + App.utils.escaparHtml(usuarioSalvo) + '" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="login-senha">Senha</label>' +
          '<div class="campo-senha">' +
            '<input class="campo" id="login-senha" name="password" type="password" autocomplete="current-password" />' +
            '<button type="button" class="botao-olho" id="ver-senha" aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">' + App.icone("eye") + '</button>' +
          '</div></div>' +
        '<label class="pilula pilula-bloco"><input type="checkbox" id="login-salvar"' + (usuarioSalvo ? " checked" : "") + ' /> Salvar meu login neste aparelho</label>' +
        '<p class="texto-suave texto-pequeno">Não salvamos a sua senha: o navegador pode oferecer para guardá-la. Use só no seu aparelho.</p>' +
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
      botaoOlho.innerHTML = App.icone(mostrar ? "eye-off" : "eye");
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
      var usuarioDigitado = corpo.querySelector("#login-usuario").value.trim().toLowerCase();
      var senhaDigitada = corpo.querySelector("#login-senha").value;
      App.auth.entrar(usuarioDigitado, senhaDigitada)
        .then(function (acesso) { return montarSessao(acesso, cfg); })
        .then(function (sessao) {
          /* "Salvar meu login": lembra o usuário (e o perfil, para entrar sozinho da próxima vez). */
          if (corpo.querySelector("#login-salvar").checked) {
            gravarSalvo("login-" + cfg.tipo, { usuario: usuarioDigitado });
            gravarSalvo("lembrar", { tipo: cfg.tipo, usuario: usuarioDigitado });
            try {   // o navegador pergunta se quer guardar a senha dele (Chrome/Edge)
              if (window.PasswordCredential && navigator.credentials) {
                navigator.credentials.store(new PasswordCredential({ id: usuarioDigitado, password: senhaDigitada, name: usuarioDigitado }));
              }
            } catch (e) { /* sem suporte: tudo bem */ }
          } else {
            gravarSalvo("login-" + cfg.tipo, null);
            gravarSalvo("lembrar", null);
          }
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
})();
