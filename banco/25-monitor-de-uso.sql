-- =============================================================================
-- 25 — MONITOR DE USO E LIMITES (painel do dono, aba "Uso e limites")
-- -----------------------------------------------------------------------------
-- Guarda contadores por dia (privado.uso_diario) e entrega o resumo ao dono (public.dono_uso):
--   • tamanho do banco do Supabase (limite gratuito: 500 MB) e as tabelas que mais pesam;
--   • por dia: carregamentos do Google Maps, e-mails, pushes, logins (contadores abaixo)
--     e também corridas, notificações, mensagens e cadastros novos (contados direto das tabelas);
--   • usuários ativos no mês.
-- Os contadores de e-mail/push/Google Maps/logins começam a contar a partir de quando este arquivo
-- é aplicado (não existe histórico anterior). O dia é o de Brasília.
-- A contagem do Google Maps é uma ESTIMATIVA (cada mapa aberto no painel do gestor); o número
-- oficial está no Google Cloud Console.
--
-- COMO APLICAR: cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================

create table if not exists privado.uso_diario (
  dia  date   not null,
  tipo text   not null,
  qtd  bigint not null default 0,
  primary key (dia, tipo)
);
alter table privado.uso_diario enable row level security;   -- sem regras: só funções do banco mexem

-- Soma ao contador do dia (nunca derruba quem chamou).
create or replace function privado.contar_uso(p_tipo text, p_qtd integer default 1) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into privado.uso_diario (dia, tipo, qtd)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_tipo, greatest(p_qtd, 0))
  on conflict (dia, tipo) do update set qtd = privado.uso_diario.qtd + greatest(p_qtd, 0);
exception when others then
  return;
end $$;
revoke all on function privado.contar_uso(text, integer) from public, anon, authenticated;

-- O app avisa (logado) que abriu um mapa do Google ou fez login. Só estes dois tipos são aceitos.
create or replace function public.registrar_uso(p_tipo text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return; end if;
  if p_tipo not in ('google_maps', 'login') then return; end if;
  perform privado.contar_uso(p_tipo, 1);
end $$;
revoke all on function public.registrar_uso(text) from public, anon;
grant execute on function public.registrar_uso(text) to authenticated;

-- ---------- E-mail: passa a contar cada envio ----------
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
    perform privado.contar_uso('email', 1);
  elsif v_prov = 'apps_script' and v_url <> '' then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('segredo', v_chave, 'para', p_para, 'assunto', p_assunto, 'texto', p_texto),
      timeout_milliseconds := 8000);
    perform privado.contar_uso('email', 1);
  end if;
exception when others then
  return;
end $$;
revoke all on function privado.enviar_email(text, text, text) from public, anon, authenticated;

-- ---------- Push: passa a contar cada aparelho avisado e cada chamada ao Apps Script ----------
create or replace function privado.enviar_push() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text := coalesce((select valor from privado.parametros where chave = 'email_url'), '');
  v_chave  text := coalesce((select valor from privado.parametros where chave = 'email_chave'), '');
  v_tokens jsonb;
begin
  if v_url = '' or v_chave = '' then return null; end if;
  select coalesce(jsonb_agg(d.push_token), '[]'::jsonb) into v_tokens
    from public.dispositivos d where d.user_id = new.user_id and d.ativo;
  if jsonb_array_length(v_tokens) = 0 then return null; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('segredo', v_chave, 'acao', 'push', 'tokens', v_tokens,
                               'titulo', new.titulo, 'corpo', coalesce(new.corpo, ''),
                               'corrida', coalesce(new.corrida_id::text, ''), 'id', new.id::text),
    timeout_milliseconds := 8000);
  perform privado.contar_uso('push', jsonb_array_length(v_tokens));
  perform privado.contar_uso('push_chamadas', 1);
  return null;
exception when others then
  return null;
end $$;
revoke all on function privado.enviar_push() from public, anon, authenticated;

-- ---------- Resumo para o dono ----------
create or replace function public.dono_uso(p_dias integer default 30) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias  integer := least(greatest(coalesce(p_dias, 30), 7), 90);
  v_total bigint := pg_database_size(current_database());
  v_pub   bigint;
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  select coalesce(sum(pg_total_relation_size(c.oid)), 0) into v_pub
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r';
  return jsonb_build_object(
    'banco', jsonb_build_object(
      'bytes', v_total,
      'bytes_app', v_pub,
      'limite', 524288000,
      'tabelas', coalesce((select jsonb_agg(jsonb_build_object('nome', t.nome, 'bytes', t.bytes) order by t.bytes desc)
                             from (select c.relname as nome, pg_total_relation_size(c.oid) as bytes
                                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                    where n.nspname = 'public' and c.relkind = 'r'
                                    order by 2 desc limit 8) t), '[]'::jsonb)),
    'usuarios', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'ativos_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'limite', 50000),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'google_maps',   coalesce((select qtd from privado.uso_diario u where u.dia = d.dia and u.tipo = 'google_maps'), 0),
        'login',         coalesce((select qtd from privado.uso_diario u where u.dia = d.dia and u.tipo = 'login'), 0),
        'email',         coalesce((select qtd from privado.uso_diario u where u.dia = d.dia and u.tipo = 'email'), 0),
        'push',          coalesce((select qtd from privado.uso_diario u where u.dia = d.dia and u.tipo = 'push'), 0),
        'push_chamadas', coalesce((select qtd from privado.uso_diario u where u.dia = d.dia and u.tipo = 'push_chamadas'), 0),
        'corridas',      (select count(*) from public.corridas c where (c.criada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'notificacoes',  (select count(*) from public.notificacoes n where (n.criada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'mensagens',     (select count(*) from public.mensagens m where (m.criada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'cadastros',     (select count(*) from auth.users a where (a.created_at at time zone 'America/Sao_Paulo')::date = d.dia)
      ) order by d.dia)
      from (select (v_hoje - g)::date as dia from generate_series(0, v_dias - 1) g) d), '[]'::jsonb),
    'desde', (select min(dia) from privado.uso_diario)
  );
end $$;
revoke all on function public.dono_uso(integer) from public, anon;
grant execute on function public.dono_uso(integer) to authenticated;
