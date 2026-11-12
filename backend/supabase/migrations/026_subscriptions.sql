-- Assinatura paga pelo Asaas (spec 2026-11-09-assinaturas-asaas).
-- Aplicar ANTES de ligar SUBSCRIPTIONS_ENABLED. As migrações anteriores não são editadas.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text UNIQUE NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
 description text CHECK (char_length(description) <= 300),
 price_cents integer NOT NULL CHECK (price_cents BETWEEN 100 AND 1000000),
 cycle text NOT NULL CHECK (cycle IN ('MONTHLY','QUARTERLY','SEMIANNUALLY','YEARLY')),
 credits_per_cycle integer CHECK (credits_per_cycle BETWEEN 1 AND 100000),
 unlimited boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT subscription_plans_benefit_check CHECK (unlimited OR credits_per_cycle IS NOT NULL)
);

-- Só o id do cliente no Asaas: o CPF/CNPJ não é gravado no CalorIA.
CREATE TABLE IF NOT EXISTS public.payment_customers (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 asaas_customer_id text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Preço, ciclo e benefício são copiados do plano na contratação: mudar o plano
-- não altera quem já assinou. user_id vira NULL na exclusão de conta (histórico financeiro).
CREATE TABLE IF NOT EXISTS public.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
 asaas_subscription_id text UNIQUE,
 status text NOT NULL CHECK (status IN ('pending','active','past_due','canceled')),
 price_cents integer NOT NULL CHECK (price_cents > 0),
 cycle text NOT NULL CHECK (cycle IN ('MONTHLY','QUARTERLY','SEMIANNUALLY','YEARLY')),
 credits_per_cycle integer CHECK (credits_per_cycle > 0),
 unlimited boolean NOT NULL,
 paid_until timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 canceled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Uma assinatura aberta por conta: barra o checkout duplo (dois toques simultâneos).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_open_per_user
 ON public.subscriptions(user_id) WHERE status IN ('pending','active','past_due');
CREATE INDEX IF NOT EXISTS subscriptions_user_paid_idx
 ON public.subscriptions(user_id, paid_until DESC);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
 asaas_payment_id text PRIMARY KEY,
 subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
 status text NOT NULL,
 value_cents integer,
 due_date date,
 period_end timestamptz,
 credited_units integer NOT NULL DEFAULT 0 CHECK (credited_units >= 0),
 reversed_units integer NOT NULL DEFAULT 0 CHECK (reversed_units >= 0),
 invoice_url text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_subscription_idx
 ON public.subscription_payments(subscription_id);

-- Entrega "at least once" do Asaas: o id do evento torna o processamento idempotente.
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
 event_id text PRIMARY KEY,
 event text NOT NULL,
 resource_id text,
 received_at timestamptz NOT NULL DEFAULT now()
);

-- Extrato: créditos por pagamento de assinatura e o estorno deles, únicos por pagamento.
ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS payment_ref text;
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_kind_check;
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_units_check;
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_subscription_ref_check;
ALTER TABLE public.credit_ledger
  ADD CONSTRAINT credit_ledger_kind_check
    CHECK(kind IN ('welcome','debit','grant','subscription','subscription_reversal')),
  ADD CONSTRAINT credit_ledger_units_check CHECK(
    (kind='welcome' AND units=75) OR (kind='debit' AND units<0)
    OR (kind='grant' AND units BETWEEN 5 AND 5000)
    OR (kind='subscription' AND units BETWEEN 5 AND 500000)
    OR (kind='subscription_reversal' AND units<0)),
  ADD CONSTRAINT credit_ledger_subscription_ref_check CHECK(
    (kind IN ('subscription','subscription_reversal')) = (payment_ref IS NOT NULL));
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_payment_ref_kind_key;
ALTER TABLE public.credit_ledger
  ADD CONSTRAINT credit_ledger_payment_ref_kind_key UNIQUE(payment_ref, kind);

-- Igual à versão de 20261023120000, agora também protegendo payment_ref.
CREATE OR REPLACE FUNCTION public.credit_ledger_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'credit ledger is append only'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
 OR NEW.invite_id IS DISTINCT FROM OLD.invite_id OR NEW.kind IS DISTINCT FROM OLD.kind
 OR NEW.units IS DISTINCT FROM OLD.units OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR (NEW.note IS DISTINCT FROM OLD.note AND NEW.note IS NOT NULL)
 OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
 OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
 OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL)
 OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
 THEN RAISE EXCEPTION 'credit ledger is append only'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.credit_ledger_immutable() FROM PUBLIC;

-- Só a API acessa. RLS é defesa em profundidade no schema público exposto.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['subscription_plans','payment_customers','subscriptions','subscription_payments','payment_webhook_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
