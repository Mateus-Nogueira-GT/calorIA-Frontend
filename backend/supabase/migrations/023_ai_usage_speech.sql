-- Migration 023 — resposta falada do coach (TTS) entra na telemetria e na cota
-- diária de IA. Idempotente.
ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_feature_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_feature_check
  CHECK (feature IN ('chat', 'diet_day', 'vision', 'transcribe', 'speech'));
