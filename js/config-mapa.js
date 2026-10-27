/* =============================================================================
   config-mapa.js — ESCOLHA DO MAPA (Google Maps ou mapa livre)
   -----------------------------------------------------------------------------
   googleChave: cole aqui a chave da API do Google Maps ("Maps JavaScript API").
     - Com chave  -> o site usa o Google Maps.
     - Sem chave  -> o site continua com o mapa livre (OpenStreetMap/Leaflet).

   googleEm: escolhe QUEM usa o Google Maps (cada abertura de mapa conta na cobrança do Google).
     Quem fica com "false" continua no mapa livre, sem custo. Hoje só o motorista usa o Google.

   A chave aparece no código do site (é normal no Google Maps). Para ninguém
   copiar e usar, no Google Cloud restrinja a chave por "Referenciadores HTTP"
   ao endereço do site (ex.: https://SEU-SITE.vercel.app/*) e só à API
   "Maps JavaScript API".
   ============================================================================= */

App.mapaConfig = {
  googleChave: "",
  googleEm: { motorista: true, gestor: false, cliente: false }
};
