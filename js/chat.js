/* =============================================================================
   chat.js — COMPONENTE DE CHAT DA CORRIDA
   -----------------------------------------------------------------------------
   Cada corrida tem a sua conversa, com o cliente, o motorista e o gestor.
   O chat só é liberado DEPOIS que alguém aceita a corrida (antes disso, só
   aparecem as mensagens automáticas do sistema).

   Uso:
     var chat = App.chat.criar(elementoContainer);
     chat.abrir(corridaId);   // mostra a conversa daquela corrida
     chat.fechar();

   O HTML do chat é montado aqui dentro do container; o visual está em
   css/componentes.css (seção CHAT).
   ============================================================================= */

App.chat = {

  criar: function (container) {
    var u = App.utils;
    var corridaId = null;
    var totalMostrado = -1;

    container.classList.add("chat");
    container.innerHTML =
      '<div class="chat-cabecalho"><span class="chat-titulo">Chat</span><span class="chat-subtitulo"></span></div>' +
      '<div class="chat-mensagens" aria-live="polite"></div>' +
      '<form class="chat-formulario" autocomplete="off">' +
        '<input class="campo chat-campo" type="text" maxlength="500" placeholder="Escreva uma mensagem..." />' +
        '<button class="botao botao-primario" type="submit">Enviar</button>' +
      "</form>";

    var elMensagens = container.querySelector(".chat-mensagens");
    var elSub = container.querySelector(".chat-subtitulo");
    var form = container.querySelector(".chat-formulario");
    var campo = container.querySelector(".chat-campo");

    /* O chat fica liberado quando a corrida foi aceita (e até ela terminar,
       mais 1 hora, para combinar algo depois). */
    function liberado(corrida) {
      if (!corrida) return false;
      if (corrida.status === "aceita" || corrida.status === "em_andamento") return true;
      var fim = corrida.concluidaEm || corrida.canceladaEm;
      return corrida.status === "concluida" && fim && Date.now() - fim < 3600000;
    }

    function desenhar() {
      var corrida = corridaId ? App.banco.buscarCorrida(corridaId) : null;
      if (!corrida) {
        elSub.textContent = "";
        elMensagens.innerHTML = '<p class="chat-vazio">Selecione uma corrida para ver a conversa.</p>';
        form.hidden = true;
        totalMostrado = -1;
        return;
      }
      elSub.textContent = "Corrida " + corrida.codigo;
      var msgs = App.banco.listarMensagens(corridaId);
      var podeEscrever = liberado(corrida);
      form.hidden = false;
      campo.disabled = !podeEscrever;
      form.querySelector("button").disabled = !podeEscrever;
      campo.placeholder = podeEscrever ? "Escreva uma mensagem..." :
        (corrida.status === "aguardando" ? "O chat é liberado quando um motorista aceitar a corrida" : "Chat encerrado");

      if (msgs.length === totalMostrado) return; // nada novo: não redesenha
      var chaveEu = App.sessao.chaveUsuario();
      elMensagens.innerHTML = msgs.map(function (m) {
        if (m.autorTipo === "sistema") {
          return '<div class="mensagem mensagem-sistema">' + u.escaparHtml(m.texto) + "</div>";
        }
        var minha = (m.autorTipo + ":" + m.autorId) === chaveEu;
        return '<div class="mensagem ' + (minha ? "mensagem-minha" : "mensagem-outro") + " mensagem-" + m.autorTipo + '">' +
                 '<div class="mensagem-autor">' + u.escaparHtml(m.autorNome) +
                   ' <span class="mensagem-papel">' + rotuloPapel(m.autorTipo) + "</span></div>" +
                 '<div class="mensagem-texto">' + u.escaparHtml(m.texto) + "</div>" +
                 '<div class="mensagem-hora">' + u.hora(m.em) + "</div>" +
               "</div>";
      }).join("") || '<p class="chat-vazio">Nenhuma mensagem ainda.</p>';
      totalMostrado = msgs.length;
      elMensagens.scrollTop = elMensagens.scrollHeight;
      App.banco.marcarLidas(corridaId, chaveEu);
    }

    function rotuloPapel(tipo) {
      return { cliente: "cliente", motorista: "motorista", gestor: "gestor" }[tipo] || "";
    }

    /* Enviar mensagem */
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var texto = campo.value.trim();
      if (!texto || !corridaId) return;
      var usuario = App.sessao.atual();
      App.banco.enviarMensagem(corridaId, usuario, texto);
      campo.value = "";
      campo.focus();
    });

    /* Redesenha quando chegam mensagens novas (desta ou de outra aba). */
    App.banco.aoMudar(function (chave) {
      if (chave === "mensagens" || chave === "corridas" || chave === "tudo") desenhar();
    });

    desenhar();

    return {
      abrir: function (id) { corridaId = id; totalMostrado = -1; desenhar(); },
      fechar: function () { corridaId = null; desenhar(); },
      corridaAtual: function () { return corridaId; }
    };
  }
};
