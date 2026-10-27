-- =============================================================================
-- 18 — COMO O CLIENTE SOLICITA CORRIDAS (gestor ou automático) + MAIS NOTIFICAÇÕES
-- -----------------------------------------------------------------------------
-- Cada cliente tem um modo (clientes.modo_solicitacao):
--   'gestor'     (padrão) o pedido chega ao gestor, que escolhe o motorista (ou um motorista
--                aceita da fila, como já era);
--   'automatico' quando O CLIENTE pede, o sistema escolhe sozinho um motorista LIVRE que atenda
--                o serviço: o que está livre há mais tempo (sem corrida em andamento). Se ninguém
--                estiver livre, a corrida fica aguardando e o gestor é avisado; assim que um
--                motorista ficar disponível, ele recebe o pedido mais antigo.
-- Corrida lançada pelo GESTOR nunca é automática.
--
-- Notificações novas: motorista designado, corrida cancelada (motorista é avisado), nova
-- mensagem no chat (para os outros participantes) e "sem motorista livre" (gestor).
-- =============================================================================

alter table public.clientes add column if not exists modo_solicitacao text not null default 'gestor';
alter table public.clientes drop constraint if exists clientes_modo_solicitacao_check;
alter table public.clientes add constraint clientes_modo_solicitacao_check check (modo_solicitacao in ('gestor', 'automatico'));

-- ---------- Atribuir um motorista a uma corrida (mesma regra de "aceitar") ----------
create or replace function privado.atribuir_motorista(p_corrida uuid, p_motorista uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('app.automatico', 'on', true);
  update public.corridas set status = 'aceita', motorista_id = p_motorista where id = p_corrida and status = 'aguardando';
  perform set_config('app.automatico', 'off', true);
end $$;

-- ---------- Pedido novo de cliente "automático": escolhe o motorista livre há mais tempo ----------
create or replace function privado.distribuir_corrida() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_auto boolean;
  v_m    uuid;
begin
  if new.status <> 'aguardando' or new.cliente_id is null then return null; end if;
  if coalesce((select privado.papel_do_usuario()), '') <> 'cliente' then return null; end if;   -- só quando o cliente pede
  select modo_solicitacao = 'automatico' into v_auto from public.clientes where id = new.cliente_id;
  if not coalesce(v_auto, false) then return null; end if;

  select m.id into v_m
    from public.motoristas m
   where m.empresa_id = new.empresa_id and m.status = 'disponivel' and new.servico = any (m.servicos)
     and not exists (select 1 from public.corridas c where c.motorista_id = m.id and c.status in ('aceita', 'em_andamento'))
   order by coalesce((select max(c.concluida_em) from public.corridas c where c.motorista_id = m.id), 'epoch'::timestamptz), m.nome
   limit 1
     for update of m skip locked;

  if v_m is null then
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, 'sem_motorista', 'Sem motorista livre: corrida #' || coalesce(new.codigo::text, ''),
           'Pedido automático aguardando. ' || coalesce(new.trajeto, ''), new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master');
    return null;
  end if;
  perform privado.atribuir_motorista(new.id, v_m);
  return null;
end $$;
revoke all on function privado.atribuir_motorista(uuid, uuid), privado.distribuir_corrida() from public, anon, authenticated;
drop trigger if exists corridas_z_distribuir on public.corridas;
create trigger corridas_z_distribuir after insert on public.corridas
  for each row when (new.fonte = 'app') execute function privado.distribuir_corrida();

-- ---------- Motorista ficou disponível: recebe o pedido automático mais antigo que atende ----------
create or replace function privado.distribuir_pendentes() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_c uuid;
begin
  if new.status <> 'disponivel' or old.status = 'disponivel' then return null; end if;
  if exists (select 1 from public.corridas c where c.motorista_id = new.id and c.status in ('aceita', 'em_andamento')) then return null; end if;
  select c.id into v_c
    from public.corridas c join public.clientes cl on cl.id = c.cliente_id
   where c.empresa_id = new.empresa_id and c.status = 'aguardando' and c.fonte = 'app'
     and cl.modo_solicitacao = 'automatico' and c.servico = any (new.servicos)
   order by c.criada_em limit 1
     for update of c skip locked;
  if v_c is not null then perform privado.atribuir_motorista(v_c, new.id); end if;
  return null;
end $$;
revoke all on function privado.distribuir_pendentes() from public, anon, authenticated;
drop trigger if exists motoristas_distribuir on public.motoristas;
create trigger motoristas_distribuir after update of status on public.motoristas
  for each row execute function privado.distribuir_pendentes();

-- ---------- Mensagem do sistema diz quando foi automático ----------
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
                 case when current_setting('app.automatico', true) = 'on' then ' (atribuída automaticamente)'
                      when coalesce((select privado.sou_gestor()), false) then ' (designado pelo gestor)' else '' end ||
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

-- ---------- Notificações de corrida (agora também avisam o motorista) ----------
create or replace function privado.notificar_corrida() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_titulo   text;
  v_corpo    text := coalesce(new.trajeto, '');
  v_tipo     text;
  v_auto     boolean;
  v_mot_user uuid;
begin
  if tg_op = 'INSERT' and new.status = 'aguardando' then
    v_auto := exists (select 1 from public.clientes c where c.id = new.cliente_id and c.modo_solicitacao = 'automatico')
              and coalesce((select privado.papel_do_usuario()), '') = 'cliente';
    v_tipo := 'nova_corrida'; v_titulo := 'Nova corrida #' || coalesce(new.codigo::text, '');
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master')
    union
    select new.empresa_id, m.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.motoristas m
     where not v_auto and m.empresa_id = new.empresa_id and m.user_id is not null and m.status = 'disponivel'
       and new.servico = any (m.servicos);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
        and new.status in ('aceita', 'em_andamento', 'concluida', 'cancelada') then
    v_tipo := 'corrida_' || case new.status when 'aceita' then 'aceita' when 'em_andamento' then 'iniciada'
                                            when 'concluida' then 'concluida' else 'cancelada' end;
    v_titulo := 'Corrida #' || coalesce(new.codigo::text, '') || ' ' ||
                case new.status when 'aceita' then 'aceita' when 'em_andamento' then 'iniciada'
                                when 'concluida' then 'concluída' else 'cancelada' end;
    select user_id into v_mot_user from public.motoristas where id = new.motorista_id;
    insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
    select new.empresa_id, p.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.perfis p where p.empresa_id = new.empresa_id and p.papel in ('gestor', 'master')
    union
    select new.empresa_id, c.user_id, v_tipo, v_titulo, v_corpo, new.id
      from public.clientes c where c.id = new.cliente_id and c.user_id is not null
    union   -- o motorista é avisado quando OUTRA pessoa mexe na corrida dele (designação, cancelamento)
    select new.empresa_id, v_mot_user, case when new.status = 'aceita' then 'corrida_designada' else v_tipo end,
           case when new.status = 'aceita' then 'Corrida #' || coalesce(new.codigo::text, '') || ' para você' else v_titulo end,
           v_corpo, new.id
     where v_mot_user is not null and new.status in ('aceita', 'cancelada')
       and v_mot_user is distinct from (select auth.uid());
  end if;
  return new;
end $$;

-- ---------- Nova mensagem no chat: avisa os outros participantes ----------
create or replace function privado.notificar_mensagem() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  v_mot_user uuid;
  v_cli_user uuid;
begin
  if new.autor_tipo = 'sistema' then return null; end if;
  select * into c from public.corridas where id = new.corrida_id;
  select user_id into v_mot_user from public.motoristas where id = c.motorista_id;
  select user_id into v_cli_user from public.clientes where id = c.cliente_id;
  insert into public.notificacoes (empresa_id, user_id, tipo, titulo, corpo, corrida_id)
  select c.empresa_id, p.user_id, 'mensagem', 'Mensagem na corrida #' || coalesce(c.codigo::text, ''),
         coalesce(new.autor_nome, '') || ': ' || left(new.texto, 120), c.id
    from public.perfis p where p.empresa_id = c.empresa_id and p.papel in ('gestor', 'master') and new.autor_tipo <> 'gestor'
  union
  select c.empresa_id, v_mot_user, 'mensagem', 'Mensagem na corrida #' || coalesce(c.codigo::text, ''),
         coalesce(new.autor_nome, '') || ': ' || left(new.texto, 120), c.id
   where v_mot_user is not null and new.autor_tipo <> 'motorista'
  union
  select c.empresa_id, v_cli_user, 'mensagem', 'Mensagem na corrida #' || coalesce(c.codigo::text, ''),
         coalesce(new.autor_nome, '') || ': ' || left(new.texto, 120), c.id
   where v_cli_user is not null and new.autor_tipo <> 'cliente';
  return null;
end $$;
revoke all on function privado.notificar_mensagem() from public, anon, authenticated;
drop trigger if exists mensagens_notificar on public.mensagens;
create trigger mensagens_notificar after insert on public.mensagens
  for each row execute function privado.notificar_mensagem();
