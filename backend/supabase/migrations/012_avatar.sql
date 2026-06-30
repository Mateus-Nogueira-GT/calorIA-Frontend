-- ============================================================
-- Migration 012 — Avatar (emoji + foto via Storage)
-- Executar no SQL Editor do Supabase (ou via CLI supabase db push)
-- ============================================================

-- Emoji opcional usado como avatar quando não há foto enviada.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_emoji TEXT;

-- ─── Storage: bucket público de avatares ──────────────────────────────────────
-- A API escreve via service_role (bypassa RLS). O bucket é público para que as
-- URLs de avatar possam ser exibidas no app sem assinatura.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Leitura pública dos avatares.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Usuário autenticado pode enviar/atualizar a própria foto (primeira pasta = user id).
-- O backend usa service_role e não depende destas policies, mas elas protegem
-- acessos diretos via client anon.
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
