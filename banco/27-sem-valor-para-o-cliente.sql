-- =============================================================================
-- 27 — O CLIENTE NÃO VÊ O VALOR (por enquanto)
-- -----------------------------------------------------------------------------
-- A mensagem automática do chat, quando a corrida termina, trazia "Total: R$ ...",
-- e o chat é visto também pelo cliente. Agora diz só "Corrida concluída."
-- (o gestor continua vendo o valor nos detalhes da corrida).
-- As mensagens antigas desse tipo também são trocadas.
-- =============================================================================
create or replace function privado.corrida_depois() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_mot   record;
  v_texto text;
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
      v_texto := 'Corrida concluída.';
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

-- mensagens antigas do sistema: tira o total
select set_config('app.sistema', 'on', true);
update public.mensagens set texto = 'Corrida concluída.'
 where autor_tipo = 'sistema' and texto like 'Corrida concluída. Total:%';
