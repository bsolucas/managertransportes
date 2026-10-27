/* =============================================================================
   api/ping.js — VERIFICAÇÃO DIÁRIA (mantém o projeto do Supabase ativo)
   -----------------------------------------------------------------------------
   O plano gratuito do Supabase pausa o projeto depois de cerca de 7 dias sem uso. A Vercel chama esta
   função todo dia (veja "crons" em vercel.json); ela faz uma consulta simples ao banco pela API
   pública (a mesma chave "anon" que já está em js/config-supabase.js, que não é secreta).
   Resposta: { ok: true/false, status: <código do Supabase>, em: <data/hora> }.
   Pode abrir /api/ping no navegador para testar na hora.
   ============================================================================= */
const URL_SUPABASE = 'https://qjccecmfnwiypyivwwqb.supabase.co';
const CHAVE_PUBLICA = require('fs')
  .readFileSync(require('path').join(process.cwd(), 'js', 'config-supabase.js'), 'utf8')
  .match(/chavePublica:\s*"([^"]+)"/)[1];

module.exports = async (req, res) => {
  try {
    const r = await fetch(URL_SUPABASE + '/rest/v1/planos?select=id&limit=1', {
      headers: { apikey: CHAVE_PUBLICA, Authorization: 'Bearer ' + CHAVE_PUBLICA }
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, em: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, erro: String(e && e.message || e), em: new Date().toISOString() });
  }
};
