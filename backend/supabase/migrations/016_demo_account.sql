-- ============================================================
-- Migration 016 — Conta de demonstração para a review da Apple
-- Executar no SQL Editor do Supabase (ou via CLI supabase db push)
-- ============================================================

-- A Apple exige uma conta demo funcional para apps fechados atrás de login
-- (App Review Information -> Sign-In Required). O CalorIA expõe "Excluir conta"
-- no perfil, que faz hard delete via supabase.auth.admin.deleteUser — e
-- revisores testam exatamente esse fluxo, porque a guideline 5.1.1(v) o exige.
-- Sem esta flag, o primeiro revisor que tocasse ali destruiria a credencial
-- entregue à Apple e a submissão seguinte seria rejeitada por "demo account
-- does not work".
--
-- A trava fica no SERVIDOR de propósito: bloquear só no cliente deixaria o
-- endpoint aberto, e a Apple pode instalar builds antigos, que não teriam
-- guarda de cliente nenhuma.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_demo IS
  'Conta de demonstração da App Review. Não pode ser excluída pelo endpoint DELETE /users/me.';
