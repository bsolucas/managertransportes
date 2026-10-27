/* =============================================================================
   modulos.js — QUAIS PARTES DO PAINEL CADA EMPRESA USA
   -----------------------------------------------------------------------------
   Nem toda empresa precisa de tudo: o taxista que trabalha sozinho não tem
   motoristas nem preço de tabela; o dono de uma van escolar quer rotas e preços.
   O padrão sai do "modo de uso" (sozinho ou equipe) e do tipo de empresa, e pode
   ser trocado por empresa na coluna empresas.modulos (ex.: {"rotas": true}),
   o que deixa as opções abertas sem mexer no código.

     App.modulos.da(empresa)  -> { visao, corridas, motoristas, financeiro, planilhas,
                                   rotas, chat, clientes, diario, despesas }  (true/false)
     App.modulos.ABAS         -> módulo -> nome da aba (data-aba) no painel do gestor
   ============================================================================= */

App.modulos = {

  ABAS: {
    visao: "visao", corridas: "corridas", motoristas: "motoristas", financeiro: "financeiro",
    planilhas: "planilhas", rotas: "tarifas", chat: "chat", clientes: "clientes",
    diario: "diario", despesas: "despesas"
  },

  da: function (empresa) {
    empresa = empresa || {};
    var m = { visao: true, corridas: true, motoristas: true, financeiro: true, planilhas: true,
              rotas: true, chat: true, clientes: true, diario: true, despesas: true };
    if (empresa.modo_uso === "individual") {          // trabalha sozinho
      m.visao = false;        // painel de motoristas e mapa: não se aplica
      m.motoristas = false;   // ele mesmo faz as corridas
      m.chat = false;         // não há motorista nem portal do cliente
      m.planilhas = false;
      m.rotas = empresa.tipo_empresa !== "taxi";   // táxi: corridas avulsas, sem tabela de preços
    }
    var troca = empresa.modulos || {};
    Object.keys(troca).forEach(function (k) { if (k in m) m[k] = !!troca[k]; });
    return m;
  }
};
