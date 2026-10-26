-- =============================================================================
-- 07 — CORRIDAS E CHAT NO SUPABASE (regras do ciclo de vida no banco)
-- -----------------------------------------------------------------------------
-- A corrida agora é escolhida por TRAJETO (lista livre em Valores) + endereço de
-- embarque em texto. As regras abaixo ficam no BANCO, para valerem igual no painel,
-- no celular do motorista e no portal do cliente, e não dá para burlar:
--   • situação só muda em ordem: aguardando → aceita → em_andamento → concluída;
--     cancelar vale até concluir. Cada mudança grava hora e histórico;
--   • motorista/cliente só mudam a situação (não mexem em valor, trajeto...);
--   • ao aceitar, o motorista passa a "em_corrida"; ao concluir/cancelar volta a
--     "disponivel" (se não tiver outra corrida);
--   • o chat só libera depois que o motorista aceita (até 1 h após concluir); quem
--     escreve, o nome e o papel vêm do login (não dá para se passar por outro);
--   • mensagens automáticas do sistema (solicitada, aceita, iniciada...).
-- =============================================================================

alter table public.corridas
  add column if not exists trajeto            text,          -- nome do trajeto escolhido (ex.: Guaíba x POA Zona Sul)
  add column if not exists embarque           text,          -- endereço/ponto de embarque, texto livre
  add column if not exists cliente_nome       text,          -- foto do cliente na hora do pedido
  add column if not exists cliente_telefone   text,
  add column if not exists motivo_cancelamento text,
  add column if not exists valor_editado_em   timestamptz;
alter table public.mensagens add column if not exists autor_id uuid;   -- gestor: usuário | motorista/cliente: id do cadastro

-- ---------- Antes de gravar a corrida ----------
create or replace function privado.corrida_antes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_gestor boolean := coalesce((select privado.sou_gestor()), false);
  v_agora  bigint  := (extract(epoch from now()) * 1000)::bigint;
  v_cli    record;
begin
  if tg_op = 'INSERT' then
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
    -- motorista e cliente só mexem na situação (e o motorista em si, ao aceitar)
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

-- ---------- Depois de gravar: mensagens do sistema e situação do motorista ----------
create or replace function privado.corrida_depois() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_mot   record;
  v_texto text;
  v_total numeric;
begin
  if tg_op = 'INSERT' then
    v_texto := 'Corrida #' || new.codigo || ' solicitada. Aguardando um motorista aceitar.';
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

drop trigger if exists corridas_antes on public.corridas;
create trigger corridas_antes before insert or update on public.corridas
  for each row when (new.fonte = 'app') execute function privado.corrida_antes();
drop trigger if exists corridas_depois on public.corridas;
create trigger corridas_depois after insert or update on public.corridas
  for each row when (new.fonte = 'app') execute function privado.corrida_depois();

-- ---------- Mensagens: autor, papel e chat liberado vêm do banco ----------
create or replace function privado.mensagem_antes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_c     record;
  v_papel text;
begin
  select empresa_id, status, concluida_em into v_c from public.corridas where id = new.corrida_id;
  if not found then raise exception 'Corrida não encontrada.'; end if;
  new.empresa_id := v_c.empresa_id;

  if current_setting('app.sistema', true) = 'on' then      -- mensagem automática do próprio banco
    new.autor_tipo := 'sistema';
    return new;
  end if;

  new.texto := btrim(coalesce(new.texto, ''));
  if new.texto = '' or length(new.texto) > 500 then raise exception 'Escreva uma mensagem de até 500 caracteres.'; end if;
  if not (v_c.status in ('aceita', 'em_andamento')
          or (v_c.status = 'concluida' and v_c.concluida_em > now() - interval '1 hour')) then
    raise exception 'O chat só fica liberado depois que um motorista aceita a corrida.';
  end if;

  v_papel := (select privado.papel_do_usuario());
  if v_papel in ('gestor', 'master') then
    new.autor_tipo := 'gestor';
    new.autor_id := (select auth.uid());
    new.autor_nome := (select nome from public.perfis where user_id = (select auth.uid()));
  elsif v_papel = 'motorista' then
    new.autor_tipo := 'motorista';
    new.autor_id := (select privado.meu_motorista_id());
    new.autor_nome := (select nome from public.motoristas where id = new.autor_id);
  elsif v_papel = 'cliente' then
    new.autor_tipo := 'cliente';
    new.autor_id := (select privado.meu_cliente_id());
    new.autor_nome := (select nome from public.clientes where id = new.autor_id);
  else
    raise exception 'Sem permissão para enviar mensagens.';
  end if;
  return new;
end $$;

drop trigger if exists mensagens_antes on public.mensagens;
create trigger mensagens_antes before insert on public.mensagens
  for each row execute function privado.mensagem_antes();

revoke all on function privado.corrida_antes(), privado.corrida_depois(), privado.mensagem_antes() from public, anon, authenticated;

-- ---------- Notificações passam a usar o nome do trajeto ----------
create or replace function privado.notificar_corrida() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_titulo text;
  v_corpo  text;
  v_tipo   text;
begin
  v_corpo := coalesce(nullif(new.trajeto, ''), coalesce(new.origem ->> 'nome', '') || ' → ' || coalesce(new.destino ->> 'nome', ''));
  if tg_op = 'INSERT' and new.status = 'aguardando' then
    v_tipo := 'nova_corrida'; v_titulo := 'Nova corrida #' || coalesce(new.codigo::text, '');
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
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master')
    union
    select new.empresa_id, c.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.clientes c where c.id = new.cliente_id and c.user_id is not null;
  end if;
  return new;
end $$;
