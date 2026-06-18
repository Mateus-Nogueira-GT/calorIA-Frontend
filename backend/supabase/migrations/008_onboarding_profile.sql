-- ============================================================
-- Migration 008 — Campos do questionário de onboarding
-- Executar no SQL Editor do Supabase (ou via CLI supabase db push)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS body_type TEXT
    CHECK (body_type IN ('ectomorph', 'mesomorph', 'endomorph', 'unknown')),
  ADD COLUMN IF NOT EXISTS coach_personality TEXT
    CHECK (coach_personality IN ('motivational', 'direct', 'empathetic', 'scientific')),
  ADD COLUMN IF NOT EXISTS coach_gender TEXT
    CHECK (coach_gender IN ('male', 'female', 'neutral'));

-- "health" (melhorar saúde) é uma opção de objetivo no onboarding que ainda não
-- existia no enum original do goal.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_goal_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_goal_check
  CHECK (goal IN ('lose_weight', 'maintain', 'gain_muscle', 'gain_weight', 'health'));
