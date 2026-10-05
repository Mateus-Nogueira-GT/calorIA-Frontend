-- Fibra na dieta (feedback 2026-10-05). Nullable de propósito: dieta gerada
-- antes desta migration não tem o dado — "sem informação", não "0 g".
ALTER TABLE public.diet_items ADD COLUMN IF NOT EXISTS fiber_g     NUMERIC(8,2);
ALTER TABLE public.diet_meals ADD COLUMN IF NOT EXISTS total_fiber NUMERIC(8,2);
ALTER TABLE public.diet_days  ADD COLUMN IF NOT EXISTS total_fiber NUMERIC(8,2);
