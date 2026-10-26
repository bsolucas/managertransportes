-- =============================================================================
-- 05 — CADASTRO DE NOVOS ASSINANTES (empresas que vão contratar o sistema)
-- -----------------------------------------------------------------------------
-- Quem quer assinar entra na página landing/cadastro.html com a conta Google
-- (Gmail) ou Microsoft (Outlook/Hotmail/Live) e informa: nome do responsável,
-- nome da empresa, CPF/CNPJ e celular. O pedido fica aqui, em "cadastros", com
-- status 'aguardando_pagamento'.
--
-- Essa pessoa NÃO tem acesso ao painel: não existe linha dela em "perfis".
-- Quando o pagamento for confirmado (etapa futura, via gateway), o sistema cria a
-- empresa e o perfil de gestor dela e muda o status para 'ativado'.
--
-- Regras conferidas AQUI no banco (não dá para burlar pelo navegador):
--   • só login pelo Google ou Microsoft, com e-mail pessoal (domínios abaixo);
--   • CPF ou CNPJ com dígitos verificadores corretos, sem repetir;
--   • celular brasileiro com DDD (11 dígitos, começando com 9 depois do DDD);
--   • a pessoa só vê/altera o PRÓPRIO cadastro e nunca mexe no status.
-- =============================================================================

-- ---------- CPF/CNPJ: confere dígitos verificadores (recebe só números) ----------
create or replace function privado.documento_valido(p_doc text) returns boolean
  language plpgsql immutable set search_path = ''
as $$
declare
  d text := p_doc;
  soma int; resto int; i int; dv1 int; dv2 int;
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if d !~ '^\d+$' or d ~ '^(\d)\1+$' then return false; end if;

  if length(d) = 11 then                                   -- CPF
    soma := 0;
    for i in 1..9 loop soma := soma + substr(d, i, 1)::int * (11 - i); end loop;
    resto := soma % 11; dv1 := case when resto < 2 then 0 else 11 - resto end;
    soma := 0;
    for i in 1..9 loop soma := soma + substr(d, i, 1)::int * (12 - i); end loop;
    soma := soma + dv1 * 2;
    resto := soma % 11; dv2 := case when resto < 2 then 0 else 11 - resto end;
    return substr(d, 10, 1)::int = dv1 and substr(d, 11, 1)::int = dv2;

  elsif length(d) = 14 then                                -- CNPJ
    soma := 0;
    for i in 1..12 loop soma := soma + substr(d, i, 1)::int * pesos1[i]; end loop;
    resto := soma % 11; dv1 := case when resto < 2 then 0 else 11 - resto end;
    soma := 0;
    for i in 1..12 loop soma := soma + substr(d, i, 1)::int * pesos2[i]; end loop;
    soma := soma + dv1 * pesos2[13];
    resto := soma % 11; dv2 := case when resto < 2 then 0 else 11 - resto end;
    return substr(d, 13, 1)::int = dv1 and substr(d, 14, 1)::int = dv2;
  end if;
  return false;
end $$;

-- ---------- Tabela de cadastros ----------
create table public.cadastros (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,                         -- preenchido pelo banco (do login)
  nome_responsavel text not null,
  empresa_nome     text not null,
  documento        text not null unique,                  -- só números (CPF 11 / CNPJ 14)
  tipo_documento   text not null check (tipo_documento in ('cpf', 'cnpj')),
  celular          text not null,                         -- só números, com DDD
  plano            text not null check (plano in ('basico', 'profissional', 'empresarial')),
  status           text not null default 'aguardando_pagamento'
                   check (status in ('aguardando_pagamento', 'ativado', 'cancelado')),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- ---------- Validação e normalização (roda em todo insert/update) ----------
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
  if not privado.documento_valido(new.documento) then raise exception 'CPF ou CNPJ inválido.'; end if;
  new.tipo_documento := case length(new.documento) when 11 then 'cpf' else 'cnpj' end;

  new.celular := regexp_replace(new.celular, '\D', '', 'g');
  if new.celular !~ '^\d{2}9\d{8}$' then
    raise exception 'Informe o celular com DDD (11 dígitos, ex.: 51 99999-9999).';
  end if;

  new.atualizado_em := now();
  return new;
end $$;

create trigger cadastros_validar before insert or update on public.cadastros
  for each row execute function privado.validar_cadastro();
revoke all on function privado.validar_cadastro(), privado.documento_valido(text) from public, anon, authenticated;

-- ---------- Segurança (RLS): cada pessoa só mexe no PRÓPRIO cadastro ----------
alter table public.cadastros enable row level security;
revoke all on public.cadastros from anon, authenticated;
grant select on public.cadastros to authenticated;
-- Colunas liberadas: o status e o e-mail nunca são definidos pelo navegador.
grant insert (user_id, nome_responsavel, empresa_nome, documento, celular, plano) on public.cadastros to authenticated;
grant update (nome_responsavel, empresa_nome, documento, celular, plano) on public.cadastros to authenticated;

create policy ver_proprio on public.cadastros for select to authenticated
  using (user_id = (select auth.uid()));
create policy criar_proprio on public.cadastros for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy corrigir_proprio on public.cadastros for update to authenticated
  using (user_id = (select auth.uid()) and status = 'aguardando_pagamento')
  with check (user_id = (select auth.uid()) and status = 'aguardando_pagamento');
