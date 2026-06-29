-- ============================================================
-- Migration 011 — Weight entries
-- Histórico de peso do usuário (tela de evolução). 1 registro por dia.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weight_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  weight_kg   NUMERIC(5, 2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_weight_user_date
  ON public.weight_entries (user_id, date);

ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weight_own" ON public.weight_entries;
CREATE POLICY "weight_own"
  ON public.weight_entries FOR ALL
  USING (auth.uid() = user_id);
