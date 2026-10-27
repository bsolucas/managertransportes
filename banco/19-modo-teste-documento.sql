-- =============================================================================
-- 19 — MODO TESTE: ACEITAR CPF/CNPJ COM DÍGITOS INVÁLIDOS NO CADASTRO
-- -----------------------------------------------------------------------------
-- Para a fase de testes, o cadastro de assinante aceita CPF/CNPJ "de mentira"
-- (11 ou 14 números, mesmo com dígitos verificadores errados). O número continua
-- precisando ser único. Para DESLIGAR antes de divulgar o site, rode no SQL Editor:
--     update privado.parametros set valor = 'off' where chave = 'documento_teste';
-- (e ponha aceitarDocumentoInvalido: false em landing/js/config.js e
--  ACEITAR_DOCUMENTO_INVALIDO: false em js/config.js)
-- =============================================================================

create table if not exists privado.parametros (chave text primary key, valor text not null);
insert into privado.parametros (chave, valor) values ('documento_teste', 'on') on conflict (chave) do nothing;
revoke all on privado.parametros from public, anon, authenticated;

create or replace function privado.modo_teste_documento() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce((select valor = 'on' from privado.parametros where chave = 'documento_teste'), false) $$;
revoke all on function privado.modo_teste_documento() from public, anon, authenticated;

create or replace function privado.validar_cadastro() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_prov  text;
  v_dom   text;
begin
  select email, raw_app_meta_data ->> 'provider' into v_email, v_prov
    from auth.users where id = new.user_id;
  if v_email is null then raise exception 'Usuário não encontrado.'; end if;

  if v_prov not in ('google', 'azure') then
    raise exception 'Entre com a sua conta Google (Gmail) ou Microsoft (Outlook).';
  end if;
  v_dom := lower(split_part(v_email, '@', 2));
  if v_dom not in ('gmail.com', 'googlemail.com', 'outlook.com', 'outlook.com.br',
                   'hotmail.com', 'hotmail.com.br', 'live.com', 'msn.com') then
    raise exception 'Use um e-mail pessoal Gmail ou Outlook/Hotmail. O e-mail % não é aceito.', v_email;
  end if;
  new.email := lower(v_email);

  new.nome_responsavel := btrim(regexp_replace(new.nome_responsavel, '\s+', ' ', 'g'));
  new.empresa_nome     := btrim(regexp_replace(new.empresa_nome, '\s+', ' ', 'g'));
  if length(new.nome_responsavel) < 3 or position(' ' in new.nome_responsavel) = 0 then
    raise exception 'Informe o nome e o sobrenome do responsável.';
  end if;
  if length(new.empresa_nome) < 2 then raise exception 'Informe o nome da empresa.'; end if;

  new.documento := regexp_replace(new.documento, '\D', '', 'g');
  -- Documento: 11 (CPF) ou 14 (CNPJ) números. Os dígitos verificadores só são conferidos fora do "modo teste".
  if length(new.documento) not in (11, 14)
     or (not privado.documento_valido(new.documento) and not privado.modo_teste_documento()) then
    raise exception 'CPF ou CNPJ inválido.';
  end if;
  new.tipo_documento := case length(new.documento) when 11 then 'cpf' else 'cnpj' end;

  new.celular := regexp_replace(new.celular, '\D', '', 'g');
  if new.celular !~ '^\d{2}9\d{8}$' then
    raise exception 'Informe o celular com DDD (11 dígitos, ex.: 51 99999-9999).';
  end if;

  new.atualizado_em := now();
  return new;
end $$;
