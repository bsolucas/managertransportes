-- =============================================================================
-- 15 — ADMINISTRAÇÃO DO NEGÓCIO: DIÁRIO, MÓDULOS E CORRIDA PRÓPRIA
-- -----------------------------------------------------------------------------
-- • Plano volta a se chamar BÁSICO (R$ 99,90): serve a quem trabalha SOZINHO (taxista,
--   dono de van escolar) ou com uma pequena frota. No cadastro a pessoa diz qual:
--   modo_uso 'individual' (sozinho) ou 'equipe'. Individual só existe no Básico.
-- • Diário: por dia, km inicial/final e faturamento (taxista não precisa tabela de preços).
-- • empresas.modulos: liga/desliga partes do painel por empresa (ex.: {"rotas": false}).
--   O que não estiver aí segue o padrão do tipo/modo da empresa (decidido no app).
-- • Quem trabalha sozinho registra a PRÓPRIA corrida já concluída, com o valor recebido.
-- =============================================================================

update public.planos set id = 'basico', nome = 'Básico' where id = 'individual';
alter table public.cadastros drop constraint if exists cadastros_plano_check;
alter table public.cadastros add constraint cadastros_plano_check check (plano in ('basico', 'profissional', 'empresarial'));
alter table public.cadastros drop constraint if exists cadastros_modo_uso_check;
alter table public.cadastros add constraint cadastros_modo_uso_check
  check (modo_uso in ('individual', 'equipe') and (modo_uso = 'equipe' or plano = 'basico'));

alter table public.empresas add column if not exists modulos jsonb not null default '{}'::jsonb;

-- ---------- Diário (um lançamento por dia) ----------
create table if not exists public.diario (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  data         date not null,
  km_inicial   numeric(9,1) check (km_inicial >= 0),
  km_final     numeric(9,1) check (km_final >= 0),
  faturamento  numeric(10,2) not null default 0 check (faturamento >= 0 and faturamento < 10000000),
  corridas     integer check (corridas >= 0 and corridas < 10000),
  observacoes  text,
  criado_em    timestamptz not null default now(),
  unique (empresa_id, data),
  check (km_inicial is null or km_final is null or km_final >= km_inicial)
);
alter table public.diario enable row level security;
revoke all on public.diario from anon, authenticated;
grant select, insert, update, delete on public.diario to authenticated;
drop policy if exists gestor_empresa on public.diario;
create policy gestor_empresa on public.diario for all to authenticated
  using (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()))
  with check (empresa_id = (select privado.empresa_do_usuario()) and (select privado.sou_gestor()));

-- ---------- Corrida própria (modo individual) ----------
create or replace function privado.corrida_antes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_gestor boolean := coalesce((select privado.sou_gestor()), false);
  v_agora  bigint  := (extract(epoch from now()) * 1000)::bigint;
  v_cli    record;
  v_valor  numeric;
  v_solo   boolean;
begin
  if tg_op = 'INSERT' then
    -- Empresa que trabalha sozinha (modo individual): o gestor REGISTRA a própria corrida já concluída,
    -- com o valor que recebeu (sem preço de tabela, sem motorista cadastrado, cliente opcional).
    if v_gestor and new.status = 'concluida' then
      v_solo := exists (select 1 from public.empresas where id = new.empresa_id and modo_uso = 'individual');
      if not v_solo then raise exception 'Só quem trabalha sozinho pode registrar corrida já concluída.'; end if;
      if new.valor is null or new.valor <= 0 then raise exception 'Informe o valor recebido pela corrida.'; end if;
      new.trajeto := coalesce(nullif(btrim(coalesce(new.trajeto, '')), ''), 'Corrida avulsa');
      new.concluida_em := coalesce(new.concluida_em, now());
      if new.concluida_em > now() + interval '5 minutes' or new.concluida_em < now() - interval '2 years' then
        raise exception 'Data da corrida inválida.';
      end if;
      new.aceita_em := new.concluida_em; new.iniciada_em := new.concluida_em;
      new.extras := '[]'::jsonb;
      new.motorista_id := null;
      if new.cliente_id is not null then
        select nome, telefone into v_cli from public.clientes where id = new.cliente_id and empresa_id = new.empresa_id;
        if not found then raise exception 'Cliente não encontrado.'; end if;
        new.cliente_nome := v_cli.nome; new.cliente_telefone := v_cli.telefone;
      end if;
      new.historico := jsonb_build_array(jsonb_build_object('status', 'concluida', 'em', (extract(epoch from new.concluida_em) * 1000)::bigint));
      return new;
    end if;
    if coalesce(btrim(new.trajeto), '') = '' then raise exception 'Escolha o trajeto da corrida.'; end if;
    if not v_gestor then
      -- cliente: o valor é o do trajeto cadastrado pela empresa
      select (t ->> 'valor')::numeric into v_valor
        from public.tarifas f, jsonb_array_elements(coalesce(f.dados -> 'trajetos', '[]'::jsonb)) t
       where f.empresa_id = new.empresa_id and t ->> 'nome' = new.trajeto
       limit 1;
      if v_valor is null then raise exception 'Trajeto não encontrado. Atualize a página e escolha outro.'; end if;
      new.valor := v_valor;
      new.extras := '[]'::jsonb;
    end if;
    if new.valor is null or new.valor < 0 then raise exception 'Valor inválido.'; end if;
    select nome, telefone into v_cli from public.clientes where id = new.cliente_id;
    if not found then raise exception 'Escolha o cliente da corrida.'; end if;
    new.cliente_nome := v_cli.nome;
    new.cliente_telefone := v_cli.telefone;
    new.status := 'aguardando';
    new.motorista_id := null;
    new.historico := jsonb_build_array(jsonb_build_object('status', 'aguardando', 'em', v_agora));
    return new;
  end if;

  -- UPDATE
  if not v_gestor then
    if new.valor is distinct from old.valor or new.extras is distinct from old.extras
       or new.cliente_id is distinct from old.cliente_id or new.trajeto is distinct from old.trajeto
       or new.embarque is distinct from old.embarque or new.servico is distinct from old.servico
       or new.observacoes is distinct from old.observacoes or new.empresa_id is distinct from old.empresa_id then
      raise exception 'Você não pode alterar os dados desta corrida.';
    end if;
    if new.motorista_id is distinct from old.motorista_id and old.motorista_id is not null then
      raise exception 'Esta corrida já tem motorista.';
    end if;
  elsif new.valor is distinct from old.valor or new.extras is distinct from old.extras then
    new.valor_editado_em := now();
  end if;

  if new.status is distinct from old.status then
    if old.status in ('concluida', 'cancelada') then raise exception 'Esta corrida já foi encerrada.'; end if;
    if new.status = 'aceita' then
      if old.status <> 'aguardando' then raise exception 'Esta corrida não está mais aguardando motorista.'; end if;
      if new.motorista_id is null then raise exception 'Informe o motorista.'; end if;
      new.aceita_em := now();
    elsif new.status = 'em_andamento' then
      if old.status <> 'aceita' then raise exception 'A corrida precisa estar aceita para ser iniciada.'; end if;
      new.iniciada_em := now();
    elsif new.status = 'concluida' then
      if old.status <> 'em_andamento' then raise exception 'A corrida precisa estar em andamento para ser concluída.'; end if;
      new.concluida_em := now();
    elsif new.status = 'cancelada' then
      new.cancelada_em := now();
    else
      raise exception 'Situação inválida.';
    end if;
    new.historico := old.historico || jsonb_build_object('status', new.status, 'em', v_agora);
  elsif new.motorista_id is distinct from old.motorista_id and not v_gestor then
    raise exception 'Mudança não permitida.';
  end if;
  return new;
end $$;

-- Sem mensagem automática de "solicitada" para corrida já concluída
create or replace function privado.corrida_depois() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_mot   record;
  v_texto text;
  v_total numeric;
begin
  if tg_op = 'INSERT' then
    if new.status = 'aguardando' then   -- corrida registrada já concluída (modo individual) não gera mensagem
      v_texto := 'Corrida #' || new.codigo || ' solicitada. Aguardando um motorista aceitar.';
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'aceita' then
      select nome, veiculo into v_mot from public.motoristas where id = new.motorista_id;
      v_texto := coalesce(v_mot.nome, 'Motorista') || ' aceitou a corrida' ||
                 case when coalesce((select privado.sou_gestor()), false) then ' (designado pelo gestor)' else '' end ||
                 '. Veículo: ' || coalesce(v_mot.veiculo ->> 'modelo', '') || ' • ' || coalesce(v_mot.veiculo ->> 'placa', '') || '.';
      update public.motoristas set status = 'em_corrida' where id = new.motorista_id;
    elsif new.status = 'em_andamento' then
      v_texto := 'Corrida iniciada.';
    elsif new.status = 'concluida' then
      select coalesce(sum((e ->> 'valor')::numeric), 0) into v_total from jsonb_array_elements(new.extras) e;
      v_total := new.valor + v_total;
      v_texto := 'Corrida concluída. Total: R$ ' || replace(to_char(v_total, 'FM9999999990.00'), '.', ',') || '.';
    elsif new.status = 'cancelada' then
      v_texto := 'Corrida cancelada' || case when coalesce(new.motivo_cancelamento, '') <> '' then ': ' || new.motivo_cancelamento else '' end || '.';
    end if;
    if new.status in ('concluida', 'cancelada') and new.motorista_id is not null then
      update public.motoristas set status = 'disponivel'
       where id = new.motorista_id and status = 'em_corrida'
         and not exists (select 1 from public.corridas c
                          where c.motorista_id = new.motorista_id and c.status in ('aceita', 'em_andamento'));
    end if;
  end if;

  if v_texto is not null then
    perform set_config('app.sistema', 'on', true);
    insert into public.mensagens (empresa_id, corrida_id, autor_tipo, autor_nome, texto)
      values (new.empresa_id, new.id, 'sistema', 'Sistema', v_texto);
    perform set_config('app.sistema', 'off', true);
  end if;
  return null;
end $$;
