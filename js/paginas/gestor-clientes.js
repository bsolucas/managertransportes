/* =============================================================================
   paginas/gestor-clientes.js — IDENTIDADE DA EMPRESA E ABA "CLIENTES"
   -----------------------------------------------------------------------------
   Organização deste arquivo:
     1. Empresa do gestor ... logotipo (sigla) e nome no canto superior esquerdo
     2. Máscaras e validação  CNPJ e telefone
     3. Lista de clientes ... busca, filtro, indicadores e tabela
     4. Cadastro ............ janela para criar e editar um cliente
     5. Ações ............... editar, ativar/desativar e excluir

   "Clientes" são as empresas terceirizadas que contratam o transporte e pedem
   as corridas. Os dados ficam no banco local (js/banco-local.js).
   ============================================================================= */

(function () {
  var u = App.utils;
  var ui = App.ui;
  var banco = App.banco;

  /* ==========================================================================
     1. EMPRESA DO GESTOR (topo da página)
     ========================================================================== */
  var empresa = banco.obterEmpresa();
  var sigla = document.getElementById("empresa-sigla");
  if (empresa.logo) {
    sigla.innerHTML = '<img alt="" src="' + u.escaparHtml(empresa.logo) + '" />';
  } else {
    sigla.textContent = empresa.sigla || u.iniciais(empresa.nome);
  }
  document.getElementById("empresa-nome").textContent = empresa.nome;
  document.getElementById("marca-empresa").title = empresa.nome;
  ui.$$(".nome-empresa-texto").forEach(function (el) { el.textContent = empresa.nome; });
  document.title = "Gestor • " + empresa.nome;

  /* ==========================================================================
     2. MÁSCARAS E VALIDAÇÃO
     ========================================================================== */
  function soNumeros(texto) { return String(texto || "").replace(/\D/g, ""); }

  /* 11222333000181 -> 11.222.333/0001-81 (vai formatando enquanto digita) */
  function formatarCnpj(texto) {
    var d = soNumeros(texto).slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, "$1.$2")
            .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d)/, ".$1/$2")
            .replace(/(\d{4})(\d)/, "$1-$2");
  }

  /* 51977770001 -> (51) 97777-0001 (aceita telefone fixo, de 10 dígitos, também) */
  function formatarTelefone(texto) {
    var d = soNumeros(texto).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  /* Confere os dois dígitos verificadores do CNPJ. */
  function cnpjValido(texto) {
    var d = soNumeros(texto);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    function digito(base) {
      var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var soma = 0;
      for (var i = 0; i < base.length; i++) soma += Number(base.charAt(i)) * pesos[i];
      var resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    }
    var d1 = digito(d.slice(0, 12));
    var d2 = digito(d.slice(0, 12) + d1);
    return d.charAt(12) === String(d1) && d.charAt(13) === String(d2);
  }

  /* ==========================================================================
     3. LISTA DE CLIENTES
     ========================================================================== */
  function nomeExibido(c) { return c.empresa || c.nome; }

  /* Quantas corridas e quanto já foi concluído para cada cliente. */
  function resumoDoCliente(id) {
    var corridas = banco.listarCorridas().filter(function (c) { return c.clienteId === id; });
    var total = corridas.filter(function (c) { return c.status === "concluida"; })
      .reduce(function (s, c) { return s + App.precos.totalCorrida(c); }, 0);
    return { corridas: corridas.length, total: total };
  }

  function desenharClientes() {
    var todos = banco.listarClientes();
    var busca = document.getElementById("busca-clientes").value.trim().toLowerCase();
    var buscaNumeros = soNumeros(busca);
    var situacao = document.getElementById("filtro-situacao-clientes").value;

    var ativos = todos.filter(function (c) { return c.ativo !== false; }).length;
    document.getElementById("indicadores-clientes").innerHTML = [
      indicador("Clientes cadastrados", todos.length, u.plural(ativos, "ativo", "ativos")),
      indicador("Inativos", todos.length - ativos, "não aparecem no portal do cliente")
    ].join("");

    var lista = todos.filter(function (c) {
      if (situacao === "ativo" && c.ativo === false) return false;
      if (situacao === "inativo" && c.ativo !== false) return false;
      if (busca) {
        var texto = [c.empresa, c.nome, c.cnpj, c.telefone, c.email].join(" ").toLowerCase();
        var achouTexto = texto.indexOf(busca) !== -1;
        var achouNumero = buscaNumeros && soNumeros([c.cnpj, c.telefone].join(" ")).indexOf(buscaNumeros) !== -1;
        if (!achouTexto && !achouNumero) return false;
      }
      return true;
    }).sort(function (a, b) { return nomeExibido(a).localeCompare(nomeExibido(b), "pt-BR"); });

    document.getElementById("tabela-clientes").innerHTML = lista.length ? lista.map(function (c) {
      var r = resumoDoCliente(c.id);
      var inativo = c.ativo === false;
      return '<tr class="' + (inativo ? "linha-inativa" : "") + '">' +
        '<td data-rotulo="Empresa"><div class="cliente-empresa">' + ui.avatar(nomeExibido(c)) +
          "<div><strong>" + u.escaparHtml(nomeExibido(c)) + "</strong>" +
          (c.empresa ? "<small>Contato: " + u.escaparHtml(c.nome) + "</small>" : "") +
          (c.email ? "<small>" + u.escaparHtml(c.email) + "</small>" : "") + "</div></div></td>" +
        '<td data-rotulo="CNPJ" class="nao-quebra">' + u.escaparHtml(c.cnpj || "—") + "</td>" +
        '<td data-rotulo="Telefone" class="nao-quebra">' + u.escaparHtml(c.telefone || "—") + "</td>" +
        '<td data-rotulo="Corridas" class="direita numero">' + r.corridas + "</td>" +
        '<td data-rotulo="Total" class="direita numero">' + u.moeda(r.total) + "</td>" +
        '<td data-rotulo="Situação"><span class="selo ' + (inativo ? "status-concluida" : "status-andamento") + '">' + (inativo ? "Inativo" : "Ativo") + "</span></td>" +
        '<td><div class="acoes-linha">' +
          '<button class="botao-icone" data-editar="' + c.id + '" title="Editar" aria-label="Editar">✏️</button>' +
          '<button class="botao-icone" data-alternar="' + c.id + '" title="' + (inativo ? "Ativar" : "Desativar") + '" aria-label="' + (inativo ? "Ativar" : "Desativar") + '">' + (inativo ? "▶️" : "⏸️") + "</button>" +
          '<button class="botao-icone" data-excluir="' + c.id + '" title="Excluir" aria-label="Excluir">🗑️</button>' +
        "</div></td>" +
      "</tr>";
    }).join("") : '<tr><td colspan="7" class="tabela-vazia">' +
      (todos.length ? "Nenhum cliente encontrado." : 'Nenhum cliente cadastrado. Clique em "+ Novo cliente".') + "</td></tr>";
  }

  function indicador(rotulo, valor, detalhe) {
    return '<div class="cartao indicador"><div class="indicador-rotulo">' + rotulo + "</div>" +
           '<div class="indicador-valor">' + valor + "</div>" +
           '<div class="indicador-detalhe">' + detalhe + "</div></div>";
  }

  ["busca-clientes", "filtro-situacao-clientes"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", desenharClientes);
  });

  /* ==========================================================================
     4. CADASTRO (janela modal): novo cliente ou edição
     ========================================================================== */
  function abrirFormulario(id) {
    var c = (id && banco.buscarCliente(id)) || { ativo: true };
    var v = function (campo) { return u.escaparHtml(c[campo] || ""); };

    var corpo = ui.abrirModal(id ? "Editar cliente" : "Novo cliente",
      '<form class="formulario-cliente" id="form-cliente" novalidate>' +
        '<div class="grupo-campo"><label class="rotulo" for="cli-empresa">Empresa *</label>' +
          '<input class="campo" id="cli-empresa" value="' + v("empresa") + '" placeholder="Ex.: Mendes Consultoria" autocomplete="off" />' +
          '<div class="erro-campo" data-erro="empresa"></div></div>' +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="cli-cnpj">CNPJ</label>' +
            '<input class="campo" id="cli-cnpj" value="' + v("cnpj") + '" placeholder="00.000.000/0000-00" inputmode="numeric" autocomplete="off" />' +
            '<div class="erro-campo" data-erro="cnpj"></div></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="cli-telefone">Telefone</label>' +
            '<input class="campo" id="cli-telefone" value="' + v("telefone") + '" placeholder="(51) 99999-9999" inputmode="tel" autocomplete="off" />' +
            '<div class="erro-campo" data-erro="telefone"></div></div>' +
        "</div>" +
        '<div class="linha-campos">' +
          '<div class="grupo-campo"><label class="rotulo" for="cli-nome">Pessoa de contato *</label>' +
            '<input class="campo" id="cli-nome" value="' + v("nome") + '" placeholder="Quem pede as corridas" autocomplete="off" />' +
            '<div class="erro-campo" data-erro="nome"></div></div>' +
          '<div class="grupo-campo"><label class="rotulo" for="cli-email">E-mail</label>' +
            '<input class="campo" id="cli-email" type="email" value="' + v("email") + '" placeholder="contato@empresa.com.br" autocomplete="off" />' +
            '<div class="erro-campo" data-erro="email"></div></div>' +
        "</div>" +
        '<div class="grupo-campo"><label class="rotulo" for="cli-endereco">Endereço</label>' +
          '<input class="campo" id="cli-endereco" value="' + v("endereco") + '" placeholder="Rua, número, cidade/UF" autocomplete="off" /></div>' +
        '<div class="grupo-campo"><label class="rotulo" for="cli-obs">Observações</label>' +
          '<textarea class="campo" id="cli-obs" placeholder="Ex.: pagamento quinzenal, contrato, horários">' + v("observacoes") + "</textarea></div>" +
        '<div class="grupo-campo"><label class="rotulo" for="cli-ativo">Situação</label>' +
          '<select class="campo" id="cli-ativo"><option value="1"' + (c.ativo !== false ? " selected" : "") + '>Ativo</option>' +
          '<option value="0"' + (c.ativo === false ? " selected" : "") + ">Inativo</option></select></div>" +
        '<div class="acoes-modal">' +
          '<button type="button" class="botao botao-secundario" data-fechar-modal>Cancelar</button>' +
          '<button type="submit" class="botao botao-primario">' + (id ? "Salvar alterações" : "Cadastrar cliente") + "</button>" +
        "</div>" +
      "</form>");

    var cnpj = corpo.querySelector("#cli-cnpj");
    var telefone = corpo.querySelector("#cli-telefone");
    cnpj.addEventListener("input", function () { cnpj.value = formatarCnpj(cnpj.value); });
    telefone.addEventListener("input", function () { telefone.value = formatarTelefone(telefone.value); });

    function erro(campo, mensagem) {
      corpo.querySelector('[data-erro="' + campo + '"]').textContent = mensagem || "";
      var entrada = corpo.querySelector("#cli-" + campo);
      if (entrada) entrada.classList.toggle("campo-invalido", !!mensagem);
      return !mensagem;
    }

    corpo.querySelector("#form-cliente").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var dados = {
        id: id || undefined,
        empresa: corpo.querySelector("#cli-empresa").value.trim(),
        nome: corpo.querySelector("#cli-nome").value.trim(),
        cnpj: cnpj.value.trim(),
        telefone: telefone.value.trim(),
        email: corpo.querySelector("#cli-email").value.trim(),
        endereco: corpo.querySelector("#cli-endereco").value.trim(),
        observacoes: corpo.querySelector("#cli-obs").value.trim(),
        ativo: corpo.querySelector("#cli-ativo").value === "1"
      };

      /* Validação: mostra o erro embaixo de cada campo */
      var ok = true;
      ok = erro("empresa", dados.empresa ? "" : "Informe o nome da empresa.") && ok;
      ok = erro("nome", dados.nome ? "" : "Informe a pessoa de contato.") && ok;
      ok = erro("cnpj", !dados.cnpj || cnpjValido(dados.cnpj) ? "" : "CNPJ inválido.") && ok;
      ok = erro("telefone", !dados.telefone || soNumeros(dados.telefone).length >= 10 ? "" : "Telefone incompleto (com DDD).") && ok;
      ok = erro("email", !dados.email || /^\S+@\S+\.\S+$/.test(dados.email) ? "" : "E-mail inválido.") && ok;
      if (!ok) return;

      /* Evita cadastrar a mesma empresa duas vezes (mesmo CNPJ) */
      if (dados.cnpj) {
        var repetido = banco.listarClientes().some(function (o) {
          return o.id !== id && soNumeros(o.cnpj) === soNumeros(dados.cnpj);
        });
        if (!erro("cnpj", repetido ? "Já existe um cliente com este CNPJ." : "")) return;
      }

      banco.salvarCliente(dados);
      ui.fecharModal();
      ui.aviso(id ? "Cliente atualizado." : "Cliente cadastrado.", "sucesso");
    });

    corpo.querySelector("#cli-empresa").focus();
  }

  document.getElementById("novo-cliente").addEventListener("click", function () { abrirFormulario(null); });

  /* ==========================================================================
     5. AÇÕES NA LISTA
     ========================================================================== */
  document.getElementById("tabela-clientes").addEventListener("click", function (ev) {
    var botao = ev.target.closest("button");
    if (!botao) return;
    var editar = botao.getAttribute("data-editar");
    var alternar = botao.getAttribute("data-alternar");
    var excluir = botao.getAttribute("data-excluir");

    if (editar) abrirFormulario(editar);

    if (alternar) {
      var c = banco.buscarCliente(alternar);
      banco.salvarCliente({ id: c.id, ativo: c.ativo === false });
      ui.aviso(nomeExibido(c) + (c.ativo === false ? " ativado." : " desativado."), "info");
    }

    if (excluir) {
      var cli = banco.buscarCliente(excluir);
      var qtd = resumoDoCliente(excluir).corridas;
      if (qtd) {
        ui.aviso(nomeExibido(cli) + " tem " + u.plural(qtd, "corrida", "corridas") + " no histórico. Para não perder o histórico, desative o cliente em vez de excluir.", "erro");
        return;
      }
      ui.confirmar("Excluir " + nomeExibido(cli) + " do cadastro?").then(function (sim) {
        if (!sim) return;
        banco.excluirCliente(excluir);
        ui.aviso("Cliente excluído.", "info");
      });
    }
  });

  /* ==========================================================================
     Atualização: redesenha a lista quando a aba abre ou os dados mudam
     ========================================================================== */
  function abaClientesAberta() {
    var botao = ui.$('[data-aba="clientes"]');
    return botao && botao.classList.contains("ativo");
  }

  ui.$('[data-aba="clientes"]').addEventListener("click", desenharClientes);
  banco.aoMudar(function (chave) {
    if (!abaClientesAberta()) return;
    if (chave === "clientes" || chave === "corridas" || chave === "tudo") desenharClientes();
  });
})();
