-- =============================================================================
-- 09 — PORTAL DO CLIENTE (Etapa 3 da migração)
-- -----------------------------------------------------------------------------
-- O cliente entra com usuário e senha (criados pelo gestor) e pede corridas
-- escolhendo um TRAJETO da lista de Valores. Ajustes de segurança:
--   • o VALOR da corrida pedida pelo cliente vem sempre da lista de trajetos
--     (ele não consegue mandar um valor diferente);
--   • o cliente vê o cadastro do motorista da corrida dele (nome, veículo);
--   • o cliente vê o GPS do motorista da corrida dele (a posição não guarda
--     o id da corrida, então a regra passa a ligar pelo motorista).
-- =============================================================================

-- ---------- Valor do pedido do cliente = valor do trajeto ----------
create or replace function privado.corrida_antes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_gestor boolean := coalesce((select privado.sou_gestor()), false);
  v_agora  bigint  := (extract(epoch from now()) * 1000)::bigint;
  v_cli    record;
  v_valor  numeric;
begin
  if tg_op = 'INSERT' then
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

-- ---------- Cliente vê o motorista da própria corrida ----------
drop policy if exists cliente_ve_motorista on public.motoristas;
create policy cliente_ve_motorista on public.motoristas for select to authenticated
  using (exists (select 1 from public.corridas c
                  where c.motorista_id = motoristas.id
                    and c.cliente_id = (select privado.meu_cliente_id())
                    and c.status in ('aceita', 'em_andamento', 'concluida')));

-- ---------- Cliente vê o GPS do motorista da corrida em andamento ----------
drop policy if exists cliente_ve_motorista on public.posicoes;
create policy cliente_ve_motorista on public.posicoes for select to authenticated
  using (exists (select 1 from public.corridas c
                  where c.motorista_id = posicoes.motorista_id
                    and c.cliente_id = (select privado.meu_cliente_id())
                    and c.status in ('aceita', 'em_andamento')));

-- ---------- Avisos: o texto passa a mostrar o trajeto (a corrida não tem mais origem/destino) ----------
create or replace function privado.notificar_corrida() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_titulo text;
  v_corpo  text;
  v_tipo   text;
begin
  if tg_op = 'INSERT' and new.status = 'aguardando' then
    v_tipo := 'nova_corrida'; v_titulo := 'Nova corrida #' || coalesce(new.codigo::text, '');
    v_corpo := coalesce(new.trajeto, '');
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
    v_corpo := coalesce(new.trajeto, '');
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master')
    union
    select new.empresa_id, c.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.clientes c where c.id = new.cliente_id and c.user_id is not null;
  end if;
  return new;
end $$;
