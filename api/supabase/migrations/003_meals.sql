-- ============================================================
-- Migration 003 — Meals & Meal Items
-- Registro diário de refeições do usuário
-- ============================================================

-- Refeições registradas pelo usuário no dia
CREATE TABLE IF NOT EXISTS public.meals (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Ex: 'breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'
  meal_type   TEXT        NOT NULL CHECK (meal_type IN (
    'breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'other'
  )),
  meal_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  name        TEXT,        -- nome personalizado (ex: "Almoço no trabalho")
  notes       TEXT,        -- observações livres

  -- Totais calculados (denormalizados para performance)
  total_calories  DECIMAL(8, 2) DEFAULT 0,
  total_protein   DECIMAL(8, 2) DEFAULT 0,
  total_carbs     DECIMAL(8, 2) DEFAULT 0,
  total_fat       DECIMAL(8, 2) DEFAULT 0,

  logged_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Itens de cada refeição (alimentos individuais)
CREATE TABLE IF NOT EXISTS public.meal_items (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id       UUID        REFERENCES public.meals(id) ON DELETE CASCADE NOT NULL,
  food_id       UUID        REFERENCES public.foods(id) ON DELETE SET NULL,

  -- Dados do alimento no momento do registro (snapshot para histórico)
  food_name     TEXT        NOT NULL,
  quantity_g    DECIMAL(8, 2) NOT NULL CHECK (quantity_g > 0),

  -- Macros calculados para a quantidade registrada
  calories      DECIMAL(8, 2) NOT NULL DEFAULT 0,
  protein_g     DECIMAL(8, 2) NOT NULL DEFAULT 0,
  carbs_g       DECIMAL(8, 2) NOT NULL DEFAULT 0,
  fat_g         DECIMAL(8, 2) NOT NULL DEFAULT 0,

  -- Se foi adicionado via foto (IA Vision) ou manualmente
  source        TEXT        DEFAULT 'manual' CHECK (source IN ('manual', 'ai_vision', 'barcode', 'diet_plan')),

  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Trigger: recalcula totais da refeição quando item é adicionado/removido ──

CREATE OR REPLACE FUNCTION public.recalculate_meal_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_meal_id UUID;
BEGIN
  v_meal_id := COALESCE(NEW.meal_id, OLD.meal_id);

  UPDATE public.meals
  SET
    total_calories = COALESCE((SELECT SUM(calories) FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_protein  = COALESCE((SELECT SUM(protein_g) FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_carbs    = COALESCE((SELECT SUM(carbs_g)   FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_fat      = COALESCE((SELECT SUM(fat_g)     FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    updated_at     = NOW()
  WHERE id = v_meal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS meal_items_recalculate ON public.meal_items;
CREATE TRIGGER meal_items_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.meal_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_meal_totals();

-- Reutiliza trigger de updated_at da migration 001
DROP TRIGGER IF EXISTS meals_updated_at ON public.meals;
CREATE TRIGGER meals_updated_at
  BEFORE UPDATE ON public.meals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── View: resumo calórico diário por usuário ─────────────────────────────────

CREATE OR REPLACE VIEW public.daily_summary AS
SELECT
  user_id,
  meal_date,
  COUNT(*)                AS meal_count,
  SUM(total_calories)     AS total_calories,
  SUM(total_protein)      AS total_protein,
  SUM(total_carbs)        AS total_carbs,
  SUM(total_fat)          AS total_fat
FROM public.meals
GROUP BY user_id, meal_date;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.meals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meals_own" ON public.meals;
CREATE POLICY "meals_own"
  ON public.meals FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "meal_items_own" ON public.meal_items;
CREATE POLICY "meal_items_own"
  ON public.meal_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meals m
      WHERE m.id = meal_id AND m.user_id = auth.uid()
    )
  );

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS meals_user_date_idx       ON public.meals (user_id, meal_date DESC);
CREATE INDEX IF NOT EXISTS meals_user_type_idx       ON public.meals (user_id, meal_type);
CREATE INDEX IF NOT EXISTS meal_items_meal_id_idx    ON public.meal_items (meal_id);
CREATE INDEX IF NOT EXISTS meal_items_food_id_idx    ON public.meal_items (food_id);
