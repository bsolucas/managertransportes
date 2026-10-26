-- =============================================================================
-- 08 — PAINEL DO DONO DO SISTEMA (Manager Transportes)
-- -----------------------------------------------------------------------------
-- O dono do sistema enxerga TODAS as empresas que assinam. Isso é diferente do
-- "master" que já existe em "perfis": aquele é um gestor DENTRO de uma empresa.
--
-- Como a segurança funciona:
--   • "donos" guarda quem é dono. Ninguém lê nem grava nela pela API: o RLS fica
--     ligado SEM nenhuma regra e os acessos são tirados de anon/authenticated.
--     Só dá para incluir alguém pelo SQL Editor do Supabase (veja
--     banco/CONFIGURAR-PAINEL-DONO.md).
--   • As funções dono_* conferem, por dentro, se quem chamou está em "donos";
--     senão respondem "Acesso negado.". Elas devolvem só NÚMEROS e dados de
--     cadastro da assinatura — nunca o conteúdo das corridas, clientes ou
--     motoristas de uma empresa.
--   • Os dados de cada empresa continuam isolados pelo RLS de sempre: o dono NÃO
--     ganha acesso direto às tabelas das empresas.
-- =============================================================================

-- ---------- Planos (fonte dos preços e limites no banco) ----------
create table public.planos (
  id                text primary key,
  nome              text not null,
  preco             numeric(10,2) not null,
  max_empresas      integer,               -- empresas clientes (null = ilimitado)
  max_funcionarios  integer,               -- funcionários por empresa (null = ilimitado)
  ativo             boolean not null default true
);
insert into public.planos (id, nome, preco, max_empresas, max_funcionarios) values
  ('basico',       'Básico',       129.90, 5,    100),
  ('profissional', 'Profissional', 249.90, 10,   1000),
  ('empresarial',  'Empresarial',  329.90, null, null);
alter table public.planos enable row level security;
create policy planos_publicos on public.planos for select to anon, authenticated using (true);
grant select on public.planos to anon, authenticated;

-- ---------- Assinatura de cada empresa ----------
alter table public.empresas
  add column plano text references public.planos(id),
  add column assinatura_status text not null default 'ativa'
        check (assinatura_status in ('ativa', 'teste', 'suspensa', 'cancelada')),
  add column assinatura_inicio date;

-- ---------- Quem é dono ----------
create table public.donos (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.donos enable row level security;      -- sem nenhuma regra: ninguém acessa pela API
revoke all on public.donos from anon, authenticated;

create or replace function privado.sou_dono() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.donos where user_id = (select auth.uid())) $$;
revoke all on function privado.sou_dono() from public, anon, authenticated;
grant execute on function privado.sou_dono() to authenticated;

-- ---------- Resumo geral ----------
create or replace function public.dono_resumo() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  return jsonb_build_object(
    'empresas_total',        (select count(*) from public.empresas),
    'empresas_ativas',       (select count(*) from public.empresas where assinatura_status in ('ativa', 'teste')),
    'empresas_suspensas',    (select count(*) from public.empresas where assinatura_status in ('suspensa', 'cancelada')),
    'cadastros_aguardando',  (select count(*) from public.cadastros where status = 'aguardando_pagamento'),
    'motoristas',            (select count(*) from public.motoristas),
    'clientes',              (select count(*) from public.clientes),
    'corridas_30d',          (select count(*) from public.corridas where fonte = 'app' and criada_em > now() - interval '30 days'),
    'receita_mensal',        coalesce((select sum(p.preco) from public.empresas e join public.planos p on p.id = e.plano
                                        where e.assinatura_status = 'ativa'), 0),
    'por_plano',             coalesce((select jsonb_agg(jsonb_build_object('plano', p.nome, 'qtd', q.qtd) order by p.preco)
                                         from public.planos p
                                         left join lateral (select count(*) as qtd from public.empresas e
                                                             where e.plano = p.id and e.assinatura_status in ('ativa', 'teste')) q on true), '[]'::jsonb)
  );
end $$;

-- ---------- Uma linha por empresa assinante ----------
create or replace function public.dono_empresas()
  returns table (
    id uuid, nome text, sigla text, cidade text, uf text,
    plano text, plano_nome text, assinatura_status text, assinatura_inicio date, criada_em timestamptz,
    clientes bigint, motoristas bigint, gestores bigint,
    corridas_total bigint, corridas_30d bigint, ultima_corrida timestamptz, valor_mensal numeric
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
           coalesce(p.preco, 0)
      from public.empresas e
      left join public.planos p on p.id = e.plano
     order by e.criada_em desc;
end $$;

-- ---------- Cadastros de novos assinantes (aguardando pagamento etc.) ----------
create or replace function public.dono_cadastros()
  returns table (
    user_id uuid, email text, nome_responsavel text, empresa_nome text, documento text, tipo_documento text,
    celular text, plano text, plano_nome text, status text, criado_em timestamptz
  )
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  return query
    select c.user_id, c.email, c.nome_responsavel, c.empresa_nome, c.documento, c.tipo_documento,
           c.celular, c.plano, p.nome, c.status, c.criado_em
      from public.cadastros c
      left join public.planos p on p.id = c.plano
     order by c.criado_em desc;
end $$;

-- ---------- Quem é dono? (a tela usa para liberar ou negar a entrada) ----------
create or replace function public.eu_sou_dono() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select privado.sou_dono() $$;

revoke all on function public.dono_resumo(), public.dono_empresas(), public.dono_cadastros(), public.eu_sou_dono() from public, anon;
grant execute on function public.dono_resumo(), public.dono_empresas(), public.dono_cadastros(), public.eu_sou_dono() to authenticated;
