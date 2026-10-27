-- =============================================================================
-- 23 — O CLIENTE PODE REMOVER AS PRÓPRIAS CORRIDAS CANCELADAS
-- -----------------------------------------------------------------------------
-- Só corridas do próprio cliente e só as canceladas (o gatilho do banco/22 também barra o resto).
-- O chat e as notificações da corrida são apagados junto (cascata).
-- COMO APLICAR: cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================
drop policy if exists cliente_apaga on public.corridas;
create policy cliente_apaga on public.corridas for delete to authenticated
  using (cliente_id = (select privado.meu_cliente_id()) and status = 'cancelada');
