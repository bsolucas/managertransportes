/* =============================================================================
   nuvem.js — DADOS DA EMPRESA NO SUPABASE (clientes, locais e tarifas)
   -----------------------------------------------------------------------------
   Substitui, aos poucos, o banco provisório do navegador (js/banco-local.js).
   Usado pelo painel do gestor. Depende de js/auth-supabase.js.

   Como funciona: ao iniciar, carrega os dados para a memória. Daí em diante:
     • LER é instantâneo (App.nuvem.clientes(), .locais(), .tarifas()...);
     • GRAVAR devolve uma Promise e vai para o Supabase;
     • quando qualquer aparelho muda algo, o Supabase avisa (Realtime) e a
       memória é atualizada — o painel se redesenha sozinho (App.nuvem.aoMudar).

     App.nuvem.iniciar()                        -> Promise (carrega e liga o "ao vivo")
     App.nuvem.aoMudar(function (chave) {...})  -> chave: "clientes" | "locais" | "tarifas"

     Clientes:  clientes()  buscarCliente(id)  salvarCliente(dados)
                excluirCliente(id)  definirLoginCliente(id, usuario, senha)
     Locais:    locais()  buscarLocal(id)
     Tarifas:   tarifas()  salvarTarifas(tarifas)

   Os clientes saem no mesmo formato que as telas já usavam:
     { id, nome, empresa, cnpj, telefone, email, endereco, observacoes, ativo,
       temLogin, usuarioLogin }
   As mensagens de erro já vêm em português.
   ============================================================================= */

App.nuvem = (function () {
  var dados = { clientes: [], locais: [], tarifas: null };
  var ouvintes = [];
  var iniciando = null;

  function sb() { return App.auth.conexao(); }
  function empresaId() {
    var s = App.sessao.atual();
    return s && s.empresa ? s.empresa.id : null;
  }
  function avisar(chave) { ouvintes.forEach(function (fn) { fn(chave); }); }
  function aoMudar(fn) { ouvintes.push(fn); }

  /* Traduz o erro do banco para uma mensagem clara. */
  function erroPara(e, padrao) {
    if (e && e.code === "23505") return new Error("Já existe um cliente com este CNPJ.");
    if (e && e.code === "P0001") return new Error(e.message);   // já escrito em português pelo banco
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
      temLogin: !!l.user_id, usuarioLogin: l.usuario_login || ""
    };
  }

  /* Só leva ao banco os campos que vieram em "d" (permite alterar só o "ativo"). */
  function paraBanco(d) {
    var colunas = { nome: "nome", empresa: "empresa_nome", cnpj: "cnpj", telefone: "telefone",
                    email: "email", endereco: "endereco", observacoes: "observacoes", ativo: "ativo" };
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
      if (r.error) return;
      dados.clientes = r.data.map(doBanco);
      avisar("clientes");
    });
  }
  function carregarLocais() {
    return sb().from("locais").select("id, nome, lat, lng").order("nome").then(function (r) {
      if (r.error) return;
      dados.locais = r.data;
      avisar("locais");
    });
  }
  function carregarTarifas() {
    return sb().from("tarifas").select("dados").maybeSingle().then(function (r) {
      if (r.error) return;
      dados.tarifas = r.data ? r.data.dados : null;
      avisar("tarifas");
    });
  }

  function iniciar() {
    if (iniciando) return iniciando;
    iniciando = Promise.all([carregarClientes(), carregarLocais(), carregarTarifas()]).then(function () {
      sb().channel("nuvem-empresa")
        .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, carregarClientes)
        .on("postgres_changes", { event: "*", schema: "public", table: "locais" }, carregarLocais)
        .on("postgres_changes", { event: "*", schema: "public", table: "tarifas" }, carregarTarifas)
        .subscribe();
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

  return {
    iniciar: iniciar, aoMudar: aoMudar,
    clientes: clientes, buscarCliente: buscarCliente, salvarCliente: salvarCliente,
    excluirCliente: excluirCliente, definirLoginCliente: definirLoginCliente,
    locais: locais, buscarLocal: buscarLocal, tarifas: tarifas, salvarTarifas: salvarTarifas
  };
})();
