-- ============================================================
-- Migration 018 — Cache de análise de foto (OP3 dos guardrails de IA)
-- A mesma foto reenviada era uma chamada de visão nova. Chave: sha256 do
-- data URL; validade de 24h (consultada no SELECT). Sem PII: só nome do
-- prato e macros. Idempotente.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scan_cache (
  image_hash TEXT        PRIMARY KEY,
  result     JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scan_cache_created_idx ON public.scan_cache (created_at);

-- RLS habilitada SEM policy: só o backend (service_role) lê/escreve.
ALTER TABLE public.scan_cache ENABLE ROW LEVEL SECURITY;
