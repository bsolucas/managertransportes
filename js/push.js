/* =============================================================================
   push.js — REGISTRA ESTE APARELHO PARA RECEBER AVISOS COM O APP FECHADO (Firebase FCM)
   -----------------------------------------------------------------------------
   Depois que a pessoa permite os avisos, pega o "token" do aparelho no Firebase e guarda no banco
   (public.dispositivos, via registrar_dispositivo). O envio é feito pelo banco + Apps Script
   (banco/24-push-firebase.sql). Quem mostra o aviso é o service-worker.js (evento "push").
     App.push.registrar()   -> chamar quando a permissão de avisos estiver concedida
     App.push.desvincular() -> chamar ao sair (o aparelho para de receber os avisos dessa conta)
   Sem preencher js/config-firebase.js, tudo isto fica desligado.
   ============================================================================= */
App.push = (function () {
  var VERSAO = "10.12.2";
  var CHAVE_TOKEN = (App.config.PREFIXO_ARMAZENAMENTO || "") + "pushToken";
  var carregando = null;

  function configurado() {
    var f = App.firebase || {};
    return !!(f.apiKey && f.projectId && f.messagingSenderId && f.appId && f.vapidKey);
  }

  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = erro;
      document.head.appendChild(s);
    });
  }

  function carregarFirebase() {
    if (window.firebase && window.firebase.messaging) return Promise.resolve();
    if (!carregando) {
      var base = "https://www.gstatic.com/firebasejs/" + VERSAO + "/";
      carregando = carregarScript(base + "firebase-app-compat.js").then(function () { return carregarScript(base + "firebase-messaging-compat.js"); });
    }
    return carregando;
  }

  function plataforma() {
    var ua = navigator.userAgent || "";
    return /android/i.test(ua) ? "android" : /iphone|ipad/i.test(ua) ? "ios" : "web";
  }

  function guardado() { try { return localStorage.getItem(CHAVE_TOKEN) || ""; } catch (e) { return ""; } }
  function guardar(t) { try { t ? localStorage.setItem(CHAVE_TOKEN, t) : localStorage.removeItem(CHAVE_TOKEN); } catch (e) { /* sem armazenamento */ } }

  function registrar() {
    if (!configurado() || !("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return Promise.resolve();
    return carregarFirebase().then(function () {
      if (!firebase.messaging.isSupported()) return null;
      if (!firebase.apps.length) firebase.initializeApp({ apiKey: App.firebase.apiKey, projectId: App.firebase.projectId, messagingSenderId: App.firebase.messagingSenderId, appId: App.firebase.appId });
      return navigator.serviceWorker.ready.then(function (reg) {
        return firebase.messaging().getToken({ vapidKey: App.firebase.vapidKey, serviceWorkerRegistration: reg });
      });
    }).then(function (token) {
      if (!token) return;
      guardar(token);
      return App.auth.conexao().rpc("registrar_dispositivo", { p_token: token, p_plataforma: plataforma() });
    }).catch(function (e) { if (window.console) console.warn("Push não ativado:", e && e.message ? e.message : e); });
  }

  function desvincular() {
    var token = guardado();
    if (!token) return Promise.resolve();
    guardar("");
    return Promise.resolve(App.auth.conexao().rpc("remover_dispositivo", { p_token: token })).catch(function () { /* segue */ });
  }

  return { registrar: registrar, desvincular: desvincular, configurado: configurado };
})();
