-- ============================================================
-- Migration 015 — Painel Admin (Workstream M)
-- M1.1: flag de admin no perfil
-- M1.2: persistência do uso de IA (antes só existia em log)
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ─── M1.1: flag de admin ─────────────────────────────────────────────────────
-- A concessão é MANUAL (UPDATE abaixo, comentado). Não existe rota que promova
-- alguém a admin — é o que impede escalada de privilégio pelo app.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ─── M1.2: uso de IA ─────────────────────────────────────────────────────────
-- O logAiUsage do Workstream I só emitia log estruturado (decisão DI6), que não
-- é consultável por SQL. Sem esta tabela o painel não consegue mostrar custo.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL (não CASCADE): apagar o usuário não apaga o histórico de custo.
  user_id           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  feature           TEXT        NOT NULL CHECK (feature IN ('chat', 'diet_day', 'vision')),
  model             TEXT        NOT NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_created_idx      ON public.ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON public.ai_usage (user_id, created_at DESC);

-- RLS habilitada SEM policy: nenhum usuário lê esta tabela via PostgREST.
-- Só o backend (service_role, que bypassa RLS) tem acesso.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- ─── Conceder admin (rodar manualmente, trocando o email) ────────────────────
-- UPDATE public.profiles SET is_admin = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'activeconexautomacoes@gmail.com');
