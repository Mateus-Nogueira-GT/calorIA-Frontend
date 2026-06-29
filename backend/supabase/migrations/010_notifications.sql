-- ============================================================
-- Migration 010 — Notifications
-- Notificações in-app (sino). Geradas pelo backend em eventos
-- (like/comment no feed, convite/ranking de desafio).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- destinatário
  actor_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,         -- quem causou
  type        TEXT        NOT NULL CHECK (type IN ('like', 'comment', 'challenge_invite', 'challenge_rank')),
  message     TEXT        NOT NULL,
  target_id   UUID,                  -- post/challenge alvo
  read_at     TIMESTAMPTZ,           -- NULL = não lida
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id);
