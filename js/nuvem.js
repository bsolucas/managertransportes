/* =============================================================================
   nuvem.js — DADOS DA EMPRESA NO SUPABASE (clientes, locais, tarifas, motoristas,
              corridas e chat)
   -----------------------------------------------------------------------------
   Substituiu o banco provisório do navegador (removido).
   Usado pelo painel do gestor, pela tela do motorista e pelo portal do cliente. Depende de js/auth-supabase.js.

   Como funciona: ao iniciar, carrega os dados para a memória. Daí em diante:
     • LER é instantâneo (App.nuvem.clientes(), .locais(), .tarifas()...);
     • GRAVAR devolve uma Promise e vai para o Supabase;
     • quando qualquer aparelho muda algo, o Supabase avisa (Realtime) e a
       memória é atualizada — o painel se redesenha sozinho (App.nuvem.aoMudar).

     App.nuvem.iniciar()                        -> Promise (carrega e liga o "ao vivo")
     App.nuvem.aoMudar(function (chave) {...})  -> chave: "clientes" | "locais" | "tarifas" |
                                                  "motoristas" | "corridas" | "mensagens"

     Clientes:  clientes()  buscarCliente(id)  salvarCliente(dados)
                excluirCliente(id)  definirLoginCliente(id, usuario, senha)
     Locais:    locais()  buscarLocal(id)
     Tarifas:   tarifas()  salvarTarifas(tarifas)
     Motoristas: motoristas()  buscarMotorista(id)  recarregarMotoristas()
                 meuMotorista()  definirStatusMotorista(id, status)
     Corridas:  corridas()  buscarCorrida(id)  corridaAtivaDoMotorista(id)
                criarCorrida({ clienteId, trajeto, embarque, destinoEndereco, servico, valor, observacoes })
                registrarCorridaPropria({ valor, trajeto, clienteId, concluidaEm, observacoes })  (modo individual)
                aceitarCorrida(id, motoristaId)  iniciarCorrida(id)  concluirCorrida(id)
                cancelarCorrida(id, motivo)  alterarValores(id, valor, extras)
     Chat:      listarMensagens(corridaId)  carregarMensagens(corridaId)
                enviarMensagem(corridaId, usuario, texto)  naoLidas(corridaId, chave)  marcarLidas(corridaId, chave)

   As regras da corrida (ordem das situações, motorista em corrida, chat liberado...)
   ficam no BANCO (banco/07-corridas-nuvem.sql): aqui só se pede a mudança e se
   mostra a mensagem de erro, se houver.

   Os clientes saem no mesmo formato que as telas já usavam:
     { id, nome, empresa, cnpj, telefone, email, endereco, observacoes, ativo,
       temLogin, usuarioLogin }
   As mensagens de erro já vêm em português.
   ============================================================================= */

App.nuvem = (function () {
  var dados = { clientes: [], locais: [], tarifas: null, motoristas: [], corridas: [], mensagens: {} };
  var P = App.config.PREFIXO_ARMAZENAMENTO;
  var ouvintes = [];
  var iniciando = null;

  function sb() { return App.auth.conexao(); }
  function empresaId() {
    var s = App.sessao.atual();
    return s && s.empresa ? s.empresa.id : null;
  }
  function avisar(chave) { ouvintes.forEach(function (fn) { fn(chave); }); }

  /* Recarregar a cada aviso do Realtime (e de 30 em 30 s) não deve redesenhar a tela se nada mudou:
     redesenhar no meio de um toque ou clique faz o clique se perder. Guarda a última versão de cada lista. */
  var ultimaVersao = {};
  function mudou(chave, linhas) {
    var texto = JSON.stringify(linhas);
    if (ultimaVersao[chave] === texto) return false;
    ultimaVersao[chave] = texto;
    return true;
  }
  function aoMudar(fn) { ouvintes.push(fn); }

  /* Traduz o erro do banco para uma mensagem clara. */
  function erroPara(e, padrao) {
    if (e && e.code === "23505") return new Error("Já existe um cliente com este CNPJ.");
    if (e && e.code === "P0001") return new Error(e.message);   // já escrito em português pelo banco
    if (e && e.code === "42501") return new Error("Você não tem permissão para fazer isso.");
    return new Error(padrao);
  }

  /* ------------------------------------------------------------------------
     Formato: banco (colunas) <-> telas (campos)
     ------------------------------------------------------------------------ */
  function doBanco(l) {
    return {
      id: l.id, nome: l.nome, empresa: l.empresa_nome || "", cnpj: l.cnpj || "",
      telefone: l.telefone || "", email: l.email || "", endereco: l.endereco || "",
      observacoes: l.observacoes || "", ativo: l.ativo !== false,
      temLogin: !!l.user_id, usuarioLogin: l.usuario_login || "", modoSolicitacao: l.modo_solicitacao || "gestor"
    };
  }

  /* Só leva ao banco os campos que vieram em "d" (permite alterar só o "ativo"). */
  function paraBanco(d) {
    var colunas = { nome: "nome", empresa: "empresa_nome", cnpj: "cnpj", telefone: "telefone",
                    email: "email", endereco: "endereco", observacoes: "observacoes", ativo: "ativo", modoSolicitacao: "modo_solicitacao" };
    var linha = {};
    Object.keys(colunas).forEach(function (campo) {
      if (d[campo] === undefined) return;
      linha[colunas[campo]] = (typeof d[campo] === "string" && campo !== "nome") ? (d[campo].trim() || null) : d[campo];
    });
    return linha;
  }

  /* ------------------------------------------------------------------------
     Carregar (e recarregar quando o Supabase avisa que algo mudou)
     ------------------------------------------------------------------------ */
  function carregarClientes() {
    return sb().from("clientes").select("*").then(function (r) {
      if (r.error || !mudou("clientes", r.data)) return;
      dados.clientes = r.data.map(doBanco);
      avisar("clientes");
    });
  }
  function carregarLocais() {
    return sb().from("locais").select("id, nome, lat, lng").order("nome").then(function (r) {
      if (r.error || !mudou("locais", r.data)) return;
      dados.locais = r.data;
      avisar("locais");
    });
  }
  function carregarTarifas() {
    return sb().from("tarifas").select("dados").maybeSingle().then(function (r) {
      if (r.error || !mudou("tarifas", r.data)) return;
      dados.tarifas = r.data ? r.data.dados : null;
      avisar("tarifas");
    });
  }

  /* ------------------------------------------------------------------------
     Motoristas, corridas e mensagens: formato das telas <-> colunas do banco
     ------------------------------------------------------------------------ */
  function ms(texto) { return texto ? Date.parse(texto) : null; }

  function motoristaDoBanco(l) {
    return { id: l.id, nome: l.nome, telefone: l.telefone || "", avaliacao: l.avaliacao, servicos: l.servicos || [],
             status: l.status, veiculo: l.veiculo || {} };
  }

  function corridaDoBanco(l) {
    return {
      id: l.id, codigo: "#" + l.codigo, clienteId: l.cliente_id,
      clienteNome: l.cliente_nome || "", clienteTelefone: l.cliente_telefone || "",
      motoristaId: l.motorista_id, trajeto: l.trajeto || "", embarque: l.embarque || "", destinoEndereco: l.destino_endereco || "",
      servico: l.servico, valor: Number(l.valor) || 0, extras: l.extras || [],
      observacoes: l.observacoes || "", status: l.status,
      criadaEm: ms(l.criada_em), aceitaEm: ms(l.aceita_em), iniciadaEm: ms(l.iniciada_em),
      concluidaEm: ms(l.concluida_em), canceladaEm: ms(l.cancelada_em),
      motivoCancelamento: l.motivo_cancelamento || "", valorEditadoEm: ms(l.valor_editado_em), valorDefinido: l.valor_definido !== false,
      comissaoPercentual: l.comissao_percentual === null || l.comissao_percentual === undefined ? null : Number(l.comissao_percentual),
      comissaoValor: l.comissao_valor === null || l.comissao_valor === undefined ? null : Number(l.comissao_valor),
      historico: l.historico || []
    };
  }

  function mensagemDoBanco(l) {
    return { id: l.id, corridaId: l.corrida_id, autorTipo: l.autor_tipo, autorId: l.autor_id,
             autorNome: l.autor_nome || "", texto: l.texto, em: ms(l.criada_em) };
  }

  function carregarMotoristas() {
    return sb().from("motoristas").select("id, nome, telefone, avaliacao, servicos, status, veiculo").order("nome").then(function (r) {
      if (r.error || !mudou("motoristas", r.data)) return;
      dados.motoristas = r.data.map(motoristaDoBanco);
      avisar("motoristas");
    });
  }

  /* Só as corridas feitas pelo app (as importadas de planilha têm tela própria). */
  function carregarCorridas() {
    return sb().from("corridas").select("*").eq("fonte", "app").order("criada_em", { ascending: false }).limit(500)
      .then(function (r) {
        if (r.error || !mudou("corridas", r.data)) return;
        dados.corridas = r.data.map(corridaDoBanco);
        avisar("corridas");
      });
  }

  /* Conversas que aparecem nas listas: corridas em andamento e as encerradas há pouco. */
  function carregarMensagensRecentes() {
    var corte = Date.now() - 2 * 3600000;
    var ids = dados.corridas.filter(function (c) {
      return c.status === "aceita" || c.status === "em_andamento" || c.status === "aguardando" ||
             (c.concluidaEm || c.canceladaEm || 0) > corte;
    }).map(function (c) { return c.id; });
    if (!ids.length) return Promise.resolve();
    return sb().from("mensagens").select("*").in("corrida_id", ids).order("criada_em").then(function (r) {
      if (r.error) return;
      ids.forEach(function (id) { dados.mensagens[id] = []; });
      r.data.forEach(function (l) { dados.mensagens[l.corrida_id].push(mensagemDoBanco(l)); });
      avisar("mensagens");
    });
  }

  /* Recarrega a lista de corridas no máximo uma vez a cada 300 ms (vários avisos juntos). */
  var recargaAgendada = null;
  function agendarRecargaCorridas() {
    if (recargaAgendada) return;
    recargaAgendada = setTimeout(function () { recargaAgendada = null; carregarCorridas(); }, 300);
  }

  function aoChegarMensagem(payload) {
    var l = payload.new;
    if (!l || !l.corrida_id) return;
    var lista = dados.mensagens[l.corrida_id] = dados.mensagens[l.corrida_id] || [];
    if (lista.some(function (m) { return m.id === l.id; })) return;
    lista.push(mensagemDoBanco(l));
    avisar("mensagens");
  }

  function iniciar() {
    if (iniciando) return iniciando;
    iniciando = Promise.all([carregarClientes(), carregarLocais(), carregarTarifas(), carregarMotoristas(), carregarCorridas()])
      .then(carregarMensagensRecentes)   // as novas mensagens chegam ao vivo (Realtime)
      .then(function () {
        sb().channel("nuvem-empresa")
          .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, carregarClientes)
          .on("postgres_changes", { event: "*", schema: "public", table: "locais" }, carregarLocais)
          .on("postgres_changes", { event: "*", schema: "public", table: "tarifas" }, carregarTarifas)
          .on("postgres_changes", { event: "*", schema: "public", table: "motoristas" }, carregarMotoristas)
          .on("postgres_changes", { event: "*", schema: "public", table: "corridas" }, agendarRecargaCorridas)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, aoChegarMensagem)
          .subscribe();
        /* Rede de segurança: uma corrida que o motorista não pode mais ver (outro aceitou)
           não gera aviso ao vivo, então a lista é conferida de tempos em tempos. */
        setInterval(carregarCorridas, 30000);
      });
    return iniciando;
  }

  /* ------------------------------------------------------------------------
     Clientes
     ------------------------------------------------------------------------ */
  function clientes() { return dados.clientes; }
  function buscarCliente(id) {
    return dados.clientes.filter(function (c) { return c.id === id; })[0] || null;
  }

  /* Com "id" atualiza; sem "id" cria. Devolve o cliente gravado. */
  function salvarCliente(d) {
    var linha = paraBanco(d);
    var consulta = d.id
      ? sb().from("clientes").update(linha).eq("id", d.id)
      : sb().from("clientes").insert(Object.assign({ empresa_id: empresaId() }, linha));
    return consulta.select().single().then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível salvar o cliente.");
      var salvo = doBanco(r.data);
      dados.clientes = dados.clientes.filter(function (c) { return c.id !== salvo.id; }).concat(salvo);
      avisar("clientes");
      return salvo;
    });
  }

  function excluirCliente(id) {
    return sb().rpc("remover_cliente", { p_id: id }).then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível excluir o cliente.");
      dados.clientes = dados.clientes.filter(function (c) { return c.id !== id; });
      avisar("clientes");
    });
  }

  /* Cria o login do cliente (usuário + senha) ou, se já tem, troca a senha. */
  function definirLoginCliente(id, usuario, senha) {
    return sb().rpc("definir_login_cliente", { p_cliente_id: id, p_usuario: usuario, p_senha: senha }).then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível definir o login do cliente.");
      return carregarClientes();
    });
  }

  /* ------------------------------------------------------------------------
     Locais e tarifas
     ------------------------------------------------------------------------ */
  function locais() { return dados.locais; }
  function buscarLocal(id) {
    return dados.locais.filter(function (l) { return l.id === id; })[0] || null;
  }

  /* Se a empresa ainda não tem tarifas gravadas, usa as padrão do app. */
  function tarifas() { return dados.tarifas || App.dadosTeste.tarifas; }

  function salvarTarifas(t) {
    return sb().from("tarifas").upsert({ empresa_id: empresaId(), dados: t, atualizado_em: new Date().toISOString() })
      .then(function (r) {
        if (r.error) throw new Error("Não foi possível salvar as tarifas.");
        dados.tarifas = t;
        avisar("tarifas");
      });
  }

  /* ------------------------------------------------------------------------
     Motoristas
     ------------------------------------------------------------------------ */
  function motoristas() { return dados.motoristas; }
  function buscarMotorista(id) {
    return dados.motoristas.filter(function (m) { return m.id === id; })[0] || null;
  }
  /* Na tela do motorista, o banco só devolve o cadastro dele mesmo. */
  function meuMotorista() { return dados.motoristas[0] || null; }

  /* Disponível / offline: muda na tela na hora e grava no banco. */
  function definirStatusMotorista(id, status) {
    var m = buscarMotorista(id);
    if (m) { m.status = status; avisar("motoristas"); }
    return App.rastreio.definirStatus(id, status);
  }

  /* ------------------------------------------------------------------------
     Corridas
     ------------------------------------------------------------------------ */
  function corridas() { return dados.corridas; }
  function buscarCorrida(id) {
    return dados.corridas.filter(function (c) { return c.id === id; })[0] || null;
  }
  function corridaAtivaDoMotorista(motoristaId) {
    return dados.corridas.filter(function (c) {
      return c.motoristaId === motoristaId && (c.status === "aceita" || c.status === "em_andamento");
    })[0] || null;
  }

  /* Põe a corrida devolvida pelo banco na memória e avisa as telas. */
  function guardarCorrida(linha) {
    var c = corridaDoBanco(linha);
    dados.corridas = dados.corridas.filter(function (x) { return x.id !== c.id; }).concat(c)
      .sort(function (a, b) { return b.criadaEm - a.criadaEm; });
    avisar("corridas");
    return c;
  }

  /* Gestor ou o cliente pede uma corrida. O valor vem do trajeto, mas pode ser ajustado. */
  function criarCorrida(d) {
    return sb().from("corridas").insert({
      empresa_id: empresaId(), cliente_id: d.clienteId, trajeto: d.trajeto, embarque: d.embarque || null, destino_endereco: d.destinoEndereco || null,
      servico: d.servico || "carro", valor: d.valor, observacoes: d.observacoes || null,
      modo_preco: "fixo", fonte: "app"
    }).select().single().then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível criar a corrida.");
      return guardarCorrida(r.data);
    });
  }

  /* Quem trabalha sozinho (plano Básico, modo individual) registra a PRÓPRIA corrida já concluída,
     com o valor que recebeu. d = { valor, trajeto?, clienteId?, concluidaEm? (ms), observacoes? } */
  function registrarCorridaPropria(d) {
    return sb().from("corridas").insert({
      empresa_id: empresaId(), status: "concluida", valor: d.valor, trajeto: d.trajeto || null,
      cliente_id: d.clienteId || null, observacoes: d.observacoes || null, servico: "carro",
      modo_preco: "fixo", fonte: "app",
      concluida_em: d.concluidaEm ? new Date(d.concluidaEm).toISOString() : null
    }).select().single().then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível registrar a corrida.");
      return guardarCorrida(r.data);
    });
  }

  /* Muda a corrida. "somenteSe" (ex.: { status: "aguardando" }) evita pisar em outra mudança:
     se a condição não vale mais, nenhuma linha é alterada. */
  function mudarCorrida(id, campos, somenteSe, textoSeFalhar) {
    var consulta = sb().from("corridas").update(campos).eq("id", id);
    Object.keys(somenteSe || {}).forEach(function (k) { consulta = consulta.eq(k, somenteSe[k]); });
    return consulta.select().then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível atualizar a corrida.");
      if (!r.data.length) { agendarRecargaCorridas(); throw new Error(textoSeFalhar); }
      return guardarCorrida(r.data[0]);
    });
  }

  /* Remove corridas CANCELADAS (o banco recusa qualquer outra). Apaga junto o chat e as notificações delas.
     ids = lista de ids; sem argumento, remove todas as canceladas. Devolve quantas foram removidas. */
  function removerCanceladas(ids) {
    var alvo = ids || dados.corridas.filter(function (c) { return c.status === "cancelada"; }).map(function (c) { return c.id; });
    if (!alvo.length) return Promise.resolve(0);
    return sb().from("corridas").delete().in("id", alvo).eq("status", "cancelada").select("id").then(function (r) {
      if (r.error) throw erroPara(r.error, "Não foi possível remover as corridas.");
      var apagadas = r.data.map(function (l) { return l.id; });
      dados.corridas = dados.corridas.filter(function (c) { return apagadas.indexOf(c.id) === -1; });
      apagadas.forEach(function (id) { delete dados.mensagens[id]; });
      avisar("corridas");
      return apagadas.length;
    });
  }

  /* O banco garante que só UM motorista consegue aceitar. */
  function aceitarCorrida(id, motoristaId) {
    return mudarCorrida(id, { status: "aceita", motorista_id: motoristaId }, { status: "aguardando" },
      "Outro motorista aceitou primeiro.").then(function (c) { carregarMotoristas(); return c; });
  }
  function iniciarCorrida(id) {
    return mudarCorrida(id, { status: "em_andamento" }, { status: "aceita" }, "Esta corrida não pode ser iniciada agora.");
  }
  function concluirCorrida(id) {
    return mudarCorrida(id, { status: "concluida" }, { status: "em_andamento" }, "Esta corrida não pode ser concluída agora.")
      .then(function (c) { carregarMotoristas(); return c; });
  }
  function cancelarCorrida(id, motivo) {
    return mudarCorrida(id, { status: "cancelada", motivo_cancelamento: motivo || null }, {}, "Não foi possível cancelar a corrida.")
      .then(function (c) { carregarMotoristas(); return c; });
  }
  function alterarValores(id, valor, extras) {
    return mudarCorrida(id, { valor: App.utils.arredondar(Number(valor) || 0), extras: extras }, {}, "Não foi possível salvar os valores.");
  }

  /* ------------------------------------------------------------------------
     Chat
     ------------------------------------------------------------------------ */
  function listarMensagens(corridaId) { return dados.mensagens[corridaId] || []; }

  /* Traz a conversa de uma corrida que ainda não está na memória (ex.: uma corrida antiga). */
  function carregarMensagens(corridaId) {
    return sb().from("mensagens").select("*").eq("corrida_id", corridaId).order("criada_em").then(function (r) {
      if (r.error) return;
      dados.mensagens[corridaId] = r.data.map(mensagemDoBanco);
      avisar("mensagens");
    });
  }

  /* O banco define quem escreveu (pelo login) e confere se o chat está liberado. */
  function enviarMensagem(corridaId, usuario, texto) {
    return sb().from("mensagens").insert({ corrida_id: corridaId, empresa_id: empresaId(), autor_tipo: "gestor", texto: texto })
      .select().single().then(function (r) {
        if (r.error) throw erroPara(r.error, "Não foi possível enviar a mensagem.");
        aoChegarMensagem({ new: r.data });
      });
  }

  /* "Lidas" é uma preferência de cada aparelho: fica só no navegador. */
  function naoLidas(corridaId, chave) {
    var lido = 0;
    try { lido = (JSON.parse(localStorage.getItem(P + "leitura") || "{}"))[chave + ":" + corridaId] || 0; } catch (e) { /* sem leitura guardada */ }
    return listarMensagens(corridaId).filter(function (m) {
      return m.autorTipo !== "sistema" && (m.autorTipo + ":" + m.autorId) !== chave && m.em > lido;
    }).length;
  }
  function marcarLidas(corridaId, chave) {
    try {
      var lidas = JSON.parse(localStorage.getItem(P + "leitura") || "{}");
      lidas[chave + ":" + corridaId] = Date.now();
      localStorage.setItem(P + "leitura", JSON.stringify(lidas));
    } catch (e) { /* sem armazenamento: tudo bem */ }
  }

  return {
    iniciar: iniciar, aoMudar: aoMudar,
    motoristas: motoristas, buscarMotorista: buscarMotorista, meuMotorista: meuMotorista,
    recarregarMotoristas: carregarMotoristas, definirStatusMotorista: definirStatusMotorista,
    corridas: corridas, buscarCorrida: buscarCorrida, corridaAtivaDoMotorista: corridaAtivaDoMotorista,
    criarCorrida: criarCorrida, registrarCorridaPropria: registrarCorridaPropria, aceitarCorrida: aceitarCorrida, iniciarCorrida: iniciarCorrida,
    concluirCorrida: concluirCorrida, cancelarCorrida: cancelarCorrida, removerCanceladas: removerCanceladas, alterarValores: alterarValores,
    listarMensagens: listarMensagens, carregarMensagens: carregarMensagens, enviarMensagem: enviarMensagem,
    naoLidas: naoLidas, marcarLidas: marcarLidas,
    clientes: clientes, buscarCliente: buscarCliente, salvarCliente: salvarCliente,
    excluirCliente: excluirCliente, definirLoginCliente: definirLoginCliente,
    locais: locais, buscarLocal: buscarLocal, tarifas: tarifas, salvarTarifas: salvarTarifas
  };
})();
