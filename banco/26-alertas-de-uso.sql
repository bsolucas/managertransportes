-- =============================================================================
-- 26 — ALERTA POR E-MAIL QUANDO O USO PASSA DE 80% (e de 95%) DO PLANO GRATUITO
-- -----------------------------------------------------------------------------
-- De hora em hora (pg_cron, minuto 05) o banco confere os mesmos números da aba "Uso e limites"
-- do painel do dono e manda UM e-mail quando algum passa de 80% e outro quando passa de 95%:
--   banco do Supabase (500 MB) · usuários ativos 30 dias (50 mil) · Google Maps 30 dias (10 mil)
--   e-mails de hoje (100) · push de hoje (20 mil)
-- Cada aviso é enviado uma vez por período: banco/usuários/Google Maps uma vez por mês;
-- e-mails e push uma vez por dia. O e-mail vai para o endereço do dono (tabela donos) ou, se você
-- preferir outro, grave em privado.parametros: chave 'alerta_email'.
-- O envio usa o mesmo caminho dos avisos (privado.enviar_email: Apps Script ou Resend).
--
-- Mudar os limites ou os percentuais: edite a função abaixo e rode o arquivo de novo.
-- Desligar:  select cron.unschedule('alertas-de-uso');
-- COMO APLICAR: cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================

create extension if not exists pg_cron;

create table if not exists privado.alertas_enviados (
  chave      text        not null,
  periodo    text        not null,
  enviado_em timestamptz not null default now(),
  primary key (chave, periodo)
);
alter table privado.alertas_enviados enable row level security;   -- sem regras: só o banco mexe

insert into privado.parametros (chave, valor) values ('alerta_email', '') on conflict (chave) do nothing;

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
      ('email',    'E-mails enviados hoje',          coalesce((select qtd from privado.uso_diario where tipo = 'email' and dia = v_hoje), 0)::numeric, 100::numeric, 'dia', 'n',
        'O limite do Gmail do script é geral. Migre para domínio próprio + Resend.'),
      ('push',     'Push enviados hoje',             coalesce((select qtd from privado.uso_diario where tipo = 'push' and dia = v_hoje), 0)::numeric, 20000::numeric, 'dia', 'n',
        'Troque o envio do Apps Script por uma Edge Function do Supabase.')
    ) as t(id, nome, usado, limite, per, formato, dica)
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
revoke all on function privado.checar_alertas_uso() from public, anon, authenticated;

-- A cada hora, no minuto 05. Recriar o agendamento é seguro (substitui o anterior).
select cron.schedule('alertas-de-uso', '5 * * * *', $$select privado.checar_alertas_uso()$$);
