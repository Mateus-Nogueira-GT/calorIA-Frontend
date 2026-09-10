-- ============================================================
-- Migration 017 — Lock em voo da geração de dia (OP1 dos guardrails de IA)
-- Idempotente.
-- ============================================================
-- Dois aparelhos logados, ou o app reaberto durante a geração, chamavam
-- /step ao mesmo tempo. O lock otimista no UPDATE já impedia persistir o
-- mesmo dia duas vezes — mas as duas chamadas de IA já tinham sido pagas.
ALTER TABLE public.diet_jobs
  ADD COLUMN IF NOT EXISTS step_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.diet_jobs.step_started_at IS
  'Relógio de expiração do lock em voo do /step: NULL quando nenhum dia está sendo gerado. Expira 300 s após a aquisição (mesmo teto do maxDuration da function) — não identifica o dono, só quando o lock pode ser considerado morto.';

-- Revisão da task 16: fencear a liberação do lock por timestamp não funciona
-- com este driver — postgres.js arredonda TIMESTAMPTZ para milissegundos ao
-- ler e ao escrever (Date do JS), enquanto NOW() do Postgres grava em
-- microssegundos; o valor devolvido por RETURNING nunca bate de volta na
-- comparação, nem para o dono legítimo. Um token opaco não sofre disso.
ALTER TABLE public.diet_jobs
  ADD COLUMN IF NOT EXISTS step_token UUID;

COMMENT ON COLUMN public.diet_jobs.step_token IS
  'Identifica qual chamador é dono do lock em voo do /step agora — permite que um chamador atrasado (lock expirado e reassumido por outro) detecte que não é mais dono e não libere o lock alheio nem marque o job failed por engano.';
