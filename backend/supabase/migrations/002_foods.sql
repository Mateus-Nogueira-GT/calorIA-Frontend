-- ============================================================
-- Migration 002 — Foods (Tabela Nutricional)
-- Fonte: TACO (Tabela Brasileira de Composição de Alimentos)
--        + USDA (para alimentos não presentes na TACO)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.foods (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identificação
  name            TEXT        NOT NULL,
  name_en         TEXT,                        -- nome em inglês (para compatibilidade)
  category        TEXT,                        -- 'Cereais', 'Carnes', 'Frutas', etc.
  source          TEXT        DEFAULT 'TACO'   CHECK (source IN ('TACO', 'USDA', 'CUSTOM')),
  external_id     TEXT,                        -- ID original na base de dados fonte

  -- Macros por 100g
  calories        DECIMAL(8, 2),  -- kcal
  protein_g       DECIMAL(8, 2),  -- proteína (g)
  carbs_g         DECIMAL(8, 2),  -- carboidratos totais (g)
  fat_g           DECIMAL(8, 2),  -- gorduras totais (g)
  fiber_g         DECIMAL(8, 2),  -- fibra alimentar (g)
  sugar_g         DECIMAL(8, 2),  -- açúcares (g)

  -- Micronutrientes por 100g (principais)
  sodium_mg       DECIMAL(8, 2),  -- sódio (mg)
  calcium_mg      DECIMAL(8, 2),  -- cálcio (mg)
  iron_mg         DECIMAL(8, 2),  -- ferro (mg)
  potassium_mg    DECIMAL(8, 2),  -- potássio (mg)
  vitamin_c_mg    DECIMAL(8, 2),  -- vitamina C (mg)

  -- Porção padrão
  serving_size_g  INTEGER     DEFAULT 100,
  serving_unit    TEXT        DEFAULT 'g',     -- 'g', 'ml', 'unidade', 'fatia', etc.
  serving_label   TEXT,                        -- '1 fatia média', '1 xícara', etc.

  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Índices ──────────────────────────────────────────────────────────────────

-- Busca textual em português (autocomplete de alimentos)
CREATE INDEX IF NOT EXISTS foods_name_fts_idx
  ON public.foods USING gin(to_tsvector('portuguese', name));

-- Busca por categoria
CREATE INDEX IF NOT EXISTS foods_category_idx ON public.foods (category);

-- Busca por fonte
CREATE INDEX IF NOT EXISTS foods_source_idx ON public.foods (source);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "foods_public_read" ON public.foods;

CREATE POLICY "foods_public_read"
  ON public.foods FOR SELECT
  USING (is_active = TRUE);

-- ─── Função de busca de alimentos (full-text search) ─────────────────────────

CREATE OR REPLACE FUNCTION public.search_foods(
  query      TEXT,
  p_limit    INTEGER DEFAULT 20,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  category        TEXT,
  calories        DECIMAL,
  protein_g       DECIMAL,
  carbs_g         DECIMAL,
  fat_g           DECIMAL,
  serving_size_g  INTEGER,
  serving_unit    TEXT,
  serving_label   TEXT,
  rank            REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.id,
    f.name,
    f.category,
    f.calories,
    f.protein_g,
    f.carbs_g,
    f.fat_g,
    f.serving_size_g,
    f.serving_unit,
    f.serving_label,
    ts_rank(to_tsvector('portuguese', f.name), plainto_tsquery('portuguese', query)) AS rank
  FROM public.foods f
  WHERE
    f.is_active = TRUE
    AND to_tsvector('portuguese', f.name) @@ plainto_tsquery('portuguese', query)
  ORDER BY rank DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
