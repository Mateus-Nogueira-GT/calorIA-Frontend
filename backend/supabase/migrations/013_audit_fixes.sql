-- ============================================================
-- Migration 013 — Correções da auditoria de RLS/índices (D38)
-- ============================================================

-- Views rodam com as permissões do DONO por padrão (ignoram a RLS do usuário
-- consultante). Expostas via PostgREST, poderiam vazar dados de outros usuários.
-- security_invoker (PG15+) faz a view respeitar a RLS de quem consulta.
ALTER VIEW public.daily_summary SET (security_invoker = true);
ALTER VIEW public.active_diet_today SET (security_invoker = true);

-- Busca de amigos usa ILIKE '%q%' em username/full_name; btree não atende esse
-- padrão. pg_trgm + GIN mantém a busca eficiente conforme a base cresce.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx
  ON public.profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_full_name_trgm_idx
  ON public.profiles USING gin (full_name gin_trgm_ops);
