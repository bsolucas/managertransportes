/* =============================================================================
   config-firebase.js — DADOS PÚBLICOS DO SEU PROJETO FIREBASE (push com o app fechado)
   -----------------------------------------------------------------------------
   Preencha com os valores do console do Firebase (veja banco/CONFIGURAR-PUSH-FIREBASE.md).
   Estes dados NÃO são secretos (ficam em qualquer site que usa Firebase). A chave privada de
   serviço fica só no Apps Script. Enquanto estiver vazio, o push fica desligado (nada quebra).
   ============================================================================= */
App.firebase = {
  apiKey: "",
  projectId: "",
  messagingSenderId: "",
  appId: "",
  vapidKey: ""        // "Certificado push da Web" (par de chaves), em Configurações do projeto > Cloud Messaging
};
