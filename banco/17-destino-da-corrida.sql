-- =============================================================================
-- 17 — ENDEREÇO DE DESTINO NA CORRIDA (para o motorista navegar)
-- -----------------------------------------------------------------------------
-- Além do embarque, a corrida pode ter um endereço de DESTINO (texto livre, opcional).
-- O motorista toca em "Google Maps" ou "Waze" e o app dele abre a rota (link externo,
-- usa a conta do celular dele e não gasta a API do Google do sistema).
-- Só o gestor muda o destino de uma corrida já criada.
-- =============================================================================

alter table public.corridas add column if not exists destino_endereco text;

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
       or new.embarque is distinct from old.embarque or new.destino_endereco is distinct from old.destino_endereco
       or new.servico is distinct from old.servico
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
