/* =============================================================================
   config.js — DADOS QUE VOCÊ TROCA SEM MEXER NO RESTO DA PÁGINA
   ============================================================================= */
window.CONFIG = {
  /* Nome que aparece no topo, no rodapé e na mensagem do WhatsApp. */
  marca: "Manager Transportes",

  /* WhatsApp com código do país e DDD, só números (ex.: 5511912345678).
     Se ficar vazio, os botões levam para a seção de planos. */
  whatsapp: "5511999999999", // NÚMERO FAKE de teste: troque pelo seu

  /* Link do sistema que já está na Vercel (botão "Ver o sistema").
     Aqui "../" abre a página principal do app. Vazio ("") esconde o botão. */
  sistema: "../",

  /* Dias de teste grátis (mostrado na página de pagamento). 0 = sem teste. */
  diasTeste: 14,

  /* PLANOS — o preço aparece na landing e na página de pagamento a partir daqui.
     Valor em reais, com ponto decimal (129.90 = R$ 129,90). */
  planos: [
    { id: "basico",       nome: "Básico",       preco: 129.90, descricao: "1 gestor e até 10 veículos" },
    { id: "profissional", nome: "Profissional", preco: 249.90, descricao: "Até 20 veículos + conversão de planilha" },
    { id: "empresarial",  nome: "Empresarial",  preco: 329.90, descricao: "Veículos ilimitados + ajustes sob medida" }
  ],

  /* PAGAMENTO — deixe pronto para ligar depois (veja js/pagamento.js).
     Enquanto nada estiver configurado, o pedido é enviado pelo WhatsApp. */
  pagamento: {
    /* Formas oferecidas na tela: "pix", "cartao", "boleto". */
    formas: ["pix", "cartao", "boleto"],

    /* OPÇÃO A (mais simples): endereço do SEU servidor que cria a cobrança no
       gateway (Mercado Pago, Asaas, Stripe...) e devolve { "url": "link do checkout" }.
       A página manda o pedido para lá e leva o cliente para o link. Funciona igual
       no Android e no computador. Ex.: função do Supabase ("Edge Function"). */
    urlCriarCobranca: "",

    /* OPÇÃO B: nome de um provedor que você registrar em
       window.PagamentoProvedores["nome"] = { iniciar: function (pedido, config) {...} }.
       Usada quando o gateway precisa de um script próprio na página. */
    provedor: ""
  }
};
