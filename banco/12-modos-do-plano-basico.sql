-- =============================================================================
-- 12 — DOIS MODOS DO PLANO BÁSICO: INDIVIDUAL E EQUIPE; TIPO "FROTA" ÚNICO
-- -----------------------------------------------------------------------------
-- No cadastro, quem escolhe o Básico diz como vai usar:
--   individual = trabalha sozinho e quer controlar as próprias corridas e valores.
--                Os clientes são só contatos (sem login no portal).
--   equipe     = motoristas e clientes com login (o sistema completo).
-- Profissional e Empresarial são sempre "equipe". O banco confere isso: o painel
-- não deixa criar login de cliente numa empresa "individual".
-- Também junta "frota pequena" e "frota grande" num só tipo: frota.
-- =============================================================================

-- ---------- Tipo de empresa: frota pequena/grande viram "frota" ----------
alter table public.cadastros drop constraint if exists cadastros_tipo_empresa_check;
alter table public.empresas  drop constraint if exists empresas_tipo_empresa_check;
update public.cadastros set tipo_empresa = 'frota' where tipo_empresa in ('frota_pequena', 'frota_grande');
update public.empresas  set tipo_empresa = 'frota' where tipo_empresa in ('frota_pequena', 'frota_grande');
alter table public.cadastros add constraint cadastros_tipo_empresa_check
  check (tipo_empresa in ('taxi', 'van', 'onibus', 'frota', 'interno', 'outro'));
alter table public.empresas add constraint empresas_tipo_empresa_check
  check (tipo_empresa is null or tipo_empresa in ('taxi', 'van', 'onibus', 'frota', 'interno', 'outro'));

-- ---------- Modo de uso ----------
alter table public.cadastros add column if not exists modo_uso text not null default 'equipe';
alter table public.cadastros drop constraint if exists cadastros_modo_uso_check;
alter table public.cadastros add constraint cadastros_modo_uso_check
  check (modo_uso in ('individual', 'equipe') and (modo_uso = 'equipe' or plano = 'basico'));
alter table public.empresas add column if not exists modo_uso text not null default 'equipe';
alter table public.empresas drop constraint if exists empresas_modo_uso_check;
alter table public.empresas add constraint empresas_modo_uso_check check (modo_uso in ('individual', 'equipe'));

grant insert (user_id, nome_responsavel, empresa_nome, documento, celular, plano, tipo_empresa, modo_uso) on public.cadastros to authenticated;
grant update (nome_responsavel, empresa_nome, documento, celular, plano, tipo_empresa, modo_uso) on public.cadastros to authenticated;

-- ---------- Individual: cliente sem login ----------
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
  if exists (select 1 from public.empresas where id = v_emp and modo_uso = 'individual') then
    raise exception 'No plano Individual os clientes são só contatos e não têm login.';
  end if;

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

-- ---------- Painel do dono: mostra o modo de uso ----------
drop function if exists public.dono_cadastros();
create function public.dono_cadastros()
  returns table (
    user_id uuid, email text, nome_responsavel text, empresa_nome text, documento text, tipo_documento text,
    celular text, plano text, plano_nome text, status text, criado_em timestamptz, tipo_empresa text, modo_uso text
  )
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  return query
    select c.user_id, c.email, c.nome_responsavel, c.empresa_nome, c.documento, c.tipo_documento,
           c.celular, c.plano, p.nome, c.status, c.criado_em, c.tipo_empresa, c.modo_uso
      from public.cadastros c
      left join public.planos p on p.id = c.plano
     order by c.criado_em desc;
end $$;

drop function if exists public.dono_empresas();
create function public.dono_empresas()
  returns table (
    id uuid, nome text, sigla text, cidade text, uf text,
    plano text, plano_nome text, assinatura_status text, assinatura_inicio date, criada_em timestamptz,
    clientes bigint, motoristas bigint, gestores bigint,
    corridas_total bigint, corridas_30d bigint, ultima_corrida timestamptz, valor_mensal numeric,
    tipo_empresa text, modo_uso text
  )
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  return query
    select e.id, e.nome, e.sigla, e.cidade, e.uf,
           e.plano, p.nome, e.assinatura_status, e.assinatura_inicio, e.criada_em,
           (select count(*) from public.clientes c where c.empresa_id = e.id),
           (select count(*) from public.motoristas m where m.empresa_id = e.id),
           (select count(*) from public.perfis pf where pf.empresa_id = e.id and pf.papel in ('gestor', 'master')),
           (select count(*) from public.corridas co where co.empresa_id = e.id and co.fonte = 'app'),
           (select count(*) from public.corridas co where co.empresa_id = e.id and co.fonte = 'app' and co.criada_em > now() - interval '30 days'),
           (select max(co.criada_em) from public.corridas co where co.empresa_id = e.id and co.fonte = 'app'),
           coalesce(p.preco, 0),
           e.tipo_empresa, e.modo_uso
      from public.empresas e
      left join public.planos p on p.id = e.plano
     order by e.criada_em desc;
end $$;

revoke all on function public.dono_empresas(), public.dono_cadastros() from public, anon;
grant execute on function public.dono_empresas(), public.dono_cadastros() to authenticated;
