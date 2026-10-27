/* =============================================================================
   service-worker.js — FAZ O APP FUNCIONAR COMO PWA (instalável no Android)
   -----------------------------------------------------------------------------
   Fica na RAIZ do projeto para valer para todas as páginas.
   Estratégia: "rede primeiro, cache como reserva".
     • Com internet: sempre busca a versão mais nova e atualiza o cache.
     • Sem internet: usa a cópia guardada (o app ainda abre).
   Só guarda arquivos GET do próprio site e das bibliotecas (Leaflet, supabase-js).
   Chamadas ao banco (Supabase), mapas e outros serviços NÃO passam pelo cache.
   Ao mudar a lista abaixo, aumente a VERSAO_CACHE para limpar o cache antigo.
   ============================================================================= */

const VERSAO_CACHE = 'manager-v17';

/* Páginas e arquivos essenciais, guardados na instalação */
const ARQUIVOS_BASICOS = [
  './index.html',
  './manifest.json',
  './icones/icone-192.png',
  './icones/icone-512.png'
];

/* Bibliotecas externas que podem ser guardadas */
const HOSTS_BIBLIOTECAS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

/* Instalação: guarda os arquivos básicos */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => cache.addAll(ARQUIVOS_BASICOS))
  );
  self.skipWaiting();
});

/* Ativação: apaga caches de versões antigas */
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n !== VERSAO_CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* Cada requisição: rede primeiro, cache se estiver sem internet */
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  const mesmoSite = url.origin === self.location.origin;
  if (!mesmoSite && !HOSTS_BIBLIOTECAS.includes(url.hostname)) return;

  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO_CACHE).then((cache) => cache.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() =>
        caches.match(pedido).then((guardado) =>
          guardado || (pedido.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});

/* Clicar numa notificação traz o app para a frente (ou abre, se estiver fechado). */
/* Push do Firebase (app fechado ou em segundo plano). Mensagem só com dados: o aviso é montado aqui.
   Se o app já está aberto na tela, não repete (a própria página mostra o aviso e toca o som). */
self.addEventListener('push', (evento) => {
  let d = {};
  try { const j = evento.data.json(); d = j.data || j; } catch (e) { /* sem conteúdo legível */ }
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      if (janelas.some((j) => j.visibilityState === 'visible' && j.focused)) return;
      return self.registration.showNotification(d.titulo || 'Manager Transportes', {
        body: d.corpo || '',
        icon: './icones/icone-192.png',
        badge: './icones/icone-192.png',
        tag: d.id || undefined,
        data: { corrida: d.corrida || '' },
        vibrate: [120, 60, 120]
      });
    })
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) =>
      janelas.length ? janelas[0].focus() : self.clients.openWindow('./')
    )
  );
});
