-- Backend is the only writer. Existing clients use the API, never direct profile mutation.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM PUBLIC, anon, authenticated;
-- Column grants can survive a table-level REVOKE; remove those too, including is_admin.
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.profiles FROM PUBLIC, anon, authenticated', c, c);
  END LOOP;
END $$;
CREATE TABLE public.credit_wallets (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 balance_units integer NOT NULL DEFAULT 0 CHECK(balance_units >= 0),
 reserved_units integer NOT NULL DEFAULT 0 CHECK(reserved_units >= 0 AND reserved_units <= balance_units)
);
-- Minimal cancellation tombstones survive delayed HTTP arrivals/retries until account deletion.
-- No time-based purge: an old idempotency key must never restart a cancelled operation.
CREATE TABLE public.credit_cancellations (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,idempotency_key)
);
CREATE TABLE public.credit_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 type text NOT NULL CHECK(type IN ('photo','chat')),
 idempotency_key text NOT NULL, payload_hash text NOT NULL,
 cost_units integer NOT NULL CHECK(cost_units > 0), policy_version text NOT NULL,
 state text NOT NULL CHECK(state IN ('running','succeeded','failed','uncertain')),
 fence uuid NOT NULL, lease_expires_at timestamptz NOT NULL,
 conversation_id uuid, result jsonb, receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX credit_operations_recovery_idx ON public.credit_operations(lease_expires_at) WHERE state IN ('running','uncertain');
CREATE TABLE public.credit_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL,
 creator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 idempotency_key text NOT NULL, label text,
 grant_units integer NOT NULL DEFAULT 75 CHECK(grant_units=75),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','revoked')),
 claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(creator_id,idempotency_key)
);
CREATE TABLE public.credit_welcome_claims (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 invite_id uuid UNIQUE NOT NULL REFERENCES public.credit_invites(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.credit_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 operation_id uuid REFERENCES public.credit_operations(id),
 invite_id uuid REFERENCES public.credit_invites(id),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('welcome','debit')),
 units integer NOT NULL CHECK((kind='welcome' AND units=75) OR (kind='debit' AND units<0)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(operation_id,kind), UNIQUE(invite_id,kind)
);
CREATE INDEX credit_ledger_user_idx ON public.credit_ledger(user_id,created_at DESC,id DESC);
CREATE TABLE public.credit_conversation_leases (
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL,
 operation_id uuid NOT NULL REFERENCES public.credit_operations(id),
 PRIMARY KEY(user_id,conversation_id)
);
-- Ledger identity is pseudonymized on account deletion; operational content is removed.
CREATE SCHEMA IF NOT EXISTS credit_private;
REVOKE ALL ON SCHEMA credit_private FROM PUBLIC, anon, authenticated;
-- Auth's deletion role must not gain general table-write privileges. Only this
-- non-callable trigger executes with the migration owner's rights.
CREATE FUNCTION credit_private.credit_clear_deleted_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.credit_operations SET result=NULL,payload_hash='deleted',idempotency_key=id::text WHERE user_id=OLD.id;
 UPDATE public.credit_invites SET label=NULL WHERE creator_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION credit_private.credit_clear_deleted_result() FROM PUBLIC;
CREATE TRIGGER credit_clear_deleted_result BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION credit_private.credit_clear_deleted_result();
-- API-only, no client table access. RLS is defense in depth for exposed public schema.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['credit_cancellations','credit_wallets','credit_operations','credit_invites','credit_welcome_claims','credit_ledger','credit_conversation_leases'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
-- Allow only FK pseudonymization on account deletion; monetary history cannot be rewritten.
CREATE FUNCTION public.credit_ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'credit ledger is append only'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
 OR NEW.invite_id IS DISTINCT FROM OLD.invite_id OR NEW.kind IS DISTINCT FROM OLD.kind
 OR NEW.units IS DISTINCT FROM OLD.units OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL)
 OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
 THEN RAISE EXCEPTION 'credit ledger is append only'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.credit_ledger_immutable() FROM PUBLIC;
CREATE TRIGGER credit_ledger_immutable BEFORE UPDATE OR DELETE ON public.credit_ledger FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_immutable();
