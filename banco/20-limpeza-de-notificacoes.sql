-- =============================================================================
-- 20 — LIMPEZA AUTOMÁTICA: APAGA NOTIFICAÇÕES COM MAIS DE 60 DIAS
-- -----------------------------------------------------------------------------
-- As notificações são cerca de 40% do espaço que cada corrida ocupa no banco.
-- Todo dia às 03:00 (horário de Brasília) o banco apaga as que têm mais de 60 dias
-- (lidas ou não). O histórico das corridas, o chat e os valores NÃO são mexidos.
--
-- COMO APLICAR: cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Para mudar o prazo: edite "60 days" na função abaixo e rode o arquivo de novo.
-- Para desligar:      select cron.unschedule('limpar-notificacoes');
-- =============================================================================

create extension if not exists pg_cron;

create or replace function privado.limpar_notificacoes_antigas() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_apagadas integer;
begin
  delete from public.notificacoes where criada_em < now() - interval '60 days';
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end $$;
revoke all on function privado.limpar_notificacoes_antigas() from public, anon, authenticated;

-- 06:00 UTC = 03:00 em Brasília. Recriar o agendamento é seguro (substitui o anterior).
select cron.schedule('limpar-notificacoes', '0 6 * * *', $$select privado.limpar_notificacoes_antigas()$$);
