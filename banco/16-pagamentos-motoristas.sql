-- =============================================================================
-- 16 — PAGAMENTOS DE MOTORISTAS (comissão ou CLT) + DOIS REFORÇOS DE SEGURANÇA
-- -----------------------------------------------------------------------------
-- O gestor define como cada motorista é pago:
--   • COMISSÃO: % sobre a corrida (valor + extras). Há uma comissão padrão da empresa
--     ("todos a mesma") e, se quiser, uma % própria para um motorista.
--     A comissão só nasce quando a corrida é CONCLUÍDA e fica gravada na corrida
--     (se o gestor mudar a % depois, o que já foi ganho não muda).
--   • CLT: o gestor registra o salário. O motorista NÃO vê esse valor (a tabela
--     é só do gestor) e a aba "Ganhos" dele fica escondida.
--
-- Reforços: (1) só o gestor edita os dados da empresa (antes qualquer usuário da empresa
-- podia trocar o próprio plano!); (2) o motorista só consegue mudar a própria
-- situação (disponível/offline), nunca o resto do cadastro.
-- =============================================================================

-- ---------- Comissão padrão da empresa ----------
create table if not exists public.pagamento_config (
  empresa_id      uuid primary key references public.empresas(id) on delete cascade,
  comissao_padrao numeric(5,2) not null default 0 check (comissao_padrao between 0 and 100)
);

-- ---------- Forma de pagamento de cada motorista (só o gestor lê e grava) ----------
create table if not exists public.pagamentos_motoristas (
  motorista_id        uuid primary key references public.motoristas(id) on delete cascade,
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  tipo                text not null default 'comissao' check (tipo in ('comissao', 'clt')),
  comissao_percentual numeric(5,2) check (comissao_percentual between 0 and 100),   -- null = usa a padrão
  salario             numeric(10,2) check (salario >= 0 and salario < 10000000),
  atualizado_em       timestamptz not null default now()
);

alter table public.pagamento_config enable row level security;
alter table public.pagamentos_motoristas enable row level security;
revoke all on public.pagamento_config, public.pagamentos_motoristas from anon, authenticated;
grant select, insert, update, delete on public.pagamento_config, public.pagamentos_motoristas to authenticated;
drop policy if exists gestor_empresa on public.pagamento_config;
create policy gestor_empresa on public.pagamento_config for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
drop policy if exists gestor_empresa on public.pagamentos_motoristas;
create policy gestor_empresa on public.pagamentos_motoristas for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));

-- ---------- Comissão gravada na corrida ----------
alter table public.corridas
  add column if not exists comissao_percentual numeric(5,2),
  add column if not exists comissao_valor      numeric(10,2);

create or replace function privado.corrida_comissao() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tipo text;
  v_pct  numeric;
  v_base numeric;
begin
  -- Quem manda é o banco: o que o navegador mandar nestas colunas é ignorado.
  if tg_op = 'INSERT' then
    new.comissao_percentual := null; new.comissao_valor := null;
    return new;
  end if;
  new.comissao_percentual := old.comissao_percentual;
  new.comissao_valor := old.comissao_valor;

  if new.status = 'concluida' and new.motorista_id is not null then
    if old.status is distinct from 'concluida' then
      -- acabou de concluir: fixa a % da hora (individual, senão a padrão da empresa)
      select p.tipo, coalesce(p.comissao_percentual, c.comissao_padrao, 0)
        into v_tipo, v_pct
        from public.motoristas m
        left join public.pagamentos_motoristas p on p.motorista_id = m.id
        left join public.pagamento_config c on c.empresa_id = m.empresa_id
       where m.id = new.motorista_id;
      if coalesce(v_tipo, 'comissao') = 'comissao' then new.comissao_percentual := coalesce(v_pct, 0); end if;
    end if;
    -- se tem % fixada, (re)calcula; vale também quando o gestor ajusta valor/extras depois
    if new.comissao_percentual is not null then
      select coalesce(sum((e ->> 'valor')::numeric), 0) into v_base from jsonb_array_elements(new.extras) e;
      v_base := new.valor + v_base;
      new.comissao_valor := round(v_base * new.comissao_percentual / 100, 2);
    end if;
  end if;
  return new;
end $$;
revoke all on function privado.corrida_comissao() from public, anon, authenticated;

drop trigger if exists corridas_comissao on public.corridas;
create trigger corridas_comissao before insert or update on public.corridas
  for each row execute function privado.corrida_comissao();   -- roda depois de corridas_antes (ordem alfabética)

-- ---------- O motorista sabe só COMO é pago (nunca o salário) ----------
create or replace function public.meu_tipo_pagamento() returns text
  language sql stable security definer set search_path = ''
as $$
  select coalesce(p.tipo, 'comissao')
    from public.motoristas m
    left join public.pagamentos_motoristas p on p.motorista_id = m.id
   where m.user_id = (select auth.uid())
$$;
revoke all on function public.meu_tipo_pagamento() from public, anon;
grant execute on function public.meu_tipo_pagamento() to authenticated;

-- ---------- Reforço 1: só o gestor edita os dados da empresa ----------
drop policy if exists empresa_editar on public.empresas;
revoke update on public.empresas from authenticated;
grant update (nome, sigla, logo_url, cidade, uf) on public.empresas to authenticated;
create policy empresa_editar on public.empresas for update to authenticated
  using (id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));

-- ---------- Reforço 2: motorista só muda a própria situação ----------
create or replace function privado.motorista_antes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce((select privado.sou_gestor()), false) or (select auth.uid()) is null then return new; end if;   -- gestor (ou o próprio banco)
  if to_jsonb(new) - 'status' is distinct from to_jsonb(old) - 'status' then
    raise exception 'O motorista só pode alterar a própria situação (disponível/offline).';
  end if;
  return new;
end $$;
revoke all on function privado.motorista_antes() from public, anon, authenticated;
drop trigger if exists motoristas_antes on public.motoristas;
create trigger motoristas_antes before update on public.motoristas
  for each row execute function privado.motorista_antes();
