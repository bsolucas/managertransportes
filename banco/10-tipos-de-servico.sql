-- =============================================================================
-- 10 — TIPOS DE SERVIÇO: SAI O GUINCHO, ENTRAM VAN E ÔNIBUS
-- -----------------------------------------------------------------------------
-- O sistema é para transporte de pessoas (táxi, vans, fretamento, ônibus, frotas
-- pequenas e grandes, transporte interno de empresas) e carga leve. Guincho saiu.
-- Serviços válidos agora: carro | van | onibus | utilitario.
-- =============================================================================

alter table public.corridas drop constraint if exists corridas_servico_check;
alter table public.corridas add constraint corridas_servico_check
  check (servico in ('carro', 'van', 'onibus', 'utilitario'));

alter table public.precos_cliente drop constraint if exists precos_cliente_servico_check;
alter table public.precos_cliente add constraint precos_cliente_servico_check
  check (servico in ('carro', 'van', 'onibus', 'utilitario'));

-- Tarifas antigas ainda traziam o preço do guincho: remove essa chave.
update public.tarifas set dados = jsonb_set(dados, '{servicos}', (dados -> 'servicos') - 'guincho')
 where dados -> 'servicos' ? 'guincho';

create or replace function public.criar_motorista(
  p_usuario text, p_senha text, p_nome text, p_telefone text, p_servicos text[], p_veiculo jsonb
) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  v_emp   uuid;
  v_user  uuid := gen_random_uuid();
  v_login text := lower(trim(coalesce(p_usuario, '')));
  v_mail  text;
  v_id    uuid;
begin
  if not (select privado.sou_gestor()) then
    raise exception 'Apenas o gestor pode cadastrar motoristas.';
  end if;
  v_emp := (select privado.empresa_do_usuario());

  if v_login !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'Informe o nome do motorista.';
  end if;
  if coalesce(array_length(p_servicos, 1), 0) = 0
     or not (p_servicos <@ array['carro', 'van', 'onibus', 'utilitario']) then
    raise exception 'Escolha ao menos um serviço válido.';
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
  insert into public.perfis (user_id, empresa_id, nome, papel) values (v_user, v_emp, trim(p_nome), 'motorista');
  insert into public.motoristas (empresa_id, nome, telefone, servicos, status, veiculo, user_id)
    values (v_emp, trim(p_nome), nullif(trim(coalesce(p_telefone, '')), ''), p_servicos, 'offline',
            coalesce(p_veiculo, '{}'), v_user)
    returning id into v_id;
  return v_id;
end $$;
