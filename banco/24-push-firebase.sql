-- =============================================================================
-- 24 — NOTIFICAÇÃO COM O APP FECHADO (push via Firebase Cloud Messaging)
-- -----------------------------------------------------------------------------
-- Como funciona:
--   1. O aparelho (com permissão de avisos) registra o "token" do Firebase em public.dispositivos.
--   2. Toda notificação nova (tabela notificacoes) dispara, no banco, uma chamada ao seu Apps Script
--      (o mesmo do e-mail, endereço em privado.parametros 'email_url') com os tokens da pessoa.
--   3. O Apps Script (que guarda a chave de serviço do Firebase) entrega o push pelo FCM.
-- Nada de chave do Firebase fica no banco: só o endereço do script e o segredo que ele já confere.
-- Sem 'email_url'/'email_chave' configurados, ou sem dispositivos registrados, nada acontece.
--
-- COMO APLICAR: cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================

-- ---------- Registro do aparelho (o token pode mudar de dono se o aparelho trocar de login) ----------
create or replace function public.registrar_dispositivo(p_token text, p_plataforma text default 'web') returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_emp uuid := (select privado.empresa_do_usuario());
begin
  if (select auth.uid()) is null or v_emp is null then raise exception 'Entre no sistema para ativar os avisos.'; end if;
  if coalesce(length(p_token), 0) < 20 or length(p_token) > 4096 then raise exception 'Token inválido.'; end if;
  insert into public.dispositivos (empresa_id, user_id, plataforma, push_token, ativo, atualizado_em)
  values (v_emp, (select auth.uid()), case when p_plataforma in ('android', 'ios', 'web') then p_plataforma else 'web' end, p_token, true, now())
  on conflict (push_token) do update
    set empresa_id = excluded.empresa_id, user_id = excluded.user_id, plataforma = excluded.plataforma,
        ativo = true, atualizado_em = now();
end $$;
revoke all on function public.registrar_dispositivo(text, text) from public, anon;
grant execute on function public.registrar_dispositivo(text, text) to authenticated;

-- Ao sair, o aparelho deixa de receber os avisos dessa conta.
create or replace function public.remover_dispositivo(p_token text) returns void
  language sql security definer set search_path = ''
as $$
  delete from public.dispositivos where push_token = p_token and user_id = (select auth.uid());
$$;
revoke all on function public.remover_dispositivo(text) from public, anon;
grant execute on function public.remover_dispositivo(text) to authenticated;

-- ---------- Envio do push (nunca derruba quem chamou) ----------
create or replace function privado.enviar_push() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text := coalesce((select valor from privado.parametros where chave = 'email_url'), '');
  v_chave  text := coalesce((select valor from privado.parametros where chave = 'email_chave'), '');
  v_tokens jsonb;
begin
  if v_url = '' or v_chave = '' then return null; end if;
  select coalesce(jsonb_agg(d.push_token), '[]'::jsonb) into v_tokens
    from public.dispositivos d where d.user_id = new.user_id and d.ativo;
  if jsonb_array_length(v_tokens) = 0 then return null; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('segredo', v_chave, 'acao', 'push', 'tokens', v_tokens,
                               'titulo', new.titulo, 'corpo', coalesce(new.corpo, ''),
                               'corrida', coalesce(new.corrida_id::text, ''), 'id', new.id::text),
    timeout_milliseconds := 8000);
  return null;
exception when others then
  return null;   -- o push é um extra: se falhar, a notificação segue normalmente
end $$;
revoke all on function privado.enviar_push() from public, anon, authenticated;
drop trigger if exists notificacoes_z_push on public.notificacoes;
create trigger notificacoes_z_push after insert on public.notificacoes
  for each row execute function privado.enviar_push();
