-- =============================================================================
-- 03-planilhas-fechamento-app-notificacoes.sql
-- -----------------------------------------------------------------------------
-- Rode DEPOIS do 01 e do 02. Acrescenta ao banco:
--   1. Fechamento do cliente: quinzenal (1-15 e 16-fim do mês) ou mensal
--   2. Importação de planilhas (cada corrida importada guarda a linha original)
--   3. Preços combinados por cliente e fechamentos (totais por período)
--   4. Perfis de motorista e cliente (login no app) com acesso limitado
--   5. Dispositivos do app Android (push) e versões do app (teste na Play Store)
--   6. Notificações de corrida
--   7. Posição dos motoristas em tempo real (mapa)
-- Não contém senhas nem chaves.
-- =============================================================================

-- ---------- 1. Cliente: tipo de fechamento e login ----------
alter table public.clientes
  add column fechamento text not null default 'mensal' check (fechamento in ('quinzenal', 'mensal')),
  add column user_id uuid unique references auth.users(id) on delete set null;
alter table public.motoristas
  add column user_id uuid unique references auth.users(id) on delete set null;

-- ---------- 4a. Papéis: motorista e cliente também podem ter login ----------
alter table public.perfis drop constraint perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('gestor', 'master', 'motorista', 'cliente'));

create function privado.papel_do_usuario() returns text
  language sql stable security definer set search_path = ''
  as $$ select papel from public.perfis where user_id = (select auth.uid()) $$;
create function privado.meu_motorista_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select id from public.motoristas where user_id = (select auth.uid()) $$;
create function privado.meu_cliente_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select id from public.clientes where user_id = (select auth.uid()) $$;
-- Gestor/master da empresa (usado nas regras abaixo)
create function privado.sou_gestor() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select coalesce((select papel in ('gestor', 'master') from public.perfis where user_id = (select auth.uid())), false) $$;

revoke all on function privado.papel_do_usuario(), privado.meu_motorista_id(),
  privado.meu_cliente_id(), privado.sou_gestor() from public, anon;
grant execute on function privado.papel_do_usuario(), privado.meu_motorista_id(),
  privado.meu_cliente_id(), privado.sou_gestor() to authenticated;

-- ---------- 2. Importação de planilhas ----------
create table public.importacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  cliente_id     uuid references public.clientes(id) on delete set null,
  nome_arquivo   text,
  periodo_inicio date,
  periodo_fim    date,
  qtd_linhas     integer not null default 0,
  valor_total    numeric(12,2) not null default 0,
  valor_estimado numeric(12,2) not null default 0,
  criada_por     uuid references auth.users(id) on delete set null,
  criada_em      timestamptz not null default now()
);
create index importacoes_empresa on public.importacoes (empresa_id, criada_em desc);

-- A corrida importada de planilha usa as mesmas colunas das corridas do app
alter table public.corridas
  add column fonte          text not null default 'app' check (fonte in ('app', 'planilha')),
  add column importacao_id  uuid references public.importacoes(id) on delete cascade,
  add column voucher        text,
  add column data_servico   date,                 -- dia da corrida (base do fechamento)
  add column valor_estimado numeric(10,2),
  add column motorista_nome text,                 -- nome que veio na planilha
  add column placa          text,
  add column linha_original jsonb;                -- linha completa da planilha, sem perder nada
-- Mesmo voucher não entra duas vezes na mesma empresa
create unique index corridas_voucher_unico on public.corridas (empresa_id, voucher) where voucher is not null and voucher <> '';
create index corridas_data_servico on public.corridas (empresa_id, cliente_id, data_servico);
create index corridas_importacao on public.corridas (importacao_id);

-- Corridas importadas não têm serviço/modo do app: valores padrão para não quebrar
alter table public.corridas alter column servico set default 'carro';
alter table public.corridas alter column modo_preco set default 'fixo';
alter table public.corridas alter column origem set default '{}';
alter table public.corridas alter column destino set default '{}';

-- ---------- 3a. Preços combinados por cliente ----------
create table public.precos_cliente (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  origem_nome  text not null,
  destino_nome text not null,
  servico      text not null default 'carro' check (servico in ('carro', 'utilitario', 'guincho')),
  valor        numeric(10,2) not null,
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, origem_nome, destino_nome, servico)
);
create index precos_cliente_empresa on public.precos_cliente (empresa_id);

-- ---------- 3b. Períodos de fechamento ----------
-- quinzenal: 1 a 15 e 16 até o último dia do mês | mensal: 1 até o último dia
create function privado.periodo_fechamento(p_tipo text, p_data date)
  returns table (inicio date, fim date)
  language sql immutable set search_path = ''
  as $$
    select
      case when p_tipo = 'quinzenal' and extract(day from p_data) > 15
           then (date_trunc('month', p_data)::date + 15)
           else date_trunc('month', p_data)::date end,
      case when p_tipo = 'quinzenal' and extract(day from p_data) <= 15
           then (date_trunc('month', p_data)::date + 14)
           else (date_trunc('month', p_data) + interval '1 month - 1 day')::date end
  $$;
grant execute on function privado.periodo_fechamento(text, date) to authenticated;

-- Totais por cliente e período (só corridas concluídas). Respeita o RLS de quem consulta.
create view public.v_totais_periodo with (security_invoker = true) as
select c.empresa_id,
       c.cliente_id,
       cl.fechamento,
       p.inicio,
       p.fim,
       count(*)                          as qtd_corridas,
       sum(c.valor)                      as valor_total,
       sum(coalesce(c.valor_estimado, 0)) as valor_estimado
  from public.corridas c
  join public.clientes cl on cl.id = c.cliente_id
 cross join lateral privado.periodo_fechamento(
       cl.fechamento,
       coalesce(c.data_servico, (c.concluida_em at time zone 'America/Sao_Paulo')::date,
                (c.criada_em at time zone 'America/Sao_Paulo')::date)) p
 where c.status = 'concluida'
 group by c.empresa_id, c.cliente_id, cl.fechamento, p.inicio, p.fim;

-- Fechamentos já "congelados" pelo gestor (para cobrar e marcar como pago)
create table public.fechamentos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  tipo         text not null check (tipo in ('quinzenal', 'mensal')),
  inicio       date not null,
  fim          date not null,
  qtd_corridas integer not null default 0,
  valor_total  numeric(12,2) not null default 0,
  status       text not null default 'fechado' check (status in ('fechado', 'pago')),
  observacoes  text,
  fechado_em   timestamptz not null default now(),
  pago_em      timestamptz,
  unique (cliente_id, inicio, fim)
);
create index fechamentos_empresa on public.fechamentos (empresa_id, inicio desc);

-- ---------- 5. App Android (teste na Play Store) ----------
create table public.dispositivos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  plataforma    text not null default 'android' check (plataforma in ('android', 'ios', 'web')),
  push_token    text not null unique,            -- token do Firebase Cloud Messaging (FCM)
  app_versao    text,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index dispositivos_usuario on public.dispositivos (user_id);

-- Versões do app: o app consulta ao abrir para avisar de atualização (sem login)
create table public.app_versoes (
  plataforma     text primary key check (plataforma in ('android', 'ios')),
  versao_atual   text not null,
  versao_minima  text not null,
  link_loja      text,                           -- link do teste na Play Store
  mensagem       text,
  atualizado_em  timestamptz not null default now()
);
insert into public.app_versoes (plataforma, versao_atual, versao_minima, mensagem)
values ('android', '0.1.0', '0.1.0', 'Versão de teste');

-- ---------- 6. Notificações ----------
create table public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,   -- quem recebe
  tipo        text not null,          -- nova_corrida | corrida_aceita | corrida_concluida | corrida_cancelada
  titulo      text not null,
  corpo       text,
  corrida_id  uuid references public.corridas(id) on delete cascade,
  lida        boolean not null default false,
  criada_em   timestamptz not null default now()
);
create index notificacoes_usuario on public.notificacoes (user_id, lida, criada_em desc);

-- Cria as notificações sozinho quando uma corrida nasce ou muda de situação
create function privado.notificar_corrida() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_titulo text;
  v_corpo  text;
  v_tipo   text;
begin
  if tg_op = 'INSERT' and new.status = 'aguardando' then
    v_tipo := 'nova_corrida'; v_titulo := 'Nova corrida #' || coalesce(new.codigo::text, '');
    v_corpo := coalesce(new.origem->>'nome', '') || ' → ' || coalesce(new.destino->>'nome', '');
    -- gestores da empresa + motoristas disponíveis com login
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master')
    union
    select new.empresa_id, m.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.motoristas m
     where m.empresa_id = new.empresa_id and m.user_id is not null and m.status = 'disponivel'
       and new.servico = any (m.servicos);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
        and new.status in ('aceita', 'concluida', 'cancelada') then
    v_tipo := 'corrida_' || case new.status when 'aceita' then 'aceita' when 'concluida' then 'concluida' else 'cancelada' end;
    v_titulo := 'Corrida #' || coalesce(new.codigo::text, '') || ' ' ||
                case new.status when 'aceita' then 'aceita' when 'concluida' then 'concluída' else 'cancelada' end;
    v_corpo := coalesce(new.origem->>'nome', '') || ' → ' || coalesce(new.destino->>'nome', '');
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master')
    union
    select new.empresa_id, c.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.clientes c where c.id = new.cliente_id and c.user_id is not null;
  end if;
  return new;
end $$;
revoke all on function privado.notificar_corrida() from public, anon, authenticated;
create trigger corridas_notificar after insert or update of status on public.corridas
  for each row when (new.fonte = 'app') execute function privado.notificar_corrida();

-- ---------- 7. Posição dos motoristas em tempo real ----------
create table public.posicoes (
  motorista_id  uuid primary key references public.motoristas(id) on delete cascade,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  corrida_id    uuid references public.corridas(id) on delete set null,
  lat           double precision not null,
  lng           double precision not null,
  rumo          real,                              -- direção em graus
  velocidade    real,                              -- km/h
  atualizada_em timestamptz not null default now()
);
create index posicoes_empresa on public.posicoes (empresa_id);

-- =============================================================================
-- SEGURANÇA (RLS)
-- =============================================================================
alter table public.importacoes    enable row level security;
alter table public.precos_cliente enable row level security;
alter table public.fechamentos    enable row level security;
alter table public.dispositivos   enable row level security;
alter table public.app_versoes    enable row level security;
alter table public.notificacoes   enable row level security;
alter table public.posicoes       enable row level security;

grant select, insert, update, delete on public.importacoes, public.precos_cliente, public.fechamentos,
  public.dispositivos, public.posicoes to authenticated;
grant select, update, delete on public.notificacoes to authenticated;
grant select on public.v_totais_periodo to authenticated;
-- A versão do app pode ser lida sem login (não tem dado sensível)
grant select on public.app_versoes to anon, authenticated;
create policy ver_versoes on public.app_versoes for select to anon, authenticated using (true);

-- Gestor/master: acesso total às linhas da própria empresa
create policy gestor_empresa on public.importacoes    for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.precos_cliente for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.fechamentos    for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.posicoes       for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));

-- Cliente enxerga o próprio preço e os próprios fechamentos
create policy cliente_proprio on public.precos_cliente for select to authenticated
  using (cliente_id = (select privado.meu_cliente_id()));
create policy cliente_proprio on public.fechamentos for select to authenticated
  using (cliente_id = (select privado.meu_cliente_id()));

-- Notificações e dispositivos: cada pessoa só mexe nas próprias
create policy minhas on public.notificacoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meus on public.dispositivos for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and empresa_id = (select privado.empresa_do_usuario()));

-- Posição: o motorista grava a própria; o cliente vê a do motorista da sua corrida em andamento
create policy motorista_propria on public.posicoes for all to authenticated
  using (motorista_id = (select privado.meu_motorista_id()))
  with check (motorista_id = (select privado.meu_motorista_id()));
create policy cliente_ve_motorista on public.posicoes for select to authenticated
  using (exists (select 1 from public.corridas c
                  where c.id = posicoes.corrida_id and c.cliente_id = (select privado.meu_cliente_id())
                    and c.status in ('aceita', 'em_andamento')));

-- ---------- 4b. As regras antigas passam a valer SÓ para gestor/master ----------
drop policy so_minha_empresa on public.clientes;
drop policy so_minha_empresa on public.motoristas;
drop policy so_minha_empresa on public.locais;
drop policy so_minha_empresa on public.tarifas;
drop policy so_minha_empresa on public.corridas;
drop policy so_minha_empresa on public.mensagens;

create policy gestor_empresa on public.clientes   for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.motoristas for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.locais     for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.tarifas    for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.corridas   for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));
create policy gestor_empresa on public.mensagens  for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));

-- Locais e tarifas: motorista e cliente podem ler os da empresa
create policy todos_leem on public.locais  for select to authenticated using (empresa_id = (select privado.empresa_do_usuario()));
create policy todos_leem on public.tarifas for select to authenticated using (empresa_id = (select privado.empresa_do_usuario()));

-- Motorista: vê o próprio cadastro; vê corridas aguardando (para aceitar) e as dele
create policy motorista_proprio on public.motoristas for select to authenticated
  using (user_id = (select auth.uid()));
create policy motorista_atualiza on public.motoristas for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy motorista_ve on public.corridas for select to authenticated
  using ((select privado.papel_do_usuario()) = 'motorista' and empresa_id = (select privado.empresa_do_usuario())
         and (motorista_id = (select privado.meu_motorista_id()) or status = 'aguardando'));
create policy motorista_atualiza on public.corridas for update to authenticated
  using ((select privado.papel_do_usuario()) = 'motorista' and empresa_id = (select privado.empresa_do_usuario())
         and (motorista_id = (select privado.meu_motorista_id()) or status = 'aguardando'))
  with check (motorista_id = (select privado.meu_motorista_id()));

-- Cliente: vê o próprio cadastro, pede corridas e vê as dele
create policy cliente_proprio on public.clientes for select to authenticated
  using (user_id = (select auth.uid()));
create policy cliente_ve on public.corridas for select to authenticated
  using (cliente_id = (select privado.meu_cliente_id()));
create policy cliente_pede on public.corridas for insert to authenticated
  with check (cliente_id = (select privado.meu_cliente_id())
              and empresa_id = (select privado.empresa_do_usuario()) and status = 'aguardando' and fonte = 'app');
create policy cliente_cancela on public.corridas for update to authenticated
  using (cliente_id = (select privado.meu_cliente_id()) and status in ('aguardando', 'aceita'))
  with check (cliente_id = (select privado.meu_cliente_id()) and status = 'cancelada');

-- Chat: quem participa da corrida (a RLS de corridas já filtra) lê e escreve
create policy participante_le on public.mensagens for select to authenticated
  using (exists (select 1 from public.corridas c where c.id = mensagens.corrida_id));
create policy participante_escreve on public.mensagens for insert to authenticated
  with check (empresa_id = (select privado.empresa_do_usuario())
              and exists (select 1 from public.corridas c where c.id = mensagens.corrida_id));

-- Atualização ao vivo
alter publication supabase_realtime add table public.notificacoes, public.posicoes;
