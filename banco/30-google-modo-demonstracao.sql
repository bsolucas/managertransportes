-- =============================================================================
-- 30 — GOOGLE EM MODO DEMONSTRAÇÃO (sem cartão) x COM COBRANÇA
-- -----------------------------------------------------------------------------
-- Hoje o app usa a "Chave de Demonstração" do Google Maps (sem cartão, só para testes, com limite
-- diário que o Google não publica e sem risco de cobrança). Quando o dono ligar o cartão, ele troca
-- o modo no painel (aba "Uso e limites"), sem mexer em código:
--   privado.parametros 'google_modo' = 'demonstracao' (padrão) ou 'faturamento';
--   dono_uso devolve 'google_modo' para o painel;
--   public.dono_google_modo(modo) troca o modo (só o dono);
--   no modo 'demonstracao' os alertas de 80%/95% de Google Maps e de sugestões de endereço NÃO são
--   enviados (o limite grátis de referência só vale com a conta de cobrança).
-- =============================================================================
insert into privado.parametros (chave, valor) values ('google_modo', 'demonstracao') on conflict (chave) do nothing;

create or replace function public.dono_google_modo(p_modo text) returns text
  language plpgsql security definer set search_path = ''
as $$
begin
  if not (select privado.sou_dono()) then raise exception 'Acesso negado.'; end if;
  if p_modo not in ('demonstracao', 'faturamento') then raise exception 'Modo inválido.'; end if;
  insert into privado.parametros (chave, valor) values ('google_modo', p_modo)
    on conflict (chave) do update set valor = excluded.valor;
  return p_modo;
end $$;
revoke all on function public.dono_google_modo(text) from public, anon;
grant execute on function public.dono_google_modo(text) to authenticated;

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
        'places',        coalesce((select qtd from privado.uso_diario u where u.dia = d.dia and u.tipo = 'places'), 0),
        'corridas',      (select count(*) from public.corridas c where (c.criada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'notificacoes',  (select count(*) from public.notificacoes n where (n.criada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'mensagens',     (select count(*) from public.mensagens m where (m.criada_em at time zone 'America/Sao_Paulo')::date = d.dia),
        'cadastros',     (select count(*) from auth.users a where (a.created_at at time zone 'America/Sao_Paulo')::date = d.dia)
      ) order by d.dia)
      from (select (v_hoje - g)::date as dia from generate_series(0, v_dias - 1) g) d), '[]'::jsonb),
    'desde', (select min(dia) from privado.uso_diario),
    'google_modo', coalesce((select valor from privado.parametros where chave = 'google_modo'), 'demonstracao')
  );
end $$;

create or replace function privado.checar_alertas_uso() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes     text := to_char(v_hoje, 'YYYY-MM');
  v_para    text := coalesce(nullif((select valor from privado.parametros where chave = 'alerta_email'), ''),
                             (select u.email from public.donos d join auth.users u on u.id = d.user_id order by d.criado_em limit 1));
  v_linhas  text := '';
  v_novos   integer := 0;
  m         record;
  nivel     integer;
  v_periodo text;
  v_chave   text;
  v_pct     numeric;
  v_google_fat boolean := coalesce((select valor from privado.parametros where chave = 'google_modo'), 'demonstracao') = 'faturamento';
begin
  if coalesce(v_para, '') = '' then return 0; end if;
  for m in
    select * from (values
      ('banco',    'Banco de dados do Supabase',     pg_database_size(current_database())::numeric, 524288000::numeric, 'mes', 'bytes',
        'Vale pensar no plano Pro do Supabase (US$ 25/mês, 8 GB).'),
      ('usuarios', 'Usuários ativos (30 dias)',      (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')::numeric, 50000::numeric, 'mes', 'n',
        'Perto do limite de usuários ativos do plano gratuito do Supabase.'),
      ('mapas',    'Google Maps (30 dias)',          coalesce((select sum(qtd) from privado.uso_diario where tipo = 'google_maps' and dia > v_hoje - 30), 0)::numeric, 10000::numeric, 'mes', 'n',
        'Depois de 10 mil carregamentos o Google cobra cerca de US$ 7 por 1.000 (confira o número oficial no Google Cloud).'),
      ('places',   'Sugestões de endereço do Google (30 dias)', coalesce((select sum(qtd) from privado.uso_diario where tipo = 'places' and dia > v_hoje - 30), 0)::numeric, 10000::numeric, 'mes', 'n',
        'Passando da cota gratuita da Places API o Google cobra por busca (confira o valor atual no Google Cloud). Dá para aumentar o mínimo de letras ou desligar as sugestões.'),
      ('email',    'E-mails enviados hoje',          coalesce((select qtd from privado.uso_diario where tipo = 'email' and dia = v_hoje), 0)::numeric, 100::numeric, 'dia', 'n',
        'O limite do Gmail do script é geral. Migre para domínio próprio + Resend.'),
      ('push',     'Push enviados hoje',             coalesce((select qtd from privado.uso_diario where tipo = 'push' and dia = v_hoje), 0)::numeric, 20000::numeric, 'dia', 'n',
        'Troque o envio do Apps Script por uma Edge Function do Supabase.')
    ) as t(id, nome, usado, limite, per, formato, dica)
   where v_google_fat or t.id not in ('mapas', 'places')   -- na chave de demonstração do Google não há limite conhecido nem custo
  loop
    v_pct := m.usado / m.limite * 100;
    v_periodo := case when m.per = 'mes' then v_mes else v_hoje::text end;
    nivel := case when v_pct >= 95 then 95 when v_pct >= 80 then 80 else 0 end;
    if nivel = 0 then continue; end if;
    -- quem já recebeu o aviso de 95% não precisa do de 80% no mesmo período
    v_chave := m.id || '_' || nivel;
    if exists (select 1 from privado.alertas_enviados where chave in (m.id || '_80', m.id || '_95') and periodo = v_periodo and (nivel = 80 or chave = v_chave)) then
      continue;
    end if;
    insert into privado.alertas_enviados (chave, periodo) values (v_chave, v_periodo) on conflict do nothing;
    v_novos := v_novos + 1;
    v_linhas := v_linhas || '• ' || m.nome || ': ' || round(v_pct)::text || '% do limite gratuito ('
      || case when m.formato = 'bytes' then round(m.usado / 1048576)::text || ' MB de ' || round(m.limite / 1048576)::text || ' MB'
              else replace(to_char(m.usado, 'FM999G999G990'), ',', '.') || ' de ' || replace(to_char(m.limite, 'FM999G999G990'), ',', '.') end
      || E')\n   ' || m.dica || E'\n\n';
  end loop;
  if v_novos = 0 then return 0; end if;
  perform privado.enviar_email(v_para, 'Alerta de uso: Manager Transportes passou de 80% de um limite',
    E'Alguns serviços gratuitos do Manager Transportes estão perto do limite:\n\n' || v_linhas ||
    E'Veja os números no painel do dono (aba "Uso e limites").\n\n— Manager Transportes (aviso automático)');
  return v_novos;
exception when others then
  return 0;
end $$;
