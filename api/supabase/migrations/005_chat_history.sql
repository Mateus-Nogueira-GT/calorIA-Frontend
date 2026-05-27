-- ============================================================
-- Migration 005 — Chat History
-- Histórico de conversas entre usuário e IA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_history (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Mensagens: [{role: 'user'|'assistant', content: '...'}]
  messages        JSONB       NOT NULL DEFAULT '[]',

  -- Estado da conversa
  status          TEXT        NOT NULL DEFAULT 'collecting'
                              CHECK (status IN (
                                'collecting',  -- coletando dados do usuário
                                'generating',  -- gerando a dieta (em progresso)
                                'completed',   -- dieta gerada com sucesso
                                'abandoned'    -- usuário abandonou
                              )),

  -- Dieta gerada ao final da conversa
  diet_id         UUID,       -- FK adicionada após migration 006

  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

DROP TRIGGER IF EXISTS chat_history_updated_at ON public.chat_history;
CREATE TRIGGER chat_history_updated_at
  BEFORE UPDATE ON public.chat_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_history_own" ON public.chat_history;
CREATE POLICY "chat_history_own"
  ON public.chat_history FOR ALL
  USING (user_id = auth.uid());

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS chat_history_user_status_idx
  ON public.chat_history (user_id, status, updated_at DESC);
