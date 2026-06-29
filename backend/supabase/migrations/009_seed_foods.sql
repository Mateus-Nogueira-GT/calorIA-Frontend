-- ============================================================
-- Migration 009 — Seed de alimentos (subconjunto TACO/USDA)
-- Alimentos PT-BR essenciais para a busca/registro de refeições.
-- Valores por 100 g (ou 100 ml). Import completo do dataset = follow-up.
-- ============================================================

-- Idempotência: índice único por nome para permitir ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS foods_name_unique ON public.foods (name);

INSERT INTO public.foods (name, category, source, calories, protein_g, carbs_g, fat_g) VALUES
  ('Arroz branco cozido',            'Cereais',      'TACO', 128, 2.5,  28.1, 0.2),
  ('Arroz integral cozido',          'Cereais',      'TACO', 124, 2.6,  25.8, 1.0),
  ('Feijão carioca cozido',          'Leguminosas',  'TACO', 76,  4.8,  13.6, 0.5),
  ('Feijão preto cozido',            'Leguminosas',  'TACO', 77,  4.5,  14.0, 0.5),
  ('Lentilha cozida',                'Leguminosas',  'TACO', 93,  6.3,  16.3, 0.5),
  ('Peito de frango grelhado',       'Carnes',       'TACO', 159, 32.0, 0.0,  2.5),
  ('Coxa de frango cozida sem pele', 'Carnes',       'TACO', 167, 26.9, 0.0,  6.3),
  ('Carne bovina patinho cozida',    'Carnes',       'TACO', 219, 35.0, 0.0,  7.3),
  ('Carne moída cozida',             'Carnes',       'TACO', 212, 26.7, 0.0,  11.6),
  ('Filé de tilápia grelhado',       'Pescados',     'TACO', 96,  20.0, 0.0,  1.7),
  ('Salmão grelhado',                'Pescados',     'USDA', 211, 23.0, 0.0,  13.0),
  ('Ovo de galinha cozido',          'Ovos',         'TACO', 146, 13.3, 0.6,  9.5),
  ('Batata cozida',                  'Tubérculos',   'TACO', 52,  1.2,  11.9, 0.0),
  ('Batata-doce cozida',             'Tubérculos',   'TACO', 77,  0.6,  18.4, 0.1),
  ('Mandioca cozida',                'Tubérculos',   'TACO', 125, 0.6,  30.1, 0.3),
  ('Macarrão cozido',                'Massas',       'TACO', 157, 5.8,  30.9, 1.3),
  ('Pão francês',                    'Panificados',  'TACO', 300, 8.0,  58.6, 3.1),
  ('Pão de forma integral',          'Panificados',  'TACO', 253, 9.4,  49.9, 3.5),
  ('Aveia em flocos',                'Cereais',      'TACO', 394, 13.9, 66.6, 8.5),
  ('Tapioca',                        'Cereais',      'TACO', 240, 0.0,  62.0, 0.0),
  ('Banana prata',                   'Frutas',       'TACO', 98,  1.3,  26.0, 0.1),
  ('Maçã Fuji',                      'Frutas',       'TACO', 56,  0.3,  15.2, 0.0),
  ('Laranja pera',                   'Frutas',       'TACO', 46,  1.0,  11.5, 0.1),
  ('Mamão formosa',                  'Frutas',       'TACO', 40,  0.5,  10.4, 0.1),
  ('Abacate',                        'Frutas',       'TACO', 96,  1.2,  6.0,  8.4),
  ('Leite integral',                 'Laticínios',   'TACO', 61,  2.9,  4.3,  3.5),
  ('Iogurte natural integral',       'Laticínios',   'TACO', 51,  4.1,  1.9,  3.0),
  ('Queijo mussarela',               'Laticínios',   'TACO', 330, 22.6, 3.0,  25.0),
  ('Tomate',                         'Hortaliças',   'TACO', 15,  1.1,  3.1,  0.2),
  ('Alface crespa',                  'Hortaliças',   'TACO', 11,  1.3,  1.7,  0.2),
  ('Cenoura crua',                   'Hortaliças',   'TACO', 34,  1.3,  7.7,  0.2),
  ('Brócolis cozido',                'Hortaliças',   'TACO', 25,  2.1,  4.4,  0.5),
  ('Azeite de oliva',                'Gorduras',     'USDA', 884, 0.0,  0.0,  100.0),
  ('Manteiga',                       'Gorduras',     'TACO', 726, 0.4,  0.1,  82.0),
  ('Castanha-do-pará',               'Oleaginosas',  'TACO', 643, 14.5, 15.1, 63.5)
ON CONFLICT (name) DO NOTHING;
