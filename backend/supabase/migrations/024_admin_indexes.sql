-- Migration 024 — índices das consultas do painel admin (spec 21/10, R5).
-- Só índices, idempotente. Sem ela as rotas /admin/* funcionam, mais lentas.
CREATE INDEX IF NOT EXISTS credit_ledger_created_idx       ON public.credit_ledger (created_at);
CREATE INDEX IF NOT EXISTS credit_operations_user_created_idx ON public.credit_operations (user_id, created_at);
CREATE INDEX IF NOT EXISTS meals_user_created_idx          ON public.meals (user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_feature_created_idx    ON public.ai_usage (feature, created_at);
CREATE INDEX IF NOT EXISTS credit_welcome_claims_invite_idx ON public.credit_welcome_claims (invite_id);
