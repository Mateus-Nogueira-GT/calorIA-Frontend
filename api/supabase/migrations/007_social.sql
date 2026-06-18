-- ============================================================
-- Migration 007 — Feed social, amizades e username
-- Fase 3: feed social + desafios entre amigos
-- ============================================================

-- ─── Username no perfil ───────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);

-- ─── Amizades ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.friendships (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  addressee_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'blocked')),

  -- Garante que não existam pares duplicados em qualquer ordem (A→B e B→A)
  pair_key        TEXT        GENERATED ALWAYS AS (
                              LEAST(requester_id::TEXT, addressee_id::TEXT) || '_' ||
                              GREATEST(requester_id::TEXT, addressee_id::TEXT)
                              ) STORED,

  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CHECK (requester_id <> addressee_id),
  UNIQUE (pair_key)
);

DROP TRIGGER IF EXISTS friendships_updated_at ON public.friendships;
CREATE TRIGGER friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Função auxiliar: verifica se dois usuários são amigos aceitos
CREATE OR REPLACE FUNCTION public.are_friends(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = a AND addressee_id = b) OR (requester_id = b AND addressee_id = a))
  );
$$;

-- ─── Feed social ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feed_posts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  type            TEXT        NOT NULL DEFAULT 'custom'
                              CHECK (type IN ('custom', 'meal_completed', 'streak_milestone', 'challenge_joined', 'diet_generated')),
  content         TEXT        CHECK (content IS NULL OR char_length(content) BETWEEN 1 AND 500),
  metadata        JSONB       DEFAULT '{}' NOT NULL,

  likes_count     INTEGER     DEFAULT 0 NOT NULL,
  comments_count  INTEGER     DEFAULT 0 NOT NULL,

  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

DROP TRIGGER IF EXISTS feed_posts_updated_at ON public.feed_posts;
CREATE TRIGGER feed_posts_updated_at
  BEFORE UPDATE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.post_likes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        REFERENCES public.feed_posts(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Triggers: mantém likes_count / comments_count denormalizados ─────────────

CREATE OR REPLACE FUNCTION public.recalculate_post_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.feed_posts
  SET likes_count = (SELECT COUNT(*) FROM public.post_likes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS post_likes_recalculate ON public.post_likes;
CREATE TRIGGER post_likes_recalculate
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_post_likes();

CREATE OR REPLACE FUNCTION public.recalculate_post_comments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.feed_posts
  SET comments_count = (SELECT COUNT(*) FROM public.post_comments WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS post_comments_recalculate ON public.post_comments;
CREATE TRIGGER post_comments_recalculate
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_post_comments();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.friendships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments  ENABLE ROW LEVEL SECURITY;

-- Perfis: além do próprio, amigos aceitos também podem ver
DROP POLICY IF EXISTS "profiles_select_friends" ON public.profiles;
CREATE POLICY "profiles_select_friends"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.are_friends(auth.uid(), id));

-- Amizades: visível para quem participa do pedido
DROP POLICY IF EXISTS "friendships_select" ON public.friendships;
CREATE POLICY "friendships_select"
  ON public.friendships FOR SELECT
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
CREATE POLICY "friendships_insert"
  ON public.friendships FOR INSERT
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
CREATE POLICY "friendships_update"
  ON public.friendships FOR UPDATE
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;
CREATE POLICY "friendships_delete"
  ON public.friendships FOR DELETE
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Posts: dono ou amigos aceitos podem ver; só o dono cria/remove
DROP POLICY IF EXISTS "feed_posts_select" ON public.feed_posts;
CREATE POLICY "feed_posts_select"
  ON public.feed_posts FOR SELECT
  USING (user_id = auth.uid() OR public.are_friends(auth.uid(), user_id));

DROP POLICY IF EXISTS "feed_posts_insert" ON public.feed_posts;
CREATE POLICY "feed_posts_insert"
  ON public.feed_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feed_posts_delete" ON public.feed_posts;
CREATE POLICY "feed_posts_delete"
  ON public.feed_posts FOR DELETE
  USING (user_id = auth.uid());

-- Likes: visível para quem vê o post; só o próprio usuário curte/descurte
DROP POLICY IF EXISTS "post_likes_select" ON public.post_likes;
CREATE POLICY "post_likes_select"
  ON public.post_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_posts p
      WHERE p.id = post_id AND (p.user_id = auth.uid() OR public.are_friends(auth.uid(), p.user_id))
    )
  );

DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
CREATE POLICY "post_likes_insert"
  ON public.post_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_likes_delete" ON public.post_likes;
CREATE POLICY "post_likes_delete"
  ON public.post_likes FOR DELETE
  USING (user_id = auth.uid());

-- Comentários: mesma regra de visibilidade dos posts
DROP POLICY IF EXISTS "post_comments_select" ON public.post_comments;
CREATE POLICY "post_comments_select"
  ON public.post_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_posts p
      WHERE p.id = post_id AND (p.user_id = auth.uid() OR public.are_friends(auth.uid(), p.user_id))
    )
  );

DROP POLICY IF EXISTS "post_comments_insert" ON public.post_comments;
CREATE POLICY "post_comments_insert"
  ON public.post_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_comments_delete" ON public.post_comments;
CREATE POLICY "post_comments_delete"
  ON public.post_comments FOR DELETE
  USING (user_id = auth.uid());

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS friendships_requester_idx  ON public.friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx  ON public.friendships (addressee_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx     ON public.friendships (status);

CREATE INDEX IF NOT EXISTS feed_posts_user_idx         ON public.feed_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_created_at_idx   ON public.feed_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS post_likes_post_idx     ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS post_comments_post_idx  ON public.post_comments (post_id, created_at);
