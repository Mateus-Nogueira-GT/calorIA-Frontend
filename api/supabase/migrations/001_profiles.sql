-- ============================================================
-- Migration 001 — Profiles
-- Executar no SQL Editor do Supabase (ou via CLI supabase db push)
-- ============================================================

-- Tabela de perfis estendidos (complementa auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name       TEXT,
  avatar_url      TEXT,

  -- Dados físicos
  weight_kg       DECIMAL(5, 2)   CHECK (weight_kg > 0 AND weight_kg < 500),
  height_cm       INTEGER         CHECK (height_cm > 0 AND height_cm < 300),
  birth_date      DATE,

  -- Objetivos e estilo de vida
  gender          TEXT            CHECK (gender IN ('male', 'female', 'other')),
  goal            TEXT            CHECK (goal IN ('lose_weight', 'maintain', 'gain_muscle', 'gain_weight')),
  activity_level  TEXT            CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),

  -- Alimentação
  dietary_restrictions  TEXT[]  DEFAULT '{}',
  allergies             TEXT[]  DEFAULT '{}',

  -- Metadados
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Trigger: cria perfil automaticamente quando usuário se registra ──────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Trigger: atualiza updated_at automaticamente ────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS (Row Level Security) ─────────────────────────────────────────────────
-- Nossa API usa service_role_key que bypassa RLS automaticamente.
-- As policies abaixo protegem acessos diretos via anon/client.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS profiles_updated_at_idx ON public.profiles (updated_at DESC);
