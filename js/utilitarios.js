/* =============================================================================
   utilitarios.js — FUNÇÕES PEQUENAS USADAS EM TODO O APP
   -----------------------------------------------------------------------------
   Formatação de dinheiro e datas, geração de IDs, cálculo de distância entre
   dois pontos do mapa e uma proteção contra HTML malicioso nos textos.
   Nada aqui conhece "corridas" ou "motoristas": são ferramentas genéricas.
   ============================================================================= */

App.utils = {

  /* Formata um número como dinheiro. Ex.: 1234.5 -> "R$ 1.234,50" */
  moeda: function (valor) {
    return new Intl.NumberFormat(App.config.LOCALIDADE, {
      style: "currency",
      currency: App.config.MOEDA
    }).format(valor || 0);
  },

  /* Formata uma data/hora (número em milissegundos) como "24/10 14:35". */
  dataHora: function (ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString(App.config.LOCALIDADE, {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  },

  /* Só a hora. Ex.: "14:35" */
  hora: function (ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleTimeString(App.config.LOCALIDADE, {
      hour: "2-digit", minute: "2-digit"
    });
  },

  /* "há 3 min", "há 1 h" — usado nas listas de corridas. */
  tempoRelativo: function (ms) {
    var seg = Math.round((Date.now() - ms) / 1000);
    if (seg < 60) return "agora";
    var min = Math.round(seg / 60);
    if (min < 60) return "há " + min + " min";
    var h = Math.round(min / 60);
    if (h < 24) return "há " + h + " h";
    return "há " + Math.round(h / 24) + " d";
  },

  /* Gera um identificador único simples. Ex.: "cor_lk2j3h_4f9a" */
  novoId: function (prefixo) {
    return (prefixo || "id") + "_" + Date.now().toString(36) + "_" +
           Math.random().toString(36).slice(2, 6);
  },

  /* Distância em km entre dois pontos {lat, lng} em LINHA RETA
     (fórmula de Haversine, que considera a curvatura da Terra). */
  distanciaKm: function (a, b) {
    var R = 6371; // raio da Terra em km
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  },

  /* Distância estimada "pelas ruas" (linha reta × fator de rua). */
  distanciaRuaKm: function (a, b) {
    return App.utils.distanciaKm(a, b) * App.config.FATOR_RUA;
  },

  /* Ponto intermediário entre A e B. t = 0 é A, t = 1 é B. */
  interpolar: function (a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  },

  /* Protege textos digitados pelo usuário antes de colocar no HTML
     (impede que alguém escreva "<script>" no chat e execute código). */
  escaparHtml: function (texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },

  /* Iniciais de um nome, para os "avatares". Ex.: "Carlos Souza" -> "CS" */
  iniciais: function (nome) {
    return String(nome || "?").split(" ").filter(Boolean).slice(0, 2)
      .map(function (p) { return p[0].toUpperCase(); }).join("");
  },

  /* Singular ou plural conforme a quantidade. Ex.: plural(1, "corrida", "corridas") -> "1 corrida" */
  plural: function (n, singular, plural) {
    return n + " " + (n === 1 ? singular : plural);
  },

  /* Arredonda dinheiro para 2 casas sem erros de ponto flutuante. */
  arredondar: function (valor) {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }
};
