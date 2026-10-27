/* =============================================================================
   auth-supabase.js — LOGIN REAL DO GESTOR (SUPABASE AUTH)
   -----------------------------------------------------------------------------
   Cuida de entrar, sair e saber quem está logado. Depende de:
     • a biblioteca supabase-js (carregada no HTML antes deste arquivo)
     • js/config-supabase.js (endereço e chave pública do projeto)

     App.auth.entrar(usuario, senha)  -> Promise com { id, nome, papel, empresa }
     App.auth.exigirLogin()           -> Promise; sem login válido, volta para o início
     App.auth.buscarEmpresa()         -> Promise com os dados atuais da empresa
     App.auth.buscarMotorista()       -> Promise com o cadastro do motorista logado
     App.auth.buscarCliente()         -> Promise com o cadastro do cliente logado
     App.auth.sair()                  -> Promise (encerra o login no Supabase)

   O login do Supabase fica guardado no navegador. Além dele, cada aba guarda em
   App.sessao quem está usando a aba (como antes), para o resto do app.
   ============================================================================= */

App.auth = (function () {
  var cfg = App.supabaseConfig;
  var cliente = null;

  /* Cria (uma vez só) a conexão com o Supabase. */
  function conexao() {
    if (!cliente) {
      if (!window.supabase) throw new Error("A biblioteca do Supabase não carregou. Verifique a internet.");
      cliente = window.supabase.createClient(cfg.url, cfg.chavePublica);
    }
    return cliente;
  }

  /* Perfil (nome, papel) e empresa do usuário logado. A segurança do banco
     (RLS) já devolve só o que é dele. */
  function carregarPerfil(userId) {
    return conexao().from("perfis").select("nome, papel, empresa:empresas(id, nome, sigla, logo_url, modo_uso)")
      .eq("user_id", userId).single().then(function (r) {
        if (r.error || !r.data) throw new Error("Este usuário não está ligado a nenhuma empresa.");
        return r.data;
      });
  }

  function entrar(usuario, senha) {
    var email = String(usuario || "").trim().toLowerCase() + cfg.dominioLogin;
    return conexao().auth.signInWithPassword({ email: email, password: String(senha || "") }).then(function (r) {
      if (r.error) throw new Error("Usuário ou senha incorretos.");
      return carregarPerfil(r.data.user.id).then(function (perfil) {
        return { id: r.data.user.id, nome: perfil.nome, papel: perfil.papel, empresa: perfil.empresa };
      });
    });
  }

  /* Confere que existe um login válido no Supabase. Se não, apaga a sessão
     da aba e volta para a tela inicial. */
  function exigirLogin() {
    return conexao().auth.getSession().then(function (r) {
      if (r.data && r.data.session) return r.data.session;
      sessionStorage.removeItem(App.sessao.CHAVE);
      window.location.href = App.sessao.caminhoInicio();
      return new Promise(function () {}); // não continua: a página está indo embora
    });
  }

  function buscarEmpresa() {
    return conexao().auth.getUser().then(function (r) {
      if (!r.data || !r.data.user) throw new Error("Sem login.");
      return carregarPerfil(r.data.user.id).then(function (p) { return p.empresa; });
    });
  }

  /* Cadastro (tabela "motoristas") do motorista logado. A segurança do banco
     (RLS) só devolve a linha dele; sem cadastro, o login não serve para o app. */
  function buscarMotorista() {
    return conexao().auth.getUser().then(function (r) {
      if (!r.data || !r.data.user) throw new Error("Sem login.");
      return conexao().from("motoristas").select("id, nome, telefone, servicos, status, veiculo")
        .eq("user_id", r.data.user.id).maybeSingle();
    }).then(function (r) {
      if (r.error || !r.data) throw new Error("Este usuário não tem cadastro de motorista.");
      return r.data;
    });
  }

  /* Cadastro (tabela "clientes") do cliente logado; a RLS só devolve a linha dele. */
  function buscarCliente() {
    return conexao().auth.getUser().then(function (r) {
      if (!r.data || !r.data.user) throw new Error("Sem login.");
      return conexao().from("clientes").select("id, nome, empresa_nome, telefone, ativo")
        .eq("user_id", r.data.user.id).maybeSingle();
    }).then(function (r) {
      if (r.error || !r.data) throw new Error("Este usuário não tem cadastro de cliente.");
      if (r.data.ativo === false) throw new Error("O cadastro deste cliente está desativado. Fale com a empresa.");
      return r.data;
    });
  }

  function sair() {
    try { return conexao().auth.signOut(); } catch (e) { return Promise.resolve(); }
  }

  return { entrar: entrar, exigirLogin: exigirLogin, buscarEmpresa: buscarEmpresa, buscarMotorista: buscarMotorista, buscarCliente: buscarCliente, sair: sair, conexao: conexao };
})();
