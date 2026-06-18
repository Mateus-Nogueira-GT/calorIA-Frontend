-- ============================================================
-- Migration 006 — Diets
-- Planos alimentares gerados pela IA
-- ============================================================

-- Cabeçalho da dieta gerada
CREATE TABLE IF NOT EXISTS public.diets (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id     UUID        REFERENCES public.chat_history(id) ON DELETE SET NULL,

  name                TEXT        NOT NULL,    -- "Dieta para Perda de Peso — 1800kcal"
  description         TEXT,

  -- Snapshot dos dados do usuário no momento da geração
  user_weight_kg      DECIMAL(5, 2),
  user_height_cm      INTEGER,
  user_age            INTEGER,
  user_gender         TEXT,
  user_goal           TEXT,
  user_activity_level TEXT,

  -- Metas calculadas (TDEE + ajuste pelo objetivo)
  tdee_calories       INTEGER     NOT NULL,
  target_calories     INTEGER     NOT NULL,
  target_protein_g    INTEGER     NOT NULL,
  target_carbs_g      INTEGER     NOT NULL,
  target_fat_g        INTEGER     NOT NULL,

  -- Status
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'archived', 'replaced')),

  -- Metadados da geração
  ai_model            TEXT        DEFAULT 'gpt-4o',

  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- FK reversa: chat_history.diet_id → diets.id
ALTER TABLE public.chat_history
  ADD COLUMN IF NOT EXISTS diet_fk UUID REFERENCES public.diets(id) ON DELETE SET NULL;

-- Atualiza a coluna diet_id que já existe (era UUID sem FK) para usar a FK
-- Se a coluna diet_id já existe como UUID, precisamos adicionar a FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_history'
      AND column_name = 'diet_id'
  ) THEN
    -- Adiciona FK se a coluna já existe
    ALTER TABLE public.chat_history
      DROP CONSTRAINT IF EXISTS chat_history_diet_id_fkey;
    ALTER TABLE public.chat_history
      ADD CONSTRAINT chat_history_diet_id_fkey
      FOREIGN KEY (diet_id) REFERENCES public.diets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Dias do plano alimentar (7 dias)
CREATE TABLE IF NOT EXISTS public.diet_days (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  diet_id         UUID        REFERENCES public.diets(id) ON DELETE CASCADE NOT NULL,

  day_number      INTEGER     NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  day_name        TEXT        NOT NULL,  -- "Segunda-feira"

  -- Totais do dia (denormalizados)
  total_calories  DECIMAL(8, 2) DEFAULT 0,
  total_protein   DECIMAL(8, 2) DEFAULT 0,
  total_carbs     DECIMAL(8, 2) DEFAULT 0,
  total_fat       DECIMAL(8, 2) DEFAULT 0,

  UNIQUE (diet_id, day_number)
);

-- Refeições de cada dia
CREATE TABLE IF NOT EXISTS public.diet_meals (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  diet_day_id     UUID        REFERENCES public.diet_days(id) ON DELETE CASCADE NOT NULL,

  meal_type       TEXT        NOT NULL CHECK (meal_type IN (
    'breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'
  )),
  name            TEXT        NOT NULL,   -- "Café da Manhã"
  time_suggestion TEXT,                   -- "07:00"

  -- Totais da refeição
  total_calories  DECIMAL(8, 2) DEFAULT 0,
  total_protein   DECIMAL(8, 2) DEFAULT 0,
  total_carbs     DECIMAL(8, 2) DEFAULT 0,
  total_fat       DECIMAL(8, 2) DEFAULT 0,

  -- Progresso do usuário
  is_completed    BOOLEAN     DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,

  sort_order      INTEGER     DEFAULT 0   -- ordem de exibição no dia
);

-- Itens de cada refeição
CREATE TABLE IF NOT EXISTS public.diet_items (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  diet_meal_id    UUID        REFERENCES public.diet_meals(id) ON DELETE CASCADE NOT NULL,

  food_name       TEXT        NOT NULL,
  quantity_g      DECIMAL(8, 2) NOT NULL CHECK (quantity_g > 0),
  unit            TEXT        NOT NULL DEFAULT 'g',

  -- Macros calculados para a porção definida
  calories        DECIMAL(8, 2) NOT NULL,
  protein_g       DECIMAL(8, 2) NOT NULL DEFAULT 0,
  carbs_g         DECIMAL(8, 2) NOT NULL DEFAULT 0,
  fat_g           DECIMAL(8, 2) NOT NULL DEFAULT 0,

  preparation_tip TEXT,   -- "Cozido sem sal", "Grelhado", etc.

  -- Substituições: quando o usuário troca um item
  is_substitution BOOLEAN   DEFAULT FALSE,
  original_item_id UUID     REFERENCES public.diet_items(id) ON DELETE SET NULL,

  sort_order      INTEGER   DEFAULT 0
);

-- ─── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS diets_updated_at ON public.diets;
CREATE TRIGGER diets_updated_at
  BEFORE UPDATE ON public.diets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── View: dieta ativa do usuário com progresso do dia atual ─────────────────

CREATE OR REPLACE VIEW public.active_diet_today AS
SELECT
  d.id            AS diet_id,
  d.user_id,
  d.name          AS diet_name,
  d.target_calories,
  d.target_protein_g,
  d.target_carbs_g,
  d.target_fat_g,
  dd.id           AS diet_day_id,
  dd.day_number,
  dd.day_name,
  COUNT(dm.id)                                              AS total_meals,
  COUNT(dm.id) FILTER (WHERE dm.is_completed = TRUE)       AS completed_meals,
  SUM(dm.total_calories) FILTER (WHERE dm.is_completed = TRUE) AS consumed_calories
FROM public.diets d
JOIN public.diet_days dd ON dd.diet_id = d.id
LEFT JOIN public.diet_meals dm ON dm.diet_day_id = dd.id
WHERE
  d.status = 'active'
  AND dd.day_number = ((EXTRACT(DOW FROM NOW())::INTEGER + 6) % 7) + 1
GROUP BY d.id, d.user_id, d.name, d.target_calories, d.target_protein_g,
         d.target_carbs_g, d.target_fat_g, dd.id, dd.day_number, dd.day_name;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.diets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_items ENABLE ROW LEVEL SECURITY;

-- Diets: acesso pelo dono
DROP POLICY IF EXISTS "diets_own" ON public.diets;
CREATE POLICY "diets_own" ON public.diets FOR ALL USING (user_id = auth.uid());

-- Diet days: via dieta do dono
DROP POLICY IF EXISTS "diet_days_own" ON public.diet_days;
CREATE POLICY "diet_days_own"
  ON public.diet_days FOR ALL
  USING (EXISTS (SELECT 1 FROM public.diets d WHERE d.id = diet_id AND d.user_id = auth.uid()));

-- Diet meals: via dia da dieta do dono
DROP POLICY IF EXISTS "diet_meals_own" ON public.diet_meals;
CREATE POLICY "diet_meals_own"
  ON public.diet_meals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.diet_days dd
      JOIN public.diets d ON d.id = dd.diet_id
      WHERE dd.id = diet_day_id AND d.user_id = auth.uid()
    )
  );

-- Diet items: via refeição da dieta do dono
DROP POLICY IF EXISTS "diet_items_own" ON public.diet_items;
CREATE POLICY "diet_items_own"
  ON public.diet_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.diet_meals dm
      JOIN public.diet_days dd ON dd.id = dm.diet_day_id
      JOIN public.diets d ON d.id = dd.diet_id
      WHERE dm.id = diet_meal_id AND d.user_id = auth.uid()
    )
  );

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS diets_user_status_idx      ON public.diets (user_id, status);
CREATE INDEX IF NOT EXISTS diet_days_diet_idx         ON public.diet_days (diet_id, day_number);
CREATE INDEX IF NOT EXISTS diet_meals_day_idx         ON public.diet_meals (diet_day_id, sort_order);
CREATE INDEX IF NOT EXISTS diet_meals_completed_idx   ON public.diet_meals (diet_day_id, is_completed);
CREATE INDEX IF NOT EXISTS diet_items_meal_idx        ON public.diet_items (diet_meal_id, sort_order);
