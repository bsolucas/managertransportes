-- =============================================================================
-- 22 — REMOVER CORRIDAS CANCELADAS (só elas)
-- -----------------------------------------------------------------------------
-- O gestor pode apagar corridas CANCELADAS (uma a uma ou todas de uma vez) para a lista não
-- ficar poluída. Apagar uma corrida apaga junto o chat e as notificações dela.
-- Segurança no banco: nenhum usuário do app consegue apagar corrida que NÃO esteja cancelada
-- (em andamento, concluída, aguardando...) — o histórico e os valores ficam protegidos.
-- =============================================================================

create or replace function privado.corrida_antes_apagar() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if old.fonte = 'app' and old.status <> 'cancelada' and (select auth.uid()) is not null then
    raise exception 'Só é possível remover corridas canceladas.';
  end if;
  return old;
end $$;
revoke all on function privado.corrida_antes_apagar() from public, anon, authenticated;

drop trigger if exists corridas_antes_apagar on public.corridas;
create trigger corridas_antes_apagar before delete on public.corridas
  for each row execute function privado.corrida_antes_apagar();
