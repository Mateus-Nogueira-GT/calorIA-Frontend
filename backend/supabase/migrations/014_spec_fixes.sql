-- ============================================================
-- Migration 014 — Correções da spec de auditoria (2026-07-24)
-- A4: update_user_streak com data local do cliente
-- A7: remove view legada active_diet_today (usava DOW em UTC)
-- B2: status 'draft'/'failed' em diets (geração resiliente)
-- E3: tipos de notificação de amizade
-- ============================================================

-- ─── A4: streak com data explícita ───────────────────────────────────────────
-- O cliente informa sua data local; CURRENT_DATE (UTC) fica só como fallback
-- retrocompatível. Chamadas antigas de 1 argumento continuam válidas.

DROP FUNCTION IF EXISTS public.update_user_streak(UUID);
CREATE OR REPLACE FUNCTION public.update_user_streak(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_date   DATE;
  v_streak      INTEGER;
BEGIN
  SELECT last_active_date, current_streak
  INTO v_last_date, v_streak
  FROM public.streaks
  WHERE user_id = p_user_id;

  -- Primeiro check-in do usuário
  IF v_last_date IS NULL THEN
    UPDATE public.streaks
    SET current_streak = 1, best_streak = GREATEST(best_streak, 1), last_active_date = p_date, updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- Já fez check-in nesse dia (ou informou data anterior à última — ignora)
  IF v_last_date >= p_date THEN RETURN; END IF;

  -- Check-in consecutivo (dia seguinte ao último)
  IF v_last_date = p_date - INTERVAL '1 day' THEN
    UPDATE public.streaks
    SET
      current_streak   = current_streak + 1,
      best_streak      = GREATEST(best_streak, current_streak + 1),
      last_active_date = p_date,
      updated_at       = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Streak quebrado — reinicia
    UPDATE public.streaks
    SET current_streak = 1, last_active_date = p_date, updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- ─── A7: view legada com dia da semana em UTC ────────────────────────────────
-- `active_diet_today` calculava o dia via EXTRACT(DOW FROM NOW()) — errado para
-- usuários fora de UTC. Nenhum código do backend a consome (a rota /diets/today
-- monta o dia via service com a data do cliente); removida para não vazar o
-- comportamento errado via PostgREST.
DROP VIEW IF EXISTS public.active_diet_today;

-- ─── B2: estados de rascunho/falha na geração de dieta ───────────────────────
-- A dieta nova nasce 'draft' e só substitui a ativa quando o último dia é
-- gerado; se o job falhar em definitivo, vira 'failed' e a ativa anterior
-- permanece intocada.
ALTER TABLE public.diets DROP CONSTRAINT IF EXISTS diets_status_check;
ALTER TABLE public.diets
  ADD CONSTRAINT diets_status_check
  CHECK (status IN ('active', 'archived', 'replaced', 'draft', 'failed'));

-- ─── E3: notificações de amizade ─────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'challenge_invite', 'challenge_rank', 'friend_request', 'friend_accepted'));
