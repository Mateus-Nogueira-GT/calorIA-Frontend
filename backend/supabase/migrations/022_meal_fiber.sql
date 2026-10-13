-- Fibra nas refeições do diário (feedback 2026-10-12). Nullable de propósito:
-- refeição registrada antes desta migration não tem o dado — "sem informação",
-- não "0 g". O backend detecta as colunas (meal-fiber-columns.ts) e funciona
-- antes e depois desta migration.
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS fiber_g     NUMERIC(8,2);
ALTER TABLE public.meals      ADD COLUMN IF NOT EXISTS total_fiber NUMERIC(8,2);

-- Mesmo trigger da 003, agora somando a fibra. SUM de nulos = NULL: refeição
-- sem nenhum item com fibra continua "sem dado".
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
    total_fiber    = (SELECT SUM(fiber_g) FROM public.meal_items WHERE meal_id = v_meal_id),
    updated_at     = NOW()
  WHERE id = v_meal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
