-- ============================================================
-- Migration 004 — Challenges & Streaks
-- Sistema de desafios entre amigos e contagem de dias na dieta
-- ============================================================

-- Desafios criados pelos usuários
CREATE TABLE IF NOT EXISTS public.challenges (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  title           TEXT        NOT NULL,
  description     TEXT,
  rules           TEXT,       -- regras do desafio em texto livre

  -- Configurações do desafio
  goal_type       TEXT        NOT NULL DEFAULT 'streak'
                              CHECK (goal_type IN ('streak', 'calories', 'meals_logged')),
  target_value    INTEGER,    -- ex: 30 dias consecutivos, 2000 kcal/dia, etc.
  duration_days   INTEGER     NOT NULL DEFAULT 30,

  -- Status
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('draft', 'active', 'finished', 'cancelled')),
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,

  -- Convite
  invite_code     TEXT        UNIQUE NOT NULL DEFAULT UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  is_public       BOOLEAN     DEFAULT FALSE,
  max_members     INTEGER     DEFAULT 50,

  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Membros de cada desafio
CREATE TABLE IF NOT EXISTS public.challenge_members (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id  UUID        REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Status do membro no desafio
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('invited', 'active', 'quit', 'disqualified')),

  -- Progresso atual
  current_streak  INTEGER   DEFAULT 0,
  best_streak     INTEGER   DEFAULT 0,
  total_days      INTEGER   DEFAULT 0,
  last_check_in   DATE,

  joined_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (challenge_id, user_id)
);

-- Registro diário de check-ins no desafio
CREATE TABLE IF NOT EXISTS public.challenge_days (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id     UUID        REFERENCES public.challenge_members(id) ON DELETE CASCADE NOT NULL,
  check_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  completed     BOOLEAN     NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (member_id, check_date)
);

-- Streaks individuais do usuário (independente de desafios)
CREATE TABLE IF NOT EXISTS public.streaks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  current_streak  INTEGER     DEFAULT 0 NOT NULL,
  best_streak     INTEGER     DEFAULT 0 NOT NULL,
  last_active_date DATE,

  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS challenges_updated_at ON public.challenges;
CREATE TRIGGER challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS challenge_members_updated_at ON public.challenge_members;
CREATE TRIGGER challenge_members_updated_at
  BEFORE UPDATE ON public.challenge_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cria streak zerado quando usuário cria conta
CREATE OR REPLACE FUNCTION public.handle_new_user_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.streaks (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_streak ON auth.users;
CREATE TRIGGER on_auth_user_streak
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_streak();

-- ─── Função: atualizar streak ao registrar refeições ─────────────────────────

CREATE OR REPLACE FUNCTION public.update_user_streak(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_date   DATE;
  v_today       DATE := CURRENT_DATE;
  v_streak      INTEGER;
BEGIN
  SELECT last_active_date, current_streak
  INTO v_last_date, v_streak
  FROM public.streaks
  WHERE user_id = p_user_id;

  -- Primeiro check-in do usuário
  IF v_last_date IS NULL THEN
    UPDATE public.streaks
    SET current_streak = 1, best_streak = 1, last_active_date = v_today, updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- Já fez check-in hoje
  IF v_last_date = v_today THEN RETURN; END IF;

  -- Check-in consecutivo (ontem)
  IF v_last_date = v_today - INTERVAL '1 day' THEN
    UPDATE public.streaks
    SET
      current_streak   = current_streak + 1,
      best_streak      = GREATEST(best_streak, current_streak + 1),
      last_active_date = v_today,
      updated_at       = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Streak quebrado — reinicia
    UPDATE public.streaks
    SET current_streak = 1, last_active_date = v_today, updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.challenges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_days    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks           ENABLE ROW LEVEL SECURITY;

-- Desafios: criador pode gerenciar; membros podem ver
DROP POLICY IF EXISTS "challenges_select" ON public.challenges;
CREATE POLICY "challenges_select"
  ON public.challenges FOR SELECT
  USING (
    is_public = TRUE
    OR creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.challenge_members cm
      WHERE cm.challenge_id = id AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "challenges_insert" ON public.challenges;
CREATE POLICY "challenges_insert"
  ON public.challenges FOR INSERT
  WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "challenges_update" ON public.challenges;
CREATE POLICY "challenges_update"
  ON public.challenges FOR UPDATE
  USING (creator_id = auth.uid());

-- Membros: acesso por participação
DROP POLICY IF EXISTS "challenge_members_select" ON public.challenge_members;
CREATE POLICY "challenge_members_select"
  ON public.challenge_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_id AND c.creator_id = auth.uid()
    )
  );

-- Streaks: cada usuário acessa só o seu
DROP POLICY IF EXISTS "streaks_own" ON public.streaks;
CREATE POLICY "streaks_own"
  ON public.streaks FOR ALL
  USING (user_id = auth.uid());

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS challenges_creator_idx    ON public.challenges (creator_id);
CREATE INDEX IF NOT EXISTS challenges_invite_idx     ON public.challenges (invite_code);
CREATE INDEX IF NOT EXISTS challenges_status_idx     ON public.challenges (status);
CREATE INDEX IF NOT EXISTS cm_challenge_streak_idx   ON public.challenge_members (challenge_id, current_streak DESC);
CREATE INDEX IF NOT EXISTS cm_user_idx               ON public.challenge_members (user_id);
CREATE INDEX IF NOT EXISTS streaks_user_idx          ON public.streaks (user_id);
