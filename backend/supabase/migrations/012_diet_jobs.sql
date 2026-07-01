-- ============================================================
-- Migration 012 — Diet generation jobs (geração assíncrona/chunked)
-- A dieta de 7 dias é gerada 1 dia por chamada (cabe no limite serverless),
-- dirigida por polling do cliente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.diet_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID,
  diet_id         UUID        REFERENCES public.diets(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input           JSONB       NOT NULL,        -- dados coletados (CollectedUserData)
  total_days      INTEGER     NOT NULL DEFAULT 7,
  days_completed  INTEGER     NOT NULL DEFAULT 0,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diet_jobs_user ON public.diet_jobs (user_id, created_at DESC);

ALTER TABLE public.diet_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diet_jobs_own" ON public.diet_jobs;
CREATE POLICY "diet_jobs_own"
  ON public.diet_jobs FOR ALL
  USING (auth.uid() = user_id);
