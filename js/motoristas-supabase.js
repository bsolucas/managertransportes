/* =============================================================================
   motoristas-supabase.js — CADASTRO DE MOTORISTAS NO BANCO (SUPABASE)
   -----------------------------------------------------------------------------
   Usado pelo painel do gestor. Depende de js/auth-supabase.js.

     App.motoristasDb.listar()        -> Promise com os motoristas da empresa
     App.motoristasDb.criar(dados)    -> Promise com o id; cria também o login
         dados = { usuario, senha, nome, telefone, servicos: [..], veiculo: { modelo, placa, cor } }
     App.motoristasDb.remover(id)     -> Promise; apaga o motorista e o login dele

   Criar e remover usam as funções do banco criar_motorista / remover_motorista
   (banco/04-cadastro-motoristas.sql), que só aceitam gestor da própria empresa.
   As mensagens de erro já vêm em português.
   ============================================================================= */

App.motoristasDb = (function () {
  function sb() { return App.auth.conexao(); }

  function listar() {
    return sb().from("motoristas").select("id, nome, telefone, servicos, status, veiculo")
      .order("nome").then(function (r) {
        if (r.error) throw new Error("Não foi possível carregar os motoristas.");
        return r.data || [];
      });
  }

  function criar(d) {
    return sb().rpc("criar_motorista", {
      p_usuario: d.usuario, p_senha: d.senha, p_nome: d.nome, p_telefone: d.telefone || "",
      p_servicos: d.servicos, p_veiculo: d.veiculo
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    });
  }

  function remover(id) {
    return sb().rpc("remover_motorista", { p_id: id }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
    });
  }

  return { listar: listar, criar: criar, remover: remover };
})();
