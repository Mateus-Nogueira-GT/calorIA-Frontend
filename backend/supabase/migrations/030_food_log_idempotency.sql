-- ============================================================
-- Migration 030 — POST /food-log idempotente (C4, spec 2026-11-26-pente-fino-pendencias)
-- Idempotente: pode rodar de novo.
-- ============================================================
-- O cartão "Adicionar ao Diário" do coach repetia o POST no "Tente de novo"
-- depois de um timeout em que o servidor já tinha gravado: a refeição entrava
-- duas vezes. O app passa a mandar o cabeçalho Idempotency-Key (opcional, para
-- não quebrar clientes antigos) e o backend grava a chave aqui. A mesma chave
-- do mesmo usuário devolve a refeição já criada.
--
-- Registros antigos ficam com NULL e não entram no índice (parcial).
-- O backend detecta a coluna: antes desta migration, ignora a chave.

ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS meals_user_idempotency_key_uniq
  ON public.meals (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.meals.idempotency_key IS
  'Cabeçalho Idempotency-Key do POST /food-log: a mesma chave do mesmo usuário devolve a refeição já criada. NULL = cliente antigo ou registro anterior à 030.';
