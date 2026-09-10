-- ============================================================
-- Migration 019 — Contexto na telemetria de IA (OP4 dos guardrails)
-- Sem conversation_id não dava para ver "tool chamada 2x na mesma conversa"
-- (o sintoma do loop de geração). Idempotente.
-- ============================================================
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS job_id          UUID,
  ADD COLUMN IF NOT EXISTS finish_reason   TEXT,
  ADD COLUMN IF NOT EXISTS tool_called     BOOLEAN;

CREATE INDEX IF NOT EXISTS ai_usage_conversation_idx
  ON public.ai_usage (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;
