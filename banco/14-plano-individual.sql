-- =============================================================================
-- 14 — PLANO "INDIVIDUAL" NO LUGAR DO BÁSICO (R$ 99,90)
-- -----------------------------------------------------------------------------
-- Para quem trabalha sozinho: controla corridas, valores e despesas; os clientes
-- são só contatos (sem login). Profissional e Empresarial continuam como estavam.
--   plano 'individual'  <=> modo_uso 'individual'   (os outros são sempre 'equipe')
-- =============================================================================

update public.planos
   set id = 'individual', nome = 'Individual', preco = 99.90, max_empresas = null, max_funcionarios = null
 where id = 'basico';

alter table public.cadastros drop constraint if exists cadastros_plano_check;
alter table public.cadastros add constraint cadastros_plano_check
  check (plano in ('individual', 'profissional', 'empresarial'));

alter table public.cadastros drop constraint if exists cadastros_modo_uso_check;
alter table public.cadastros add constraint cadastros_modo_uso_check
  check (modo_uso in ('individual', 'equipe') and ((plano = 'individual') = (modo_uso = 'individual')));
