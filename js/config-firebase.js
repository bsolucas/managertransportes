/* =============================================================================
   config-firebase.js — DADOS PÚBLICOS DO SEU PROJETO FIREBASE (push com o app fechado)
   -----------------------------------------------------------------------------
   Preencha com os valores do console do Firebase (veja banco/CONFIGURAR-PUSH-FIREBASE.md).
   Estes dados NÃO são secretos (ficam em qualquer site que usa Firebase). A chave privada de
   serviço fica só no Apps Script. Enquanto estiver vazio, o push fica desligado (nada quebra).
   ============================================================================= */
App.firebase = {
  apiKey: "AIzaSyDdOBfVWDFjSlmUbFAsZanCmLBRO6-F264",
  projectId: "projetoalerta-d3334",
  messagingSenderId: "775835644018",
  appId: "1:775835644018:web:33423c1d3307c3f2f992eb",
  vapidKey: ""        // "Certificado push da Web" (par de chaves), em Configurações do projeto > Cloud Messaging
};
