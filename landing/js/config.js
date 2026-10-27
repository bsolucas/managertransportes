/* =============================================================================
   config.js — DADOS QUE VOCÊ TROCA SEM MEXER NO RESTO DA PÁGINA
   ============================================================================= */
window.CONFIG = {
  /* Nome que aparece no topo e no rodapé. */
  marca: "Manager Transportes",

  /* WhatsApp OPCIONAL (código do país e DDD, só números, ex.: 5511912345678).
     A landing não usa mais WhatsApp: todos os botões levam à assinatura. Só a página
     de pagamento usa este número, como plano B enquanto o gateway não estiver ligado. */
  whatsapp: "",

  /* Link do sistema que já está na Vercel (botão "Ver o sistema").
     Aqui "../" abre a página principal do app. Vazio ("") esconde o botão. */
  sistema: "../",

  /* BANCO (Supabase) — usado pela página de cadastro (cadastro.html).
     São dados PÚBLICOS (endereço e chave "anon"); quem protege o banco é a
     segurança por linha. Nunca coloque aqui a chave "service_role". */
  supabase: {
    url: "https://qjccecmfnwiypyivwwqb.supabase.co",
    chavePublica: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqY2NlY21mbndpeXB5aXZ3d3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTYwMzIsImV4cCI6MjEwODUzMjAzMn0.foixqbpxOccv-X9i2P8z5POU3J4BHgxwrReAAz9wpFA"
  },

  /* MODO TESTE: com "true", o cadastro aceita CPF/CNPJ com dígitos inválidos (11 ou 14 números).
     DESLIGUE ("false") antes de divulgar o site, e rode o comando de banco/19-modo-teste-documento.sql. */
  aceitarDocumentoInvalido: false,

  /* Dias de teste grátis (mostrado na página de pagamento). 0 = sem teste. */
  diasTeste: 14,

  /* TIPOS DE EMPRESA — escolhidos no cadastro (landing/cadastro.html) e mostrados ao dono
     no painel /master. O "id" também é gravado no banco (banco/11-tipo-de-empresa.sql). */
  tiposEmpresa: [
    { id: "taxi",   nome: "Táxi e carros executivos" },
    { id: "van",    nome: "Vans e fretamento" },
    { id: "onibus", nome: "Ônibus" },
    { id: "frota",  nome: "Frota de veículos (pequeno ou grande porte)" },
    { id: "interno", nome: "Transporte interno (só funcionários, sem clientes externos)" },
    { id: "outro",  nome: "Outro tipo de transporte" }
  ],

  /* DUAS FORMAS DE USAR O PLANO BÁSICO (perguntado no cadastro; Profissional e Empresarial são sempre "equipe").
     individual = a pessoa mesma faz as corridas (táxi, van escolar...): sem motoristas, clientes só como contatos.
     equipe     = pequena frota com motoristas (cada um com seu acesso) e clientes que pedem corridas.
     Para abrir outras opções no futuro, é só acrescentar aqui e em banco/ (empresas.modulos liga/desliga cada parte). */
  modosBasico: [
    { id: "individual", nome: "Trabalho sozinho", descricao: "Eu mesmo faço as corridas (táxi, van escolar...). Quero controlar faturamento, km e despesas." },
    { id: "equipe",     nome: "Tenho mais veículos ou motoristas", descricao: "Pequena frota: cada motorista com seu acesso e clientes que pedem corridas." }
  ],

  /* PLANOS — o preço aparece na landing e na página de pagamento a partir daqui.
     Valor em reais, com ponto decimal (129.90 = R$ 129,90).
     "limites": empresas clientes e funcionários por empresa (null = ilimitado; no Individual os clientes são só contatos). Por enquanto
     é só informativo: o sistema ainda não bloqueia cadastros acima do limite. */
  planos: [
    { id: "basico",        nome: "Básico",        preco: 99.90,  descricao: "Sozinho ou com pequena frota: corridas, diário, despesas e rotas",
      limites: { empresas: null, funcionariosPorEmpresa: null } },
    { id: "profissional", nome: "Profissional", preco: 249.90, descricao: "Até 10 empresas e 1.000 funcionários por empresa + conversão de planilha",
      limites: { empresas: 10, funcionariosPorEmpresa: 1000 } },
    { id: "empresarial",  nome: "Empresarial",  preco: 329.90, descricao: "Empresas e funcionários ilimitados + ajustes sob medida",
      limites: { empresas: null, funcionariosPorEmpresa: null } }
  ],

  /* PAGAMENTO — deixe pronto para ligar depois (veja js/pagamento.js).
     Enquanto nada estiver configurado, a página avisa que o pagamento abre em breve. */
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
