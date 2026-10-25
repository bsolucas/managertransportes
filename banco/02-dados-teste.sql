-- 02-dados-teste.sql — empresa inicial: Garcia Transportes (cidade: Guaíba/RS), sem senhas.
-- Rode DEPOIS de 01-estrutura.sql. Os usuários de login são criados pelo Supabase Auth
-- e ligados à empresa na tabela perfis.
-- Só há locais de Guaíba. Motoristas e clientes começam vazios (cadastre pelo painel).

insert into public.empresas (id, nome, sigla, cidade, uf) values ('11111111-1111-4111-8111-111111111111', 'Garcia Transportes', 'GT', 'Guaíba', 'RS');

insert into public.locais (empresa_id, nome, lat, lng) values
  ('11111111-1111-4111-8111-111111111111', 'Prefeitura de Guaíba (Centro)', -30.1139, -51.3294),
  ('11111111-1111-4111-8111-111111111111', 'Praça Gastão Leão (Centro, Guaíba)', -30.1083, -51.3132),
  ('11111111-1111-4111-8111-111111111111', 'Parque Morro José Lutzenberger (Guaíba)', -30.1165, -51.318),
  ('11111111-1111-4111-8111-111111111111', 'Pátio da Empresa (Distrito Industrial, Guaíba)', -30.1358, -51.3546),
  ('11111111-1111-4111-8111-111111111111', 'Oficina Parceira (Colina, Guaíba)', -30.1209, -51.3378),
  ('11111111-1111-4111-8111-111111111111', 'Concessionária (BR-116, Guaíba)', -30.1717, -51.3889),
  ('11111111-1111-4111-8111-111111111111', 'Centro Logístico (Santa Rita, Guaíba)', -30.0916, -51.3282);

-- Regras de preço padrão; a tabela de valores fixos começa vazia.
insert into public.tarifas (empresa_id, dados) values ('11111111-1111-4111-8111-111111111111', '{"modoPadrao":"variavel","servicos":{"carro":{"base":6,"porKm":2.4,"porMinuto":0.35,"minimo":12},"utilitario":{"base":15,"porKm":3.8,"porMinuto":0.5,"minimo":35},"guincho":{"base":90,"porKm":6.5,"porMinuto":0.8,"minimo":150}},"ocasioes":{"pico":{"rotulo":"Horário de pico","multiplicador":1.3},"noturno":{"rotulo":"Noturno (22h–6h)","multiplicador":1.2},"chuva":{"rotulo":"Chuva","multiplicador":1.15},"feriado":{"rotulo":"Feriado / fim de semana","multiplicador":1.25},"urgente":{"rotulo":"Urgente (prioridade)","multiplicador":1.5}},"tabelaFixa":[]}'::jsonb);
