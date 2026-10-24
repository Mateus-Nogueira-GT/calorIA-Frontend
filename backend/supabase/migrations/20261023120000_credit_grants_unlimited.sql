-- Liberação manual de créditos (kind='grant') e carteira ilimitada.
-- As migrations anteriores não são editadas (podem já estar aplicadas).

-- A CHECK de kind/units veio inline do CREATE TABLE com nome gerado: localiza e remove por lookup.
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.credit_ledger'::regclass AND contype='c'
  LOOP
    EXECUTE format('ALTER TABLE public.credit_ledger DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.credit_ledger
  ADD COLUMN note text CHECK(char_length(note) <= 100),
  ADD COLUMN idempotency_key text;
ALTER TABLE public.credit_ledger
  ADD CONSTRAINT credit_ledger_kind_check CHECK(kind IN ('welcome','debit','grant')),
  ADD CONSTRAINT credit_ledger_units_check CHECK(
    (kind='welcome' AND units=75) OR (kind='debit' AND units<0)
    OR (kind='grant' AND units BETWEEN 5 AND 5000)),
  ADD CONSTRAINT credit_ledger_actor_idempotency_key UNIQUE(actor_id, idempotency_key);

ALTER TABLE public.credit_wallets
  ADD COLUMN unlimited boolean NOT NULL DEFAULT false,
  ADD COLUMN unlimited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN unlimited_since timestamptz;

-- Igual ao original, agora também protegendo note e idempotency_key.
-- Continua permitido apenas anular user_id/actor_id e note (pseudonimização na exclusão de conta:
-- a observação do admin pode conter dado pessoal e é apagada junto).
CREATE OR REPLACE FUNCTION public.credit_ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'credit ledger is append only'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
 OR NEW.invite_id IS DISTINCT FROM OLD.invite_id OR NEW.kind IS DISTINCT FROM OLD.kind
 OR NEW.units IS DISTINCT FROM OLD.units OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR (NEW.note IS DISTINCT FROM OLD.note AND NEW.note IS NOT NULL)
 OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
 OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL)
 OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
 THEN RAISE EXCEPTION 'credit ledger is append only'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.credit_ledger_immutable() FROM PUBLIC;

-- Exclusão de conta também apaga a observação do admin nas liberações do usuário.
-- Corpo igual ao de 20261021204335 (que não é editada), mais o UPDATE de note.
CREATE OR REPLACE FUNCTION credit_private.credit_clear_deleted_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.credit_operations SET result=NULL,payload_hash='deleted',idempotency_key='deleted:'||id::text WHERE user_id=OLD.id;
 UPDATE public.credit_invites SET label=NULL WHERE creator_id=OLD.id;
 UPDATE public.credit_ledger SET note=NULL WHERE user_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION credit_private.credit_clear_deleted_result() FROM PUBLIC;
