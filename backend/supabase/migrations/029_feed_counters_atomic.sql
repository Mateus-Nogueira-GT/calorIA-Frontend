-- ============================================================
-- Migration 029 — Contadores do feed atômicos (S7, spec 2026-11-25-pente-fino-social-desafios)
-- ============================================================
-- Os triggers da 007 regravavam likes_count/comments_count com COUNT(*). Em
-- READ COMMITTED, duas curtidas simultâneas contavam cada uma só a própria
-- linha (a outra ainda sem commit) e a segunda sobrescrevia com 1 em vez de 2.
-- `= x ± 1` é reavaliado sobre a versão travada da linha do post, então soma
-- certo. Mesmos nomes de função: os triggers da 007 continuam apontando para elas.

CREATE OR REPLACE FUNCTION public.recalculate_post_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;
  UPDATE public.feed_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_post_comments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;
  UPDATE public.feed_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$;

-- Corrige uma vez os contadores que a corrida já deixou errados (só os divergentes).
UPDATE public.feed_posts p
SET likes_count = c.likes, comments_count = c.comments
FROM (
  SELECT fp.id,
    (SELECT COUNT(*) FROM public.post_likes l WHERE l.post_id = fp.id)::INT AS likes,
    (SELECT COUNT(*) FROM public.post_comments m WHERE m.post_id = fp.id)::INT AS comments
  FROM public.feed_posts fp
) c
WHERE p.id = c.id
  AND (p.likes_count <> c.likes OR p.comments_count <> c.comments);
