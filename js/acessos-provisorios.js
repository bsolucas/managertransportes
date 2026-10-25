/* =============================================================================
   acessos-provisorios.js — USUÁRIOS E SENHAS PROVISÓRIOS DO GESTOR
   -----------------------------------------------------------------------------
   ATENÇÃO: isto é só para a fase de testes. Como o app ainda é um site
   estático (sem servidor), estes usuários e senhas ficam visíveis no código que
   o navegador baixa — qualquer pessoa que abrir o site pode lê-los. NÃO use
   senhas importantes aqui.

   Quando o banco de dados (Supabase) estiver ligado, este arquivo deixa de
   existir: o login passa a ser feito pelo Supabase Auth, com senha protegida.

   Para criar outro acesso, copie um item da lista.
   ============================================================================= */

App.acessos = {
  lista: [
    { usuario: "garciatransportes", senha: "garciatransportes", id: "g1",     nome: "Garcia Transportes" },
    { usuario: "master",            senha: "master",            id: "master", nome: "Master" }
  ],

  /* Confere usuário e senha. Devolve o acesso encontrado ou null.
     O usuário não diferencia maiúsculas de minúsculas; a senha sim. */
  conferir: function (usuario, senha) {
    var u = String(usuario || "").trim().toLowerCase();
    var achado = App.acessos.lista.filter(function (a) { return a.usuario === u && a.senha === String(senha || ""); })[0];
    return achado || null;
  }
};
