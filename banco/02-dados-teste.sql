-- 02-dados-teste.sql — dados de exemplo da Garcia Transportes (sem senhas).
-- Rode DEPOIS de 01-estrutura.sql. Os usuários de login são criados pelo Supabase Auth.

insert into public.empresas (id, nome, sigla) values ('11111111-1111-4111-8111-111111111111', 'Garcia Transportes', 'GT');

insert into public.locais (empresa_id, nome, lat, lng) values
  ('11111111-1111-4111-8111-111111111111', 'Prefeitura de Guaíba (Centro)', -30.1139, -51.3294),
  ('11111111-1111-4111-8111-111111111111', 'Aeroporto Salgado Filho (Porto Alegre)', -29.9953, -51.1664),
  ('11111111-1111-4111-8111-111111111111', 'Praça Gastão Leão (Centro, Guaíba)', -30.1083, -51.3132),
  ('11111111-1111-4111-8111-111111111111', 'Parque Morro José Lutzenberger (Guaíba)', -30.1165, -51.318),
  ('11111111-1111-4111-8111-111111111111', 'Barra Shopping Sul (Porto Alegre)', -30.0852, -51.2444),
  ('11111111-1111-4111-8111-111111111111', 'Mercado Público (Porto Alegre)', -30.0275, -51.2278),
  ('11111111-1111-4111-8111-111111111111', 'Estádio Beira-Rio (Porto Alegre)', -30.0655, -51.2349),
  ('11111111-1111-4111-8111-111111111111', 'Rodoviária de Porto Alegre', -30.0227, -51.219),
  ('11111111-1111-4111-8111-111111111111', 'Pátio da Empresa (Distrito Industrial, Guaíba)', -30.1358, -51.3546),
  ('11111111-1111-4111-8111-111111111111', 'Oficina Parceira (Colina, Guaíba)', -30.1209, -51.3378),
  ('11111111-1111-4111-8111-111111111111', 'Concessionária (BR-116, Guaíba)', -30.1717, -51.3889),
  ('11111111-1111-4111-8111-111111111111', 'Centro Logístico (Santa Rita, Guaíba)', -30.0916, -51.3282);

insert into public.motoristas (empresa_id, nome, telefone, avaliacao, servicos, status, veiculo, rota_livre) values
  ('11111111-1111-4111-8111-111111111111', 'Carlos Souza', '(11) 98888-0001', 4.9, '{carro,utilitario}', 'disponivel', '{"modelo":"Toyota Corolla","placa":"BRA-2E19","cor":"Prata"}'::jsonb, '[{"lat":-30.1139,"lng":-51.3294},{"lat":-30.1083,"lng":-51.3132},{"lat":-30.1165,"lng":-51.318},{"lat":-30.1209,"lng":-51.3378}]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'Ana Lima', '(11) 98888-0002', 4.8, '{carro}', 'disponivel', '{"modelo":"Honda City","placa":"QWE-4A21","cor":"Preto"}'::jsonb, '[{"lat":-30.1083,"lng":-51.3132},{"lat":-30.1097,"lng":-51.3165},{"lat":-30.1165,"lng":-51.318},{"lat":-30.1129,"lng":-51.3312}]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'João Pereira', '(11) 98888-0003', 4.7, '{guincho}', 'disponivel', '{"modelo":"VW Delivery Plataforma","placa":"GUI-9C88","cor":"Branco"}'::jsonb, '[{"lat":-30.1358,"lng":-51.3546},{"lat":-30.1209,"lng":-51.3378},{"lat":-30.117,"lng":-51.3375},{"lat":-30.1139,"lng":-51.3294}]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'Mariana Costa', '(11) 98888-0004', 5, '{carro,utilitario}', 'disponivel', '{"modelo":"Fiat Fiorino","placa":"FIO-1B23","cor":"Branco"}'::jsonb, '[{"lat":-30.0916,"lng":-51.3282},{"lat":-30.1083,"lng":-51.3132},{"lat":-30.1139,"lng":-51.3294},{"lat":-30.1097,"lng":-51.3165}]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'Roberto Alves', '(11) 98888-0005', 4.6, '{guincho}', 'disponivel', '{"modelo":"Ford Cargo Plataforma","placa":"PLT-7D45","cor":"Azul"}'::jsonb, '[{"lat":-30.1717,"lng":-51.3889},{"lat":-30.1358,"lng":-51.3546},{"lat":-30.1209,"lng":-51.3378},{"lat":-30.15,"lng":-51.37}]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'Fernanda Rocha', '(11) 98888-0006', 4.9, '{carro}', 'offline', '{"modelo":"Hyundai HB20","placa":"HBX-3F67","cor":"Vermelho"}'::jsonb, '[{"lat":-30.1209,"lng":-51.3378},{"lat":-30.117,"lng":-51.3375},{"lat":-30.1139,"lng":-51.3294},{"lat":-30.1129,"lng":-51.3312}]'::jsonb);

insert into public.clientes (empresa_id, nome, empresa_nome, cnpj, telefone, email, endereco, observacoes, ativo) values
  ('11111111-1111-4111-8111-111111111111', 'Paula Mendes', 'Mendes Consultoria', '11.222.333/0001-81', '(51) 97777-0001', 'paula@mendesconsultoria.com.br', 'Av. Iguaçu, 120 — Guaíba/RS', null, true),
  ('11111111-1111-4111-8111-111111111111', 'Ricardo Nunes', 'Auto Center Nunes', null, '(51) 97777-0002', 'ricardo@autocenternunes.com.br', 'BR-116, km 310 — Guaíba/RS', 'Pagamento quinzenal.', true),
  ('11111111-1111-4111-8111-111111111111', 'Juliana Torres', null, null, '(51) 97777-0003', null, null, null, true);

insert into public.tarifas (empresa_id, dados) values ('11111111-1111-4111-8111-111111111111', '{"modoPadrao":"variavel","servicos":{"carro":{"base":6,"porKm":2.4,"porMinuto":0.35,"minimo":12},"utilitario":{"base":15,"porKm":3.8,"porMinuto":0.5,"minimo":35},"guincho":{"base":90,"porKm":6.5,"porMinuto":0.8,"minimo":150}},"ocasioes":{"pico":{"rotulo":"Horário de pico","multiplicador":1.3},"noturno":{"rotulo":"Noturno (22h–6h)","multiplicador":1.2},"chuva":{"rotulo":"Chuva","multiplicador":1.15},"feriado":{"rotulo":"Feriado / fim de semana","multiplicador":1.25},"urgente":{"rotulo":"Urgente (prioridade)","multiplicador":1.5}},"tabelaFixa":[{"id":"tf1","origemId":"l1","destinoId":"l2","servico":"carro","valor":85},{"id":"tf2","origemId":"l9","destinoId":"l10","servico":"guincho","valor":160},{"id":"tf3","origemId":"l9","destinoId":"l11","servico":"guincho","valor":190},{"id":"tf4","origemId":"l3","destinoId":"l8","servico":"utilitario","valor":90}]}'::jsonb);

-- Os valores fixos referenciam os locais pelo identificador de teste (l1, l2...).
-- Aqui trocamos esses códigos pelos ids reais dos locais (ligando pelo nome).
with mapa(cod, nome) as (values
  ('l1', 'Prefeitura de Guaíba (Centro)'),
  ('l2', 'Aeroporto Salgado Filho (Porto Alegre)'),
  ('l3', 'Praça Gastão Leão (Centro, Guaíba)'),
  ('l4', 'Parque Morro José Lutzenberger (Guaíba)'),
  ('l5', 'Barra Shopping Sul (Porto Alegre)'),
  ('l6', 'Mercado Público (Porto Alegre)'),
  ('l7', 'Estádio Beira-Rio (Porto Alegre)'),
  ('l8', 'Rodoviária de Porto Alegre'),
  ('l9', 'Pátio da Empresa (Distrito Industrial, Guaíba)'),
  ('l10', 'Oficina Parceira (Colina, Guaíba)'),
  ('l11', 'Concessionária (BR-116, Guaíba)'),
  ('l12', 'Centro Logístico (Santa Rita, Guaíba)')
),
fixa as (
  select jsonb_agg(jsonb_build_object(
    'id', f->>'id', 'valor', f->'valor', 'servico', f->>'servico',
    'origemId',  (select l.id from public.locais l join mapa m on m.nome = l.nome where m.cod = f->>'origemId'),
    'destinoId', (select l.id from public.locais l join mapa m on m.nome = l.nome where m.cod = f->>'destinoId')
  )) as tabela
  from public.tarifas t, jsonb_array_elements(t.dados->'tabelaFixa') f
  where t.dados->'tabelaFixa'->0->>'origemId' ~ '^l[0-9]+$'
)
update public.tarifas set dados = jsonb_set(dados, '{tabelaFixa}', (select tabela from fixa))
 where dados->'tabelaFixa'->0->>'origemId' ~ '^l[0-9]+$';
