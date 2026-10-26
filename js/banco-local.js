/* =============================================================================
   banco-local.js — "BANCO DE DADOS" PROVISÓRIO NO NAVEGADOR
   -----------------------------------------------------------------------------
   Enquanto não temos back-end, os dados ficam no localStorage do navegador.
   Vantagens para os testes:
     • os dados continuam lá quando você recarrega a página;
     • TODAS as abas abertas do mesmo navegador enxergam os mesmos dados.
       Ex.: abra o Portal do Cliente numa aba e o Painel do Gestor em outra:
       a corrida pedida numa aparece na outra quase na hora.

   Quando existir o back-end, SÓ ESTE ARQUIVO precisa mudar: as telas continuam
   chamando App.banco.listarCorridas(), App.banco.aceitarCorrida()... e por
   dentro essas funções passam a conversar com o servidor (API).

   Coleções guardadas: gestor, locais, motoristas, clientes, tarifas,
                       corridas, mensagens.
   ============================================================================= */

App.banco = (function () {
  var P = App.config.PREFIXO_ARMAZENAMENTO;
  var ouvintes = [];

  /* Aumente este número sempre que mudar os DADOS DE TESTE (locais, motoristas...).
     Navegadores com dados de uma versão antiga recomeçam com os dados novos.
     v1 = São Paulo | v2 = Guaíba-RS */
  var VERSAO_DADOS = 2;

  /* ------------------------------------------------------------------------
     Leitura e gravação básicas (com JSON)
     ------------------------------------------------------------------------ */
  function ler(chave, padrao) {
    try {
      var bruto = localStorage.getItem(P + chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(P + chave, JSON.stringify(valor));
    } catch (e) {
      console.warn("Não foi possível gravar no armazenamento local:", e);
    }
    avisar(chave); // avisa a PRÓPRIA aba (as outras recebem o evento "storage")
  }

  /* Avisa as telas que algo mudou, para elas se redesenharem. */
  function avisar(chave) {
    ouvintes.forEach(function (fn) { fn(chave); });
  }

  /* Quando OUTRA aba grava algo, o navegador dispara o evento "storage". */
  window.addEventListener("storage", function (ev) {
    if (ev.key && ev.key.indexOf(P) === 0) avisar(ev.key.slice(P.length));
  });

  /* ------------------------------------------------------------------------
     Inicialização com os dados de teste
     ------------------------------------------------------------------------ */
  function iniciar() {
    if (ler("versao", null) === VERSAO_DADOS) return; // já tem dados desta versão: não sobrescreve
    limparTudo();                                       // dados de versão antiga (ou nenhum): recomeça
    var d = App.dadosTeste;
    gravar("gestor", d.gestor);
    gravar("locais", d.locais);
    gravar("clientes", d.clientes);
    gravar("motoristas", d.motoristas.map(function (m) { return Object.assign({}, m); }));
    gravar("tarifas", JSON.parse(JSON.stringify(d.tarifas)));
    gravar("mensagens", []);
    gravar("contadorCorridas", 1000);
    gravar("corridas", []);
    criarCorridasIniciais();
    gravar("versao", VERSAO_DADOS);
  }

  /* Monta as corridas de exemplo com horários relativos a "agora". */
  function criarCorridasIniciais() {
    var agora = Date.now();
    var corridas = App.dadosTeste.corridasIniciais.map(function (c) {
      var origem = buscarLocal(c.origem);
      var destino = buscarLocal(c.destino);
      var calc = App.precos.calcular({
        origem: origem, destino: destino, servico: c.servico, modo: c.modo, ocasioes: c.ocasioes
      }, ler("tarifas"));
      var criada = agora - c.minAtras * 60000;
      var corrida = novaCorridaBase({
        clienteId: c.cliente, origem: origem, destino: destino, servico: c.servico,
        modo: c.modo, ocasioes: c.ocasioes, calculo: calc, observacoes: ""
      });
      corrida.criadaEm = criada;
      corrida.historico = [{ status: "aguardando", em: criada }];
      corrida.extras = c.extras || [];
      corrida.status = c.status;
      if (c.motorista) {
        corrida.motoristaId = c.motorista;
        corrida.aceitaEm = criada + 60000;
        corrida.iniciadaEm = criada + 6 * 60000;
        corrida.historico.push({ status: "aceita", em: corrida.aceitaEm });
        corrida.historico.push({ status: "em_andamento", em: corrida.iniciadaEm });
      }
      if (c.status === "concluida") {
        corrida.concluidaEm = corrida.iniciadaEm + calc.tempoMin * 60000;
        corrida.historico.push({ status: "concluida", em: corrida.concluidaEm });
      }
      if (c.status === "cancelada") {
        corrida.canceladaEm = criada + 3 * 60000;
        corrida.historico.push({ status: "cancelada", em: corrida.canceladaEm });
      }
      return corrida;
    });
    gravar("corridas", corridas);
  }

  /* Estrutura padrão de uma corrida (todas as corridas têm estes campos). */
  function novaCorridaBase(dados) {
    var contador = ler("contadorCorridas", 1000) + 1;
    gravar("contadorCorridas", contador);
    return {
      id: App.utils.novoId("cor"),
      codigo: "#" + contador,             // número amigável mostrado na tela
      clienteId: dados.clienteId,
      motoristaId: null,
      origem: dados.origem,               // { id, nome, lat, lng }
      destino: dados.destino,
      servico: dados.servico,             // carro | utilitario | guincho
      modoPreco: dados.calculo.modoUsado, // fixo | variavel
      ocasioes: dados.ocasioes || [],
      valor: dados.calculo.valor,         // valor calculado da corrida
      calculo: dados.calculo,             // detalhes (linhas do preço)
      extras: [],                         // [{ descricao, valor }]
      observacoes: dados.observacoes || "",
      status: "aguardando",
      criadaEm: Date.now(),
      aceitaEm: null, iniciadaEm: null, concluidaEm: null, canceladaEm: null,
      partidaMotorista: null,             // onde o motorista estava ao aceitar
      historico: [{ status: "aguardando", em: Date.now() }]
    };
  }

  function buscarLocal(id) {
    return ler("locais", []).find(function (l) { return l.id === id; });
  }

  /* ------------------------------------------------------------------------
     Corridas
     ------------------------------------------------------------------------ */
  function listarCorridas() { return ler("corridas", []); }

  function buscarCorrida(id) {
    return listarCorridas().find(function (c) { return c.id === id; }) || null;
  }

  /* Altera uma corrida aplicando uma função de mudança e grava. */
  function atualizarCorrida(id, mudar) {
    var corridas = listarCorridas();
    var corrida = corridas.find(function (c) { return c.id === id; });
    if (!corrida) return null;
    mudar(corrida);
    gravar("corridas", corridas);
    return corrida;
  }

  function mudarStatus(corrida, status) {
    corrida.status = status;
    corrida.historico.push({ status: status, em: Date.now() });
  }

  /* Cliente (ou gestor) pede uma corrida nova. */
  function criarCorrida(dados) {
    var corrida = novaCorridaBase(dados);
    var corridas = listarCorridas();
    corridas.push(corrida);
    gravar("corridas", corridas);
    enviarMensagemSistema(corrida.id, "Corrida " + corrida.codigo + " solicitada. Aguardando um motorista aceitar.");
    return corrida;
  }

  /* Motorista (ou gestor, ou a simulação) aceita a corrida. */
  function aceitarCorrida(corridaId, motoristaId, quemAceitou) {
    var motorista = buscarMotorista(motoristaId);
    var corrida = atualizarCorrida(corridaId, function (c) {
      if (c.status !== "aguardando") return;
      c.motoristaId = motoristaId;
      c.aceitaEm = Date.now();
      c.partidaMotorista = App.simulacao.posicaoMotorista(motorista, Date.now());
      mudarStatus(c, "aceita");
    });
    if (!corrida || corrida.motoristaId !== motoristaId) return null;
    atualizarMotorista(motoristaId, { status: "em_corrida" });
    enviarMensagemSistema(corridaId, motorista.nome + " aceitou a corrida" +
      (quemAceitou === "gestor" ? " (designado pelo gestor)" : "") +
      ". Veículo: " + motorista.veiculo.modelo + " • " + motorista.veiculo.placa + ".");
    return corrida;
  }

  /* Motorista chegou na origem e começa o trajeto. */
  function iniciarCorrida(corridaId) {
    var corrida = atualizarCorrida(corridaId, function (c) {
      if (c.status !== "aceita") return;
      c.iniciadaEm = Date.now();
      mudarStatus(c, "em_andamento");
    });
    if (corrida) enviarMensagemSistema(corridaId, "Corrida iniciada. A caminho de " + corrida.destino.nome + ".");
    return corrida;
  }

  /* Corrida terminou: libera o motorista. */
  function concluirCorrida(corridaId) {
    var corrida = atualizarCorrida(corridaId, function (c) {
      if (c.status !== "em_andamento") return;
      c.concluidaEm = Date.now();
      mudarStatus(c, "concluida");
    });
    if (corrida && corrida.motoristaId) {
      liberarMotorista(corrida.motoristaId);
      enviarMensagemSistema(corridaId, "Corrida concluída. Total: " + App.utils.moeda(App.precos.totalCorrida(corrida)) + ".");
    }
    return corrida;
  }

  function cancelarCorrida(corridaId, motivo) {
    var corrida = atualizarCorrida(corridaId, function (c) {
      if (c.status === "concluida" || c.status === "cancelada") return;
      c.canceladaEm = Date.now();
      c.motivoCancelamento = motivo || "";
      mudarStatus(c, "cancelada");
    });
    if (corrida && corrida.motoristaId) liberarMotorista(corrida.motoristaId);
    if (corrida) enviarMensagemSistema(corridaId, "Corrida cancelada" + (motivo ? ": " + motivo : "") + ".");
    return corrida;
  }

  /* O motorista volta a ficar disponível, a menos que tenha outra corrida ativa. */
  function liberarMotorista(motoristaId) {
    var outraAtiva = listarCorridas().some(function (c) {
      return c.motoristaId === motoristaId && (c.status === "aceita" || c.status === "em_andamento");
    });
    if (!outraAtiva) atualizarMotorista(motoristaId, { status: "disponivel", ultimaLiberacao: Date.now() });
  }

  /* Gestor ajusta o valor (ex.: negociação) e os extras. */
  function alterarValores(corridaId, novoValor, extras) {
    return atualizarCorrida(corridaId, function (c) {
      c.valor = App.utils.arredondar(Number(novoValor) || 0);
      c.extras = extras;
      c.valorEditadoEm = Date.now();
    });
  }

  /* ------------------------------------------------------------------------
     Motoristas
     ------------------------------------------------------------------------ */
  function listarMotoristas() { return ler("motoristas", []); }

  function buscarMotorista(id) {
    return listarMotoristas().find(function (m) { return m.id === id; }) || null;
  }

  /* Motorista com login real (Supabase): o resto do app ainda usa o banco local,
     então cria aqui uma cópia dele (mesmo id) se ainda não existir. O status
     "em_corrida" do Supabase não vale aqui: a corrida local é que manda. */
  function garantirMotorista(dados) {
    if (buscarMotorista(dados.id)) return buscarMotorista(dados.id);
    var lista = listarMotoristas();
    var modelo = lista[0] || {};
    var novo = {
      id: dados.id, nome: dados.nome, telefone: dados.telefone || "", avaliacao: 5.0,
      servicos: dados.servicos && dados.servicos.length ? dados.servicos : ["carro"],
      status: dados.status === "disponivel" ? "disponivel" : "offline",
      veiculo: Object.assign({ modelo: "Veículo", placa: "---", cor: "" }, dados.veiculo),
      rotaLivre: modelo.rotaLivre || []   // percurso de simulação, só para o mapa de teste
    };
    lista.push(novo);
    gravar("motoristas", lista);
    return novo;
  }

  function atualizarMotorista(id, campos) {
    var lista = listarMotoristas();
    var m = lista.find(function (x) { return x.id === id; });
    if (!m) return null;
    Object.assign(m, campos);
    gravar("motoristas", lista);
    return m;
  }

  /* Corrida ativa (aceita ou em andamento) de um motorista, se houver. */
  function corridaAtivaDoMotorista(motoristaId) {
    return listarCorridas().find(function (c) {
      return c.motoristaId === motoristaId && (c.status === "aceita" || c.status === "em_andamento");
    }) || null;
  }

  /* Marca que um motorista está sendo controlado por uma pessoa (aba aberta
     na tela do motorista). A simulação automática não mexe nesse motorista. */
  function marcarControleManual(motoristaId) {
    var controles = ler("controleManual", {});
    controles[motoristaId] = Date.now();
    try { localStorage.setItem(P + "controleManual", JSON.stringify(controles)); } catch (e) {}
  }

  function estaSobControleManual(motoristaId) {
    var ts = ler("controleManual", {})[motoristaId];
    return ts && Date.now() - ts < 6000; // "batida de coração" a cada 2 s
  }

  /* ------------------------------------------------------------------------
     Mensagens (chat de cada corrida)
     ------------------------------------------------------------------------ */
  function listarMensagens(corridaId) {
    return ler("mensagens", []).filter(function (m) { return m.corridaId === corridaId; });
  }

  function enviarMensagem(corridaId, autor, texto) {
    var lista = ler("mensagens", []);
    var msg = {
      id: App.utils.novoId("msg"),
      corridaId: corridaId,
      autorTipo: autor.tipo,   // cliente | motorista | gestor | sistema
      autorId: autor.id,
      autorNome: autor.nome,
      texto: String(texto).slice(0, 1000),
      em: Date.now()
    };
    lista.push(msg);
    gravar("mensagens", lista);
    return msg;
  }

  function enviarMensagemSistema(corridaId, texto) {
    return enviarMensagem(corridaId, { tipo: "sistema", id: "sistema", nome: "Sistema" }, texto);
  }

  /* Mensagens não lidas por um usuário (guardamos quando ele leu por último). */
  function naoLidas(corridaId, usuarioChave) {
    var lidas = ler("leitura", {});
    var ultima = lidas[usuarioChave + ":" + corridaId] || 0;
    return listarMensagens(corridaId).filter(function (m) {
      return m.em > ultima && m.autorTipo !== "sistema" && (m.autorTipo + ":" + m.autorId) !== usuarioChave;
    }).length;
  }

  function marcarLidas(corridaId, usuarioChave) {
    var lidas = ler("leitura", {});
    lidas[usuarioChave + ":" + corridaId] = Date.now();
    try { localStorage.setItem(P + "leitura", JSON.stringify(lidas)); } catch (e) {}
  }

  /* ------------------------------------------------------------------------
     Tarifas, locais, clientes
     ------------------------------------------------------------------------ */
  function obterTarifas() { return ler("tarifas", App.dadosTeste.tarifas); }
  function salvarTarifas(t) { gravar("tarifas", t); }
  function listarLocais() { return ler("locais", []); }
  function listarClientes() { return ler("clientes", []); }
  function buscarCliente(id) {
    return listarClientes().find(function (c) { return c.id === id; }) || null;
  }
  function obterGestor() { return ler("gestor", App.dadosTeste.gestor); }
  function obterEmpresa() { return ler("empresa", App.dadosTeste.empresa); }

  /* Cadastro de clientes (empresas terceirizadas que pedem corridas).
     salvarCliente: se o cliente já tem "id", atualiza; senão, cria um novo.
     Devolve o cliente gravado. */
  function salvarCliente(dados) {
    var lista = listarClientes();
    var cliente = Object.assign({ ativo: true }, dados);
    if (cliente.id) {
      lista = lista.map(function (c) { return c.id === cliente.id ? Object.assign({}, c, cliente) : c; });
    } else {
      cliente.id = App.utils.novoId("cli");
      lista.push(cliente);
    }
    gravar("clientes", lista);
    return buscarCliente(cliente.id);
  }

  /* Remove o cliente do cadastro. Quem tem corridas não pode ser excluído
     (o histórico precisa do nome); nesse caso o gestor deve "desativar". */
  function excluirCliente(id) {
    gravar("clientes", listarClientes().filter(function (c) { return c.id !== id; }));
  }

  /* Apaga tudo o que o app guardou no navegador (menos a preferência da simulação). */
  function limparTudo() {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf(P) === 0 && k !== P + "simAuto") localStorage.removeItem(k);
    });
  }

  /* Apaga tudo e recomeça com os dados de teste. */
  function resetar() {
    limparTudo();
    iniciar();
    avisar("tudo");
  }

  /* Registra uma função que será chamada sempre que os dados mudarem. */
  function aoMudar(fn) { ouvintes.push(fn); }

  /* ------------------------------------------------------------------------
     O que fica disponível para as outras partes do app
     ------------------------------------------------------------------------ */
  return {
    iniciar: iniciar, resetar: resetar, aoMudar: aoMudar,
    listarCorridas: listarCorridas, buscarCorrida: buscarCorrida, criarCorrida: criarCorrida,
    aceitarCorrida: aceitarCorrida, iniciarCorrida: iniciarCorrida,
    concluirCorrida: concluirCorrida, cancelarCorrida: cancelarCorrida,
    alterarValores: alterarValores,
    listarMotoristas: listarMotoristas, buscarMotorista: buscarMotorista,
    garantirMotorista: garantirMotorista,
    atualizarMotorista: atualizarMotorista, corridaAtivaDoMotorista: corridaAtivaDoMotorista,
    marcarControleManual: marcarControleManual, estaSobControleManual: estaSobControleManual,
    listarMensagens: listarMensagens, enviarMensagem: enviarMensagem,
    enviarMensagemSistema: enviarMensagemSistema, naoLidas: naoLidas, marcarLidas: marcarLidas,
    obterTarifas: obterTarifas, salvarTarifas: salvarTarifas,
    listarLocais: listarLocais, buscarLocal: buscarLocal,
    listarClientes: listarClientes, buscarCliente: buscarCliente, obterGestor: obterGestor,
    obterEmpresa: obterEmpresa, salvarCliente: salvarCliente, excluirCliente: excluirCliente
  };
})();
