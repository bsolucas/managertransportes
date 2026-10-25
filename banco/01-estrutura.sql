-- =============================================================================
-- 01-estrutura.sql — ESTRUTURA DO BANCO DE DADOS (Supabase / PostgreSQL)
-- -----------------------------------------------------------------------------
-- Uma empresa de transporte (ex.: Garcia Transportes) = uma linha em "empresas".
-- TODAS as outras tabelas têm "empresa_id", e o RLS (segurança por linha) garante
-- que cada usuário só enxerga e altera os dados da PRÓPRIA empresa.
--
-- Quem usa o painel (gestor/master) é um usuário do Supabase Auth ligado a uma
-- empresa na tabela "perfis". Motorista e cliente ainda não têm login (fase 2).
-- Este arquivo não contém senhas nem chaves.
-- =============================================================================

-- Funções internas ficam num esquema "privado", que a API pública não expõe.
create schema if not exists privado;

-- ---------- Empresas (as empresas de transporte que usam o sistema) ----------
create table public.empresas (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  sigla              text not null,                  -- aparece no logotipo (ex.: GT)
  logo_url           text,
  contador_corridas  integer not null default 1000,  -- numeração amigável das corridas
  criada_em          timestamptz not null default now()
);

-- ---------- Perfis: liga o usuário do login à empresa dele ----------
create table public.perfis (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome       text not null,
  papel      text not null default 'gestor' check (papel in ('gestor', 'master')),
  criado_em  timestamptz not null default now()
);

-- Devolve a empresa do usuário que está logado (usada nas regras de segurança).
create function privado.empresa_do_usuario() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select empresa_id from public.perfis where user_id = (select auth.uid()) $$;

revoke all on function privado.empresa_do_usuario() from public, anon;
grant usage on schema privado to authenticated;
grant execute on function privado.empresa_do_usuario() to authenticated;

-- ---------- Clientes (empresas terceirizadas que pedem corridas) ----------
create table public.clientes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  nome         text not null,        -- pessoa de contato
  empresa_nome text,                 -- empresa cliente
  cnpj         text,
  telefone     text,
  email        text,
  endereco     text,
  observacoes  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);
-- Mesmo CNPJ não pode se repetir dentro da mesma empresa
create unique index clientes_cnpj_unico on public.clientes (empresa_id, cnpj) where cnpj is not null and cnpj <> '';

-- ---------- Motoristas ----------
create table public.motoristas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null,
  telefone    text,
  avaliacao   numeric(2,1) not null default 5.0,
  servicos    text[] not null default '{}',          -- carro | utilitario | guincho
  status      text not null default 'offline' check (status in ('disponivel', 'em_corrida', 'offline')),
  veiculo     jsonb not null default '{}',           -- { modelo, placa, cor }
  rota_livre  jsonb not null default '[]',           -- pontos da simulação (teste)
  criado_em   timestamptz not null default now()
);

-- ---------- Locais (origens e destinos frequentes) ----------
create table public.locais (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null,
  lat         double precision not null,
  lng         double precision not null
);

-- ---------- Tarifas (uma linha por empresa, com todas as regras de preço) ----------
create table public.tarifas (
  empresa_id    uuid primary key references public.empresas(id) on delete cascade,
  dados         jsonb not null,    -- { modoPadrao, servicos, ocasioes, tabelaFixa }
  atualizado_em timestamptz not null default now()
);

-- ---------- Corridas ----------
create table public.corridas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  codigo             integer,                         -- número amigável (#1001...), preenchido sozinho
  cliente_id         uuid references public.clientes(id) on delete restrict,
  motorista_id       uuid references public.motoristas(id) on delete set null,
  origem             jsonb not null,                  -- { id, nome, lat, lng }
  destino            jsonb not null,
  servico            text not null check (servico in ('carro', 'utilitario', 'guincho')),
  modo_preco         text not null check (modo_preco in ('fixo', 'variavel')),
  ocasioes           text[] not null default '{}',
  valor              numeric(10,2) not null default 0,
  calculo            jsonb,                           -- detalhes do preço
  extras             jsonb not null default '[]',     -- [{ descricao, valor }]
  observacoes        text,
  status             text not null default 'aguardando'
                       check (status in ('aguardando', 'aceita', 'em_andamento', 'concluida', 'cancelada')),
  criada_em          timestamptz not null default now(),
  aceita_em          timestamptz,
  iniciada_em        timestamptz,
  concluida_em       timestamptz,
  cancelada_em       timestamptz,
  partida_motorista  jsonb,
  historico          jsonb not null default '[]'
);
create unique index corridas_codigo_unico on public.corridas (empresa_id, codigo);
create index corridas_empresa_data on public.corridas (empresa_id, criada_em desc);
create index corridas_cliente on public.corridas (cliente_id);
create index corridas_motorista on public.corridas (motorista_id);

-- Numera a corrida sozinho: #1001, #1002... (um contador por empresa)
create function privado.numerar_corrida() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  update public.empresas set contador_corridas = contador_corridas + 1
   where id = new.empresa_id returning contador_corridas into new.codigo;
  return new;
end $$;
revoke all on function privado.numerar_corrida() from public, anon, authenticated;
create trigger corridas_numerar before insert on public.corridas
  for each row when (new.codigo is null) execute function privado.numerar_corrida();

-- ---------- Mensagens do chat das corridas ----------
create table public.mensagens (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  corrida_id  uuid not null references public.corridas(id) on delete cascade,
  autor_tipo  text not null check (autor_tipo in ('cliente', 'motorista', 'gestor', 'sistema')),
  autor_nome  text,
  texto       text not null,
  criada_em   timestamptz not null default now()
);
create index mensagens_corrida on public.mensagens (corrida_id, criada_em);

create index clientes_empresa    on public.clientes (empresa_id);
create index motoristas_empresa  on public.motoristas (empresa_id);
create index locais_empresa      on public.locais (empresa_id);
create index mensagens_empresa   on public.mensagens (empresa_id);

-- =============================================================================
-- SEGURANÇA (RLS): ligada em TODAS as tabelas.
-- Sem login (chave "anon") ninguém lê nem grava nada.
-- =============================================================================
alter table public.empresas   enable row level security;
alter table public.perfis     enable row level security;
alter table public.clientes   enable row level security;
alter table public.motoristas enable row level security;
alter table public.locais     enable row level security;
alter table public.tarifas    enable row level security;
alter table public.corridas   enable row level security;
alter table public.mensagens  enable row level security;

-- O visitante sem login não tem acesso a nenhuma tabela
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Quem está logado (authenticated) pode usar as tabelas; o RLS abaixo limita às linhas da própria empresa
grant select on public.perfis to authenticated;
grant select, update on public.empresas to authenticated;
grant select, insert, update, delete on public.clientes, public.motoristas, public.locais,
  public.tarifas, public.corridas, public.mensagens to authenticated;

-- Cada usuário vê o próprio perfil e a própria empresa
create policy perfil_proprio  on public.perfis   for select to authenticated using (user_id = (select auth.uid()));
create policy empresa_propria on public.empresas for select to authenticated using (id = (select privado.empresa_do_usuario()));
create policy empresa_editar  on public.empresas for update to authenticated
  using (id = (select privado.empresa_do_usuario())) with check (id = (select privado.empresa_do_usuario()));

-- Demais tabelas: o usuário só mexe nas linhas da própria empresa
create policy so_minha_empresa on public.clientes   for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario())) with check (empresa_id = (select privado.empresa_do_usuario()));
create policy so_minha_empresa on public.motoristas for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario())) with check (empresa_id = (select privado.empresa_do_usuario()));
create policy so_minha_empresa on public.locais     for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario())) with check (empresa_id = (select privado.empresa_do_usuario()));
create policy so_minha_empresa on public.tarifas    for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario())) with check (empresa_id = (select privado.empresa_do_usuario()));
create policy so_minha_empresa on public.corridas   for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario())) with check (empresa_id = (select privado.empresa_do_usuario()));
create policy so_minha_empresa on public.mensagens  for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario())) with check (empresa_id = (select privado.empresa_do_usuario()));

-- Atualização ao vivo (o painel vê corridas e chat mudarem sem recarregar)
alter publication supabase_realtime add table public.corridas, public.mensagens, public.motoristas;
