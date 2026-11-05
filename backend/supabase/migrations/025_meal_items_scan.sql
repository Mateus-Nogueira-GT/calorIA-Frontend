-- Migration 025 — dúvida do scanner guardada no registro (spec 05/11, S3).
-- Idempotente. Sem ela o app grava como antes (o backend detecta as colunas).
ALTER TABLE public.meal_items
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3,2)
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS ai_alternatives TEXT[];
