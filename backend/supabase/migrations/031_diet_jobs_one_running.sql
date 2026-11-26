-- ============================================================
-- Migration 031 — Um job de geração de dieta ativo por usuário (R7, spec 2026-11-26-pente-fino-pendencias)
-- Idempotente: pode rodar de novo.
-- ============================================================
-- createDietJob confere se há job pending/running e só então insere. Duas
-- chamadas simultâneas (dois aparelhos, toque duplo) passavam juntas pela
-- checagem e abriam duas gerações: duas dietas draft e o dobro de IA paga.
-- O índice único parcial fecha a corrida no banco; o backend trata o 23505
-- devolvendo o job ativo que já existe.
--
-- 1. Fecha os ativos duplicados que já existam: por usuário fica só o mais
--    recente (created_at, id). Os outros viram 'failed' com o motivo
--    DUPLICATE_ACTIVE_JOB, sem lock de step, e a draft deles vira 'failed'
--    (mesmo efeito da expiração STALE em jobs.service.ts). O app não reabre
--    sozinho um job que não é o último do usuário.
-- 2. Cria o índice. O LOCK impede que um insert entre o passo 1 e o 2 faça o
--    CREATE INDEX falhar.

BEGIN;

LOCK TABLE public.diet_jobs IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.diet_jobs
  WHERE status IN ('pending', 'running')
), closed AS (
  UPDATE public.diet_jobs j
  SET status = 'failed',
      error = 'DUPLICATE_ACTIVE_JOB: fechado pela migration 031 (havia outro job ativo mais recente)',
      step_started_at = NULL,
      step_token = NULL,
      updated_at = NOW()
  FROM ranked r
  WHERE j.id = r.id AND r.rn > 1
  RETURNING j.diet_id
)
UPDATE public.diets
SET status = 'failed', updated_at = NOW()
WHERE id IN (SELECT diet_id FROM closed) AND status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS diet_jobs_one_active_per_user
  ON public.diet_jobs (user_id)
  WHERE status IN ('pending', 'running');

COMMIT;
