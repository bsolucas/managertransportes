-- =============================================================================
-- 21 — AVISO POR E-MAIL PARA O GESTOR (cópia da notificação)
-- -----------------------------------------------------------------------------
-- Quando um CLIENTE pede uma corrida, o banco manda um e-mail para o endereço que o gestor
-- da empresa cadastrou (empresas.email_avisos). Funciona com o app fechado.
--
-- O remetente é UM só para o sistema inteiro (configurado por você, dono do sistema, na tabela
-- privada privado.parametros — nenhum usuário consegue ler). A empresa só informa o e-mail dela.
--
-- Dois jeitos de enviar (escolha em privado.parametros, chave 'email_provedor'):
--   'resend'       -> API do Resend. Precisa de 'email_chave' (começa com re_).
--                     Sem domínio verificado, só entrega no e-mail da conta do Resend.
--   'apps_script'  -> um script do Google (Gmail) seu. Precisa de 'email_url' (endereço do
--                     aplicativo da web) e 'email_chave' (senha secreta que o script confere).
-- Enquanto 'email_provedor' estiver vazio, nada é enviado (e nada quebra).
--
-- Para ligar (exemplo Resend), no SQL Editor:
--   update privado.parametros set valor = 'resend'    where chave = 'email_provedor';
--   update privado.parametros set valor = 're_xxxxxxxx' where chave = 'email_chave';
-- =============================================================================

create extension if not exists pg_net;

alter table public.empresas add column if not exists email_avisos text;
alter table public.empresas drop constraint if exists empresas_email_avisos_check;
alter table public.empresas add constraint empresas_email_avisos_check
  check (email_avisos is null or (length(email_avisos) <= 200 and email_avisos ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
grant update (email_avisos) on public.empresas to authenticated;   -- a regra "só o gestor edita" já vale (banco/16)

-- ---------- Configuração do remetente (privada) ----------
insert into privado.parametros (chave, valor) values
  ('email_provedor', ''),
  ('email_chave', ''),
  ('email_url', ''),
  ('email_remetente', 'Manager Transportes <onboarding@resend.dev>')
on conflict (chave) do nothing;

-- ---------- Envio (nunca derruba quem chamou) ----------
create or replace function privado.enviar_email(p_para text, p_assunto text, p_texto text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_prov  text := coalesce((select valor from privado.parametros where chave = 'email_provedor'), '');
  v_chave text := coalesce((select valor from privado.parametros where chave = 'email_chave'), '');
  v_url   text := coalesce((select valor from privado.parametros where chave = 'email_url'), '');
  v_de    text := coalesce((select valor from privado.parametros where chave = 'email_remetente'), '');
begin
  if coalesce(p_para, '') = '' or v_prov = '' or v_chave = '' then return; end if;
  if v_prov = 'resend' then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
      body := jsonb_build_object('from', v_de, 'to', jsonb_build_array(p_para), 'subject', p_assunto, 'text', p_texto),
      timeout_milliseconds := 8000);
  elsif v_prov = 'apps_script' and v_url <> '' then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('segredo', v_chave, 'para', p_para, 'assunto', p_assunto, 'texto', p_texto),
      timeout_milliseconds := 8000);
  end if;
exception when others then
  return;   -- aviso por e-mail é um extra: se falhar, a corrida segue normalmente
end $$;
revoke all on function privado.enviar_email(text, text, text) from public, anon, authenticated;

-- ---------- Cliente pediu corrida -> e-mail para o gestor ----------
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
    'Trajeto: ' || coalesce(new.trajeto, '-') || E'\n' ||
    'Embarque: ' || coalesce(nullif(new.embarque, ''), '-') || E'\n' ||
    'Destino: ' || coalesce(nullif(new.destino_endereco, ''), '-') || E'\n' ||
    'Valor: R$ ' || replace(to_char(new.valor, 'FM9999999990.00'), '.', ',') || E'\n' ||
    case when coalesce(new.observacoes, '') <> '' then 'Observações: ' || new.observacoes || E'\n' else '' end ||
    E'\nEntre no painel do gestor para escolher o motorista.\n\n— Manager Transportes (aviso automático)');
  return null;
exception when others then
  return null;
end $$;
revoke all on function privado.avisar_email_corrida() from public, anon, authenticated;
drop trigger if exists corridas_z_email on public.corridas;
create trigger corridas_z_email after insert on public.corridas
  for each row when (new.fonte = 'app') execute function privado.avisar_email_corrida();

-- ---------- Botão "Enviar e-mail de teste" (só o gestor, só para o e-mail da própria empresa) ----------
create or replace function public.enviar_email_teste() returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_para text;
begin
  if not (select privado.sou_gestor()) then raise exception 'Apenas o gestor pode testar o aviso por e-mail.'; end if;
  select email_avisos into v_para from public.empresas where id = (select privado.empresa_do_usuario());
  if coalesce(v_para, '') = '' then raise exception 'Cadastre primeiro o e-mail para avisos.'; end if;
  if coalesce((select valor from privado.parametros where chave = 'email_provedor'), '') = '' then
    raise exception 'O envio de e-mail ainda não foi ligado pelo administrador do sistema.';
  end if;
  perform privado.enviar_email(v_para, 'Teste de aviso - Manager Transportes',
    E'Este é um e-mail de teste. Se você recebeu, os avisos de novas corridas vão chegar aqui.\n\n— Manager Transportes');
  return v_para;
end $$;
revoke all on function public.enviar_email_teste() from public, anon;
grant execute on function public.enviar_email_teste() to authenticated;
