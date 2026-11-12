-- Recarga de créditos pelo Asaas (spec 2026-11-12-recarga-de-creditos).
-- Rodar DEPOIS da 026 e antes de ligar CREDIT_PURCHASES_ENABLED.

CREATE TABLE IF NOT EXISTS public.credit_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text UNIQUE NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
 credits integer NOT NULL CHECK (credits BETWEEN 1 AND 100000),
 -- R$ 5,00 é o mínimo de cobrança do Asaas.
 price_cents integer NOT NULL CHECK (price_cents BETWEEN 500 AND 1000000),
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Créditos e preço copiados do pacote na compra. user_id vira NULL na exclusão
-- de conta (histórico financeiro).
CREATE TABLE IF NOT EXISTS public.credit_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 package_id uuid NOT NULL REFERENCES public.credit_packages(id),
 credits integer NOT NULL CHECK (credits > 0),
 price_cents integer NOT NULL CHECK (price_cents > 0),
 asaas_payment_id text UNIQUE,
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','paid','refunded','canceled','expired')),
 invoice_url text,
 credited_units integer NOT NULL DEFAULT 0 CHECK (credited_units >= 0),
 reversed_units integer NOT NULL DEFAULT 0 CHECK (reversed_units >= 0),
 paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_purchases_user_idx
 ON public.credit_purchases(user_id, created_at DESC);
-- Compra sendo criada (ainda sem cobrança no Asaas): uma por usuário e pacote.
-- Barra o toque duplo de gerar duas cobranças.
CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_one_inflight
 ON public.credit_purchases(user_id, package_id) WHERE asaas_payment_id IS NULL;

-- Extrato: compra e estorno de compra, únicos por pagamento (payment_ref).
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_kind_check;
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_units_check;
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_subscription_ref_check;
ALTER TABLE public.credit_ledger
  ADD CONSTRAINT credit_ledger_kind_check CHECK(kind IN
    ('welcome','debit','grant','subscription','subscription_reversal','purchase','purchase_reversal')),
  ADD CONSTRAINT credit_ledger_units_check CHECK(
    (kind='welcome' AND units=75) OR (kind='debit' AND units<0)
    OR (kind='grant' AND units BETWEEN 5 AND 5000)
    OR (kind IN ('subscription','purchase') AND units BETWEEN 5 AND 500000)
    OR (kind IN ('subscription_reversal','purchase_reversal') AND units<0)),
  ADD CONSTRAINT credit_ledger_subscription_ref_check CHECK(
    (kind IN ('subscription','subscription_reversal','purchase','purchase_reversal'))
      = (payment_ref IS NOT NULL));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['credit_packages','credit_purchases'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
