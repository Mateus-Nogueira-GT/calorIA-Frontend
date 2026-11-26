-- ============================================================
-- Migration 033 — Exclusão de conta não falha nos triggers (26/11/2026)
-- Idempotente: pode rodar de novo. Não altera dados.
-- ============================================================
-- O Supabase Auth apaga auth.users com o papel `supabase_auth_admin`, sem
-- permissão nas tabelas de public. A cascata dispara triggers que fazem UPDATE
-- em outras tabelas:
--   meals → meal_items (DELETE)      → recalculate_meal_totals    → UPDATE meals
--   post_likes (DELETE)              → recalculate_post_likes     → UPDATE feed_posts
--   post_comments (DELETE)           → recalculate_post_comments  → UPDATE feed_posts
-- Como as funções eram SECURITY INVOKER, o UPDATE rodava com o papel do Auth e
-- dava "permission denied": admin.deleteUser respondia "Database error deleting
-- user" e quem tinha refeição, curtida ou comentário não conseguia excluir a
-- conta. Com SECURITY DEFINER a função roda como o dono (postgres), como os
-- demais triggers que tocam outras tabelas. search_path fixo evita sequestro
-- de nomes. São funções de trigger: não dá para chamá-las direto.

ALTER FUNCTION public.recalculate_meal_totals() SECURITY DEFINER;
ALTER FUNCTION public.recalculate_meal_totals() SET search_path = public, pg_temp;

ALTER FUNCTION public.recalculate_post_likes() SECURITY DEFINER;
ALTER FUNCTION public.recalculate_post_likes() SET search_path = public, pg_temp;

ALTER FUNCTION public.recalculate_post_comments() SECURITY DEFINER;
ALTER FUNCTION public.recalculate_post_comments() SET search_path = public, pg_temp;
