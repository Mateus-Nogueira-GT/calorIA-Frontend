-- Recarga de créditos: o índice de "compra em criação" passa a valer só para
-- compras pending (pente fino 2026-11-25, P2). Antes, uma compra que ficou sem
-- id do Asaas e depois foi fechada (expired/canceled) barrava o pacote para
-- sempre. Rodar DEPOIS da 027 e antes de ligar CREDIT_PURCHASES_ENABLED.

DROP INDEX IF EXISTS public.credit_purchases_one_inflight;
CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_one_inflight
 ON public.credit_purchases(user_id, package_id)
 WHERE asaas_payment_id IS NULL AND status = 'pending';
