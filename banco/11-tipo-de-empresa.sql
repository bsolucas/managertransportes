-- =============================================================================
-- 11 — TIPO DE EMPRESA (no cadastro do assinante e na empresa)
-- -----------------------------------------------------------------------------
-- Quem assina diz que tipo de transporte faz. Serve para o dono do sistema saber
-- quem é quem e, depois, para adaptar o sistema a cada tipo.
--   taxi | van | onibus | frota_pequena | frota_grande | interno | outro
-- (interno = transporte dos próprios funcionários, sem clientes externos)
-- =============================================================================

alter table public.cadastros add column if not exists tipo_empresa text not null default 'outro';
alter table public.cadastros drop constraint if exists cadastros_tipo_empresa_check;
alter table public.cadastros add constraint cadastros_tipo_empresa_check
  check (tipo_empresa in ('taxi', 'van', 'onibus', 'frota_pequena', 'frota_grande', 'interno', 'outro'));

alter table public.empresas add column if not exists tipo_empresa text;
alter table public.empresas drop constraint if exists empresas_tipo_empresa_check;
alter table public.empresas add constraint empresas_tipo_empresa_check
  check (tipo_empresa is null or tipo_empresa in ('taxi', 'van', 'onibus', 'frota_pequena', 'frota_grande', 'interno', 'outro'));

-- O navegador pode gravar o tipo (como já grava o plano); o status continua só do banco.
grant insert (user_id, nome_responsavel, empresa_nome, documento, celular, plano, tipo_empresa) on public.cadastros to authenticated;
grant update (nome_responsavel, empresa_nome, documento, celular, plano, tipo_empresa) on public.cadastros to authenticated;

-- ---------- Painel do dono: mostra o tipo ----------
drop function if exists public.dono_cadastros();
create function public.dono_cadastros()
  returns table (
    user_id uuid, email text, nome_responsavel text, empresa_nome text, documento text, tipo_documento text,
    celular text, plano text, plano_nome text, status text, criado_em timestamptz, tipo_empresa text
  )
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  return query
    select c.user_id, c.email, c.nome_responsavel, c.empresa_nome, c.documento, c.tipo_documento,
           c.celular, c.plano, p.nome, c.status, c.criado_em, c.tipo_empresa
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
    tipo_empresa text
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
           e.tipo_empresa
      from public.empresas e
      left join public.planos p on p.id = e.plano
     order by e.criada_em desc;
end $$;

revoke all on function public.dono_empresas(), public.dono_cadastros() from public, anon;
grant execute on function public.dono_empresas(), public.dono_cadastros() to authenticated;
