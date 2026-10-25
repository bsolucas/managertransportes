/* =============================================================================
   config-supabase.js — LIGAÇÃO COM O BANCO DE DADOS (SUPABASE)
   -----------------------------------------------------------------------------
   Aqui ficam só informações PÚBLICAS: o endereço do projeto e a chave "anon".
   É normal elas aparecerem no código do site: quem protege os dados é a
   segurança por linha (RLS) criada no banco (veja banco/01-estrutura.sql).

   NUNCA coloque neste arquivo a chave "service_role"/"secret", a senha do
   banco ou o token de acesso da conta Supabase.
   ============================================================================= */

App.supabaseConfig = {
  url: "https://qjccecmfnwiypyivwwqb.supabase.co",
  chavePublica: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqY2NlY21mbndpeXB5aXZ3d3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTYwMzIsImV4cCI6MjEwODUzMjAzMn0.foixqbpxOccv-X9i2P8z5POU3J4BHgxwrReAAz9wpFA",

  /* O gestor digita só o usuário; no Supabase o login é feito com um e-mail
     interno formado pelo usuário + este final. */
  dominioLogin: "@acesso.managertransportes.test"
};
