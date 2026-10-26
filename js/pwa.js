/* =============================================================================
   pwa.js — REGISTRA O SERVICE WORKER (deixa o app instalável no celular)
   -----------------------------------------------------------------------------
   Usado por todas as páginas do app. O service-worker.js fica na raiz do
   projeto; o caminho é calculado a partir deste próprio arquivo.
   Só funciona em HTTPS (Vercel/GitHub Pages) ou em localhost.
   ============================================================================= */

(function () {
  if (!('serviceWorker' in navigator)) return;

  // document.currentScript só existe durante a execução do script (não dentro do "load")
  const enderecoDesteArquivo = document.currentScript ? document.currentScript.src : location.href;

  window.addEventListener('load', function () {
    // Este arquivo está em /js/, então a raiz do app é a pasta acima.
    const raiz = new URL('../', enderecoDesteArquivo);
    navigator.serviceWorker
      .register(new URL('service-worker.js', raiz).href, { scope: raiz.pathname })
      .catch(function (erro) { console.warn('PWA: não foi possível registrar o service worker', erro); });
  });
})();
