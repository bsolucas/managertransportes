/* =============================================================================
   pagamento.js — COMPORTAMENTO DA PÁGINA DE PAGAMENTO (pagamento.html)
   -----------------------------------------------------------------------------
   Organização:
     1. Dados e ajudantes (formas de pagamento; máscaras vêm de validacao.js)
     2. Plano e forma de pagamento (cartões de escolha e resumo)
     3. Validação do formulário
     4. Envio: como o pedido é entregue ao pagamento
     5. Preparação da página

   COMO LIGAR O PAGAMENTO DEPOIS (js/config.js, bloco "pagamento"):
     • OPÇÃO A — urlCriarCobranca: endereço do seu servidor. A página envia
       (POST, JSON) o pedido { plano, cliente, forma, ... } e espera receber
       { "url": "..." } com o link do checkout do gateway; então leva o cliente
       até lá. Funciona igual no Android e no computador.
     • OPÇÃO B — provedor: registre, antes deste script, um objeto:
         window.PagamentoProvedores = { meugateway: {
           iniciar: function (pedido, config, areaPagamento) { return Promise } } };
       e escreva o nome em config.pagamento.provedor. A "areaPagamento" é a
       caixa da tela onde o gateway pode desenhar o QR Code do Pix, o formulário
       seguro do cartão etc.
     • Sem nada configurado: a página avisa que o pagamento online abre em breve
       (se houver config.whatsapp, o pedido vai por lá como plano B).
   Por segurança, esta página NUNCA pede número de cartão: isso fica sempre na
   tela segura do gateway.
   ============================================================================= */

(function () {
  var cfg = window.CONFIG || {};
  var pg = cfg.pagamento || {};
  var planos = cfg.planos || [];

  /* ==========================================================================
     1. DADOS E AJUDANTES
     ========================================================================== */
  var FORMAS = {
    pix:    { rotulo: "Pix",                icone: "⚡", detalhe: "Aprovação na hora, 24 h por dia" },
    cartao: { rotulo: "Cartão de crédito",  icone: "💳", detalhe: "Cobrança recorrente todo mês" },
    boleto: { rotulo: "Boleto",             icone: "🧾", detalhe: "Compensação em até 3 dias úteis" }
  };
  var formasAtivas = (pg.formas || ["pix", "cartao", "boleto"]).filter(function (f) { return FORMAS[f]; });

  var V = window.Validacao;   // máscaras e validações (js/validacao.js)
  var moeda = V.moeda, soNumeros = V.soNumeros, escapar = V.escapar;
  var formatarTelefone = V.formatarTelefone, formatarDocumento = V.formatarDocumento;
  var documentoValido = V.documentoValido;

  function $(id) { return document.getElementById(id); }

  /* ==========================================================================
     2. PLANO E FORMA DE PAGAMENTO
     ========================================================================== */
  var planoAtual = null;
  var formaAtual = formasAtivas[0] || null;

  function desenharPlanos(idInicial) {
    $("opcoes-plano").innerHTML = planos.map(function (p) {
      return '<label class="opcao"><input type="radio" name="plano" value="' + escapar(p.id) + '" />' +
        '<span class="opcao-texto"><b>' + escapar(p.nome) + "</b><small>" + escapar(p.descricao || "") + "</small></span>" +
        '<span class="opcao-preco">' + moeda(p.preco) + "/mês</span></label>";
    }).join("");
    var inicial = planos.filter(function (p) { return p.id === idInicial; })[0] || planos[0];
    if (inicial) {
      document.querySelector('input[name="plano"][value="' + inicial.id + '"]').checked = true;
      planoAtual = inicial;
    }
    $("opcoes-plano").addEventListener("change", function (ev) {
      planoAtual = planos.filter(function (p) { return p.id === ev.target.value; })[0];
      desenharResumo();
    });
  }

  function desenharFormas() {
    $("opcoes-forma").innerHTML = formasAtivas.map(function (f) {
      return '<label class="opcao"><input type="radio" name="forma" value="' + f + '" />' +
        '<span class="opcao-icone" aria-hidden="true">' + FORMAS[f].icone + "</span>" +
        '<span class="opcao-texto"><b>' + FORMAS[f].rotulo + "</b><small>" + FORMAS[f].detalhe + "</small></span></label>";
    }).join("");
    if (formaAtual) document.querySelector('input[name="forma"][value="' + formaAtual + '"]').checked = true;
    $("opcoes-forma").addEventListener("change", function (ev) {
      formaAtual = ev.target.value;
      desenharResumo();
      desenharArea();
    });
  }

  function gatewayLigado() {
    return !!((pg.provedor && window.PagamentoProvedores && window.PagamentoProvedores[pg.provedor]) || pg.urlCriarCobranca);
  }

  /* Texto da área onde o gateway vai aparecer. */
  function desenharArea() {
    var area = $("area-pagamento");
    if (!formaAtual) { area.innerHTML = "<p>Nenhuma forma de pagamento disponível no momento.</p>"; return; }
    if (gatewayLigado()) {
      area.innerHTML = "<p>Ao continuar, você será levado ao ambiente seguro de pagamento para concluir com <strong>" +
        FORMAS[formaAtual].rotulo + "</strong>.</p>";
    } else {
      area.innerHTML = cfg.whatsapp
        ? "<p><strong>Pagamento online em breve.</strong> Por enquanto, ao continuar enviamos o seu pedido pelo WhatsApp " +
          "e combinamos o pagamento por <strong>" + FORMAS[formaAtual].rotulo + "</strong>.</p>"
        : "<p><strong>Pagamento online em breve.</strong> Estamos finalizando a ativação da cobrança. " +
          "Você já pode conferir o plano e a forma de pagamento.</p>";
    }
  }

  function desenharResumo() {
    $("resumo-plano").textContent = planoAtual ? planoAtual.nome : "—";
    $("resumo-total").textContent = planoAtual ? moeda(planoAtual.preco) : "—";
    $("resumo-forma").textContent = formaAtual ? FORMAS[formaAtual].rotulo : "—";
    var dias = Number(cfg.diasTeste) || 0;
    $("linha-teste").hidden = !dias;
    $("resumo-teste").textContent = dias + " dias";
    $("botao-pagar").textContent = gatewayLigado() ? "Ir para o pagamento" : (cfg.whatsapp ? "Continuar pelo WhatsApp" : "Continuar");
  }

  /* ==========================================================================
     3. VALIDAÇÃO
     ========================================================================== */
  function erro(campo, texto) {
    var el = document.querySelector('[data-erro="' + campo + '"]');
    var input = $("pg-" + campo);
    if (el) el.textContent = texto || "";
    if (input) input.classList.toggle("invalido", !!texto);
    return !texto;
  }

  function validar() {
    var ok = true;
    var nome = $("pg-nome").value.trim();
    var email = $("pg-email").value.trim();
    var telefone = soNumeros($("pg-telefone").value);
    ok = erro("nome", nome.split(/\s+/).length < 2 ? "Informe nome e sobrenome." : "") && ok;
    ok = erro("email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "" : "Informe um e-mail válido.") && ok;
    ok = erro("telefone", telefone.length >= 10 ? "" : "Informe o telefone com DDD.") && ok;
    ok = erro("documento", documentoValido($("pg-documento").value) ? "" : "CPF ou CNPJ inválido.") && ok;
    if (!planoAtual || !formaAtual) { mensagem("Escolha o plano e a forma de pagamento.", "erro"); ok = false; }
    return ok;
  }

  function mensagem(texto, tipo) {
    var el = $("mensagem");
    el.textContent = texto || "";
    el.className = "mensagem" + (tipo ? " " + tipo : "");
  }

  /* ==========================================================================
     4. ENVIO
     ========================================================================== */
  function montarPedido() {
    return {
      plano: { id: planoAtual.id, nome: planoAtual.nome, preco: planoAtual.preco },
      forma: formaAtual,
      diasTeste: Number(cfg.diasTeste) || 0,
      cliente: {
        nome: $("pg-nome").value.trim(),
        empresa: $("pg-empresa").value.trim(),
        email: $("pg-email").value.trim(),
        telefone: soNumeros($("pg-telefone").value),
        documento: soNumeros($("pg-documento").value)
      },
      origem: location.href,
      criadoEm: new Date().toISOString()
    };
  }

  /* Sem gateway: abre o WhatsApp com o pedido escrito. */
  function enviarPorWhatsApp(pedido) {
    var linhas = [
      "Olá! Quero assinar o " + cfg.marca + ".",
      "Plano: " + pedido.plano.nome + " (" + moeda(pedido.plano.preco) + "/mês)",
      "Pagamento: " + FORMAS[pedido.forma].rotulo,
      "Nome: " + pedido.cliente.nome,
      pedido.cliente.empresa ? "Empresa: " + pedido.cliente.empresa : null,
      "E-mail: " + pedido.cliente.email,
      "Telefone: " + formatarTelefone(pedido.cliente.telefone),
      "CPF/CNPJ: " + formatarDocumento(pedido.cliente.documento)
    ].filter(Boolean);
    if (!cfg.whatsapp) {
      return Promise.reject(new Error("A assinatura online ainda não está disponível. Tente novamente em breve."));
    }
    window.location.href = "https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(linhas.join("\n"));
    return Promise.resolve();
  }

  /* OPÇÃO A: o seu servidor cria a cobrança e devolve o link do checkout. */
  function criarCobrancaNoServidor(pedido) {
    return fetch(pg.urlCriarCobranca, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido)
    }).then(function (r) {
      if (!r.ok) throw new Error("Não foi possível iniciar o pagamento. Tente novamente.");
      return r.json();
    }).then(function (dados) {
      if (!dados || typeof dados.url !== "string" || !/^https:\/\//i.test(dados.url)) {
        throw new Error("Resposta inválida do servidor de pagamento.");
      }
      window.location.href = dados.url;
    });
  }

  function iniciarPagamento(pedido) {
    var provedor = pg.provedor && window.PagamentoProvedores && window.PagamentoProvedores[pg.provedor];
    if (provedor) return Promise.resolve(provedor.iniciar(pedido, pg, $("area-pagamento")));
    if (pg.urlCriarCobranca) return criarCobrancaNoServidor(pedido);
    return enviarPorWhatsApp(pedido);
  }

  /* ==========================================================================
     5. PREPARAÇÃO DA PÁGINA
     ========================================================================== */
  document.querySelectorAll("[data-marca]").forEach(function (el) { el.textContent = cfg.marca; });
  document.title = "Assinar — " + cfg.marca;
  $("ano").textContent = new Date().getFullYear();
  $("texto-teste").textContent = Number(cfg.diasTeste)
    ? "Preencha os dados abaixo. Você tem " + cfg.diasTeste + " dias de teste grátis e pode cancelar quando quiser."
    : "Preencha os dados abaixo. Você pode cancelar quando quiser.";

  desenharPlanos(new URLSearchParams(location.search).get("plano"));
  desenharFormas();
  desenharResumo();
  desenharArea();

  $("pg-telefone").addEventListener("input", function (ev) { ev.target.value = formatarTelefone(ev.target.value); });
  $("pg-documento").addEventListener("input", function (ev) { ev.target.value = formatarDocumento(ev.target.value); });

  $("form-pagamento").addEventListener("submit", function (ev) {
    ev.preventDefault();
    mensagem("");
    if (!validar()) return;
    var botao = $("botao-pagar");
    var textoBotao = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Aguarde…";
    iniciarPagamento(montarPedido()).then(function () {
      mensagem("Pedido enviado. Se nada abrir, tente novamente.", "ok");
    }).catch(function (e) {
      mensagem(e.message || "Não foi possível continuar.", "erro");
    }).then(function () {
      botao.disabled = false;
      botao.textContent = textoBotao;
    });
  });
})();
