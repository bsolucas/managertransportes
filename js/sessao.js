/* =============================================================================
   sessao.js — QUEM ESTÁ USANDO ESTA ABA
   -----------------------------------------------------------------------------
   Guarda o usuário "logado" no sessionStorage, que é separado por ABA.
   Assim você pode ter, ao mesmo tempo, uma aba como Gestor, outra como
   Motorista e outra como Cliente, e testar o fluxo completo.

   O login de verdade (usuário e senha) é feito no Supabase (js/auth-supabase.js);
   aqui fica só quem está usando esta aba.
   ============================================================================= */

App.sessao = {
  CHAVE: App.config.PREFIXO_ARMAZENAMENTO + "sessao",

  /* Grava o usuário da aba. usuario = { tipo, id, nome } */
  entrar: function (usuario) {
    sessionStorage.setItem(App.sessao.CHAVE, JSON.stringify(usuario));
  },

  /* Devolve o usuário da aba (ou null se ninguém entrou). */
  atual: function () {
    try { return JSON.parse(sessionStorage.getItem(App.sessao.CHAVE)); } catch (e) { return null; }
  },

  /* "Chave" usada para marcar mensagens lidas. Ex.: "motorista:m1" */
  chaveUsuario: function () {
    var u = App.sessao.atual();
    return u ? u.tipo + ":" + u.id : "";
  },

  sair: function () {
    var u = App.sessao.atual();
    sessionStorage.removeItem(App.sessao.CHAVE);
    var ir = function () { window.location.href = App.sessao.caminhoInicio(); };
    /* Todos os perfis têm login real no Supabase: encerra junto. */
    if (u && App.auth) App.auth.sair().then(ir, ir); else ir();
  },

  /* Garante que a página só abre para o tipo certo de usuário.
     Se não for, volta para a tela inicial. */
  exigir: function (tipo) {
    var u = App.sessao.atual();
    if (!u || u.tipo !== tipo) {
      window.location.href = App.sessao.caminhoInicio();
      return null;
    }
    return u;
  },

  /* As páginas internas ficam na pasta "paginas/", então o início é "../". */
  caminhoInicio: function () {
    return window.location.pathname.indexOf("/paginas/") !== -1 ? "../index.html" : "index.html";
  }
};
