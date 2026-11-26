-- ============================================================
-- Migration 032 — Sequência da dieta sem contagem dupla (lote 8, R6)
-- ============================================================
-- update_user_streak (014) lia last_active_date/current_streak sem travar a
-- linha. Duas refeições concluídas ao mesmo tempo liam os dois "ontem" e as
-- duas somavam: a sequência ia de 6 para 8 (e o marco de 7 dias podia sair
-- duas vezes). Agora a leitura trava a linha (FOR UPDATE): a segunda chamada
-- espera a primeira e, relendo, vê o dia já contado.
--
-- Mesma assinatura e mesmo retorno (void) da 014: CREATE OR REPLACE basta e o
-- backend antigo continua compatível. Não altera dados.

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
  WHERE user_id = p_user_id
  FOR UPDATE;

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
