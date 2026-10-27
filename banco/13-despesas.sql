-- =============================================================================
-- 13 — DESPESAS (controle de gastos, pensado no plano Individual)
-- -----------------------------------------------------------------------------
-- Quem trabalha sozinho lança o que gasta (combustível, manutenção, pedágio...) e
-- o painel mostra o saldo do mês: corridas concluídas menos despesas.
-- Só o gestor da empresa lê e grava; motorista e cliente não enxergam nada.
-- =============================================================================

create table if not exists public.despesas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  data       date not null default current_date,
  categoria  text not null check (categoria in
             ('combustivel', 'manutencao', 'pedagio', 'estacionamento', 'lavagem',
              'documentos', 'financiamento', 'alimentacao', 'outros')),
  descricao  text,
  valor      numeric(10,2) not null check (valor > 0 and valor < 10000000),
  criado_em  timestamptz not null default now()
);
create index if not exists despesas_empresa_data on public.despesas (empresa_id, data desc);

alter table public.despesas enable row level security;
revoke all on public.despesas from anon, authenticated;
grant select, insert, update, delete on public.despesas to authenticated;

drop policy if exists gestor_empresa on public.despesas;
create policy gestor_empresa on public.despesas for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
