-- =============================================================================
-- 28 — O GESTOR DEFINE O VALOR DE CADA CORRIDA PEDIDA PELO CLIENTE
-- -----------------------------------------------------------------------------
-- O cliente é funcionário de uma empresa que tem contrato com o gestor: ele não
-- escolhe trajeto nem vê preço. Ele informa EMBARQUE e DESTINO; o gestor olha o
-- destino e define o valor da corrida.
--   • corridas.valor_definido = false enquanto o gestor não preencheu o valor;
--   • corrida pedida pelo cliente nasce com valor 0 e valor_definido = false;
--   • quando o gestor salva um valor maior que zero, valor_definido vira true;
--   • o texto do "trajeto" passa a ser "Para <destino>" (o destino é obrigatório);
--   • o e-mail de aviso diz "Valor: a definir" em vez de R$ 0,00.
-- Corridas lançadas pelo gestor (lista de trajetos) continuam como antes.
-- =============================================================================
alter table public.corridas add column if not exists valor_definido boolean not null default true;

create or replace function privado.corrida_antes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_gestor boolean := coalesce((select privado.sou_gestor()), false);
  v_agora  bigint  := (extract(epoch from now()) * 1000)::bigint;
  v_cli    record;
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
    if not v_gestor then
      -- cliente: informa o destino; o VALOR fica a definir (o gestor preenche depois)
      if coalesce(btrim(new.destino_endereco), '') = '' then raise exception 'Informe o endereço de destino.'; end if;
      new.trajeto := 'Para ' || left(btrim(new.destino_endereco), 120);
      new.valor := 0;
      new.valor_definido := false;
      new.extras := '[]'::jsonb;
    end if;
    if coalesce(btrim(new.trajeto), '') = '' then raise exception 'Escolha o trajeto da corrida.'; end if;
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
       or new.valor_definido is distinct from old.valor_definido
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
    if new.valor is distinct from old.valor and new.valor > 0 then new.valor_definido := true; end if;   -- o gestor definiu o valor
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

-- ---------- E-mail de aviso ao gestor: "Valor: a definir" ----------
create or replace function privado.avisar_email_corrida() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_para text;
  v_emp  text;
  v_cli  text;
begin
  if coalesce((select privado.papel_do_usuario()), '') <> 'cliente' then return null; end if;   -- só pedidos feitos pelo cliente
  select e.email_avisos, e.nome into v_para, v_emp from public.empresas e where e.id = new.empresa_id;
  if coalesce(v_para, '') = '' then return null; end if;
  select coalesce(nullif(c.empresa_nome, ''), c.nome) into v_cli from public.clientes c where c.id = new.cliente_id;
  perform privado.enviar_email(
    v_para,
    'Nova corrida #' || coalesce(new.codigo::text, '') || ' - ' || coalesce(v_cli, 'cliente'),
    'Um cliente pediu uma corrida em ' || coalesce(v_emp, 'sua empresa') || E'.\n\n' ||
    'Corrida: #' || coalesce(new.codigo::text, '') || E'\n' ||
    'Cliente: ' || coalesce(v_cli, '-') || E'\n' ||
    'Embarque: ' || coalesce(nullif(new.embarque, ''), '-') || E'\n' ||
    'Destino: ' || coalesce(nullif(new.destino_endereco, ''), '-') || E'\n' ||
    case when new.valor_definido
         then 'Valor: R$ ' || replace(to_char(new.valor, 'FM9999999990.00'), '.', ',') || E'\n'
         else E'Valor: A DEFINIR (abra a corrida no painel e informe o valor)\n' end ||
    case when coalesce(new.observacoes, '') <> '' then 'Observações: ' || new.observacoes || E'\n' else '' end ||
    E'\nEntre no painel do gestor para definir o valor e escolher o motorista.\n\n— Manager Transportes (aviso automático)');
  return null;
exception when others then
  return null;
end $$;
