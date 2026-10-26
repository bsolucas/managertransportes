-- =============================================================================
-- 06 — CLIENTES NO SUPABASE: LOGIN DO CLIENTE E ATUALIZAÇÃO AO VIVO
-- -----------------------------------------------------------------------------
-- O gestor cadastra o cliente na aba Clientes e pode dar a ele um login
-- (usuário + senha), igual ao do motorista. O cliente entra no portal dele e
-- pede corridas. Como criar login exige gravar no Auth, as funções abaixo
-- (chamadas pelo app com supabase.rpc) conferem por dentro se quem chamou é
-- gestor/master e só mexem em clientes da PRÓPRIA empresa.
--   definir_login_cliente(cliente_id, usuario, senha)
--        cliente sem login  -> cria o login com este usuário e senha
--        cliente com login  -> troca a senha (o usuário não muda)
--   remover_cliente(id)     -> apaga o cliente e o login dele (se não tiver corridas)
-- O login é <usuario>@acesso.managertransportes.test (igual ao gestor e ao motorista).
-- Também liga o "ao vivo" (Realtime) para clientes, locais e tarifas.
-- =============================================================================

alter table public.clientes add column if not exists usuario_login text;
create unique index if not exists clientes_usuario_login_unico on public.clientes (usuario_login) where usuario_login is not null;

create or replace function public.definir_login_cliente(p_cliente_id uuid, p_usuario text, p_senha text)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_emp   uuid;
  v_cli   public.clientes%rowtype;
  v_login text := lower(trim(coalesce(p_usuario, '')));
  v_mail  text;
  v_user  uuid := gen_random_uuid();
begin
  if not (select privado.sou_gestor()) then
    raise exception 'Apenas o gestor pode definir o login de um cliente.';
  end if;
  v_emp := (select privado.empresa_do_usuario());

  select * into v_cli from public.clientes where id = p_cliente_id and empresa_id = v_emp;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;

  if v_cli.user_id is not null then
    -- já tem login: só troca a senha
    update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
     where id = v_cli.user_id;
    return;
  end if;

  if v_login !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.';
  end if;
  v_mail := v_login || '@acesso.managertransportes.test';
  if exists (select 1 from auth.users where email = v_mail) then
    raise exception 'Já existe um usuário "%". Escolha outro.', v_login;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_mail,
      extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text, 'email',
      jsonb_build_object('sub', v_user::text, 'email', v_mail, 'email_verified', true), now(), now(), now());
  insert into public.perfis (user_id, empresa_id, nome, papel)
    values (v_user, v_emp, coalesce(nullif(v_cli.empresa_nome, ''), v_cli.nome), 'cliente');
  update public.clientes set user_id = v_user, usuario_login = v_login where id = p_cliente_id;
end $$;

create or replace function public.remover_cliente(p_id uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_emp  uuid;
  v_user uuid;
begin
  if not (select privado.sou_gestor()) then
    raise exception 'Apenas o gestor pode remover clientes.';
  end if;
  v_emp := (select privado.empresa_do_usuario());

  select user_id into v_user from public.clientes where id = p_id and empresa_id = v_emp;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  if exists (select 1 from public.corridas where cliente_id = p_id) then
    raise exception 'Este cliente tem corridas no histórico. Para não perdê-lo, desative o cliente em vez de excluir.';
  end if;

  delete from public.clientes where id = p_id;
  if v_user is not null then delete from auth.users where id = v_user; end if;   -- apaga o login (e o perfil)
end $$;

revoke all on function public.definir_login_cliente(uuid, text, text), public.remover_cliente(uuid) from public, anon;
grant execute on function public.definir_login_cliente(uuid, text, text), public.remover_cliente(uuid) to authenticated;

-- ---------- Atualização ao vivo ----------
alter publication supabase_realtime add table public.clientes, public.locais, public.tarifas;
