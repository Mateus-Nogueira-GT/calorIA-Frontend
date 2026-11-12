# Operação: pagamentos pelo Asaas (recarga de créditos e assinatura)

> **Modelo em uso (12/11/2026): recarga de créditos** (spec
> `docs/superpowers/specs/2026-11-12-recarga-de-creditos.md`). A assinatura segue no código,
> desligada. A parte do Asaas (chave, webhook, sandbox/produção) é a mesma para as duas.

## Recarga de créditos — ordem para ligar
1. **Migrações:** rodar `026_subscriptions.sql` e depois `027_credit_purchases.sql` no SQL
   Editor.
2. **Vercel:**
   - `ASAAS_ENV`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`;
   - `CREDIT_PURCHASES_ENABLED=true`;
   - redeploy.
3. **Webhook no Asaas:** eventos de cobrança (`PAYMENT_*`), como no passo 2 abaixo.
4. **Pacotes:** no app, em Perfil › Administração › aba **Pacotes**. Também dá pela API
   `POST /admin/credit-packages`.
   - Preço mínimo: R$ 5,00, o mínimo do Asaas.
   - 1 crédito = 5 unidades; uma foto custa 3 créditos.
5. **Teste no sandbox:**
   - Perfil › Créditos › Comprar créditos;
   - na primeira vez, informe nome e CPF;
   - pague a fatura no sandbox e volte ao app: os créditos entram em segundos.
6. **Produção:** troque `ASAAS_ENV`, a chave e o token, cadastre o webhook na conta de produção
   e faça o redeploy.
7. **Cobrança de créditos:** só **depois** do passo 6, `CREDITS_ENFORCEMENT_ENABLED=true` e
   redeploy. Com o sandbox, ninguém consegue pagar de verdade e o saldo de todos acaba.

Consultas:
```sql
SELECT status, count(*), sum(price_cents)/100.0 AS reais FROM credit_purchases GROUP BY 1;
SELECT kind, count(*), sum(units)/5 AS creditos FROM credit_ledger
WHERE kind IN ('purchase','purchase_reversal') GROUP BY 1;
```

---

# Assinatura (desligada)

Spec: `docs/superpowers/specs/2026-11-09-assinaturas-asaas.md`. O backend está pronto e
**desligado** (`SUBSCRIPTIONS_ENABLED=false`). Siga a ordem abaixo. Os nomes de menu do painel
do Asaas podem variar; os campos da API foram conferidos na documentação em 09/11/2026.

## 1. Banco
Aplicar `backend/supabase/migrations/026_subscriptions.sql` no SQL Editor do Supabase.
**Isso vem antes de ligar a flag:** com a flag ligada e sem as tabelas, a cobrança de créditos
falharia.

Conferência:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('subscription_plans','payment_customers','subscriptions',
  'subscription_payments','payment_webhook_events');   -- 5 linhas
```

## 2. Asaas (começar pelo sandbox)
1. **Conta e chave:** crie a conta de sandbox em `sandbox.asaas.com` e gere a chave de API em
   Integrações.
2. **Token do webhook:** gere com `openssl rand -hex 32`, que dá 64 caracteres. O token não pode
   ser a chave de API.
3. **Webhook:** cadastre um em Integrações › Webhooks.
   - **URL:** `https://calor-ia-frontend.vercel.app/api/webhooks/asaas`;
   - **Token de autenticação:** o gerado acima;
   - **Eventos:** os de cobrança (`PAYMENT_*`) e os de assinatura (`SUBSCRIPTION_*`);
   - **Tipo de envio:** sequencial.

## 3. Vercel (Production)
| Variável | Sandbox | Produção |
|---|---|---|
| `ASAAS_ENV` | `sandbox` | `production` |
| `ASAAS_API_KEY` | chave do sandbox | chave de produção |
| `ASAAS_WEBHOOK_TOKEN` | token do passo 2 | outro token, cadastrado no webhook de produção |
| `ASAAS_SUCCESS_URL` | opcional (HTTPS) | página de "pagamento recebido" do site |
| `SUBSCRIPTIONS_ENABLED` | `true` | `true` |

Depois de alterar as variáveis, faça um redeploy, porque a Vercel só aplica a mudança em um
deploy novo.

## 4. Planos
O painel admin ainda não tem tela de planos: use a API com o token de uma conta admin.
```bash
curl -X POST https://calor-ia-frontend.vercel.app/api/admin/subscription-plans \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"pro","name":"Pro","price_cents":2990,"cycle":"MONTHLY","credits_per_cycle":300}'
```
- **Ciclos:** `MONTHLY`, `QUARTERLY`, `SEMIANNUALLY` ou `YEARLY`.
- **Benefício:** cada plano precisa de `credits_per_cycle`, de `"unlimited": true` ou dos dois.
- **Créditos:** 1 crédito = 5 unidades. Uma foto custa 3 créditos.
- **Alterações:** `PATCH /admin/subscription-plans/:id`. O `code` não muda. Preço e benefício
  novos valem só para quem assinar depois.
- **Tirar da venda:** `{"active": false}`. Quem já assinou continua.

## 5. Teste no sandbox
1. **Checkout:**
   ```bash
   curl -X POST .../api/subscriptions/checkout -H "Authorization: Bearer $TOKEN_USUARIO" \
     -H 'Content-Type: application/json' \
     -d '{"plan_code":"pro","cpf_cnpj":"<CPF válido>","name":"Teste"}'
   ```
   A resposta traz o `invoice_url`.
2. **Pagamento:** abra o `invoice_url` e pague com os dados de teste do sandbox. Também dá para
   confirmar a cobrança pelo painel do sandbox.
3. **Status:** `GET /api/subscriptions/me` deve mostrar `status: active`, `entitled: true` e
   `paid_until` um ciclo à frente. Em `GET /api/credits/me`, o saldo sobe pelos créditos do
   plano. Os créditos só são cobrados com `CREDITS_ENFORCEMENT_ENABLED=true`.
4. **Webhook:** confira em `payment_webhook_events` que os eventos chegaram.
5. **Cancelamento:** `POST /api/subscriptions/cancel` deixa a assinatura `canceled`, com
   `cancel_at_period_end: true`, e o benefício continua até `paid_until`.

## 6. Produção
Troque `ASAAS_ENV`, a chave e o token, cadastre o webhook na conta de produção, faça o redeploy
e repita o teste com um valor baixo, estornando depois.

## Consultas úteis
```sql
-- Eventos recebidos nas últimas 24 h
SELECT event, count(*) FROM payment_webhook_events
WHERE received_at > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC;

-- Assinaturas por estado e quantas estão pagas
SELECT status, count(*), count(*) FILTER (WHERE paid_until > now()) AS pagas
FROM subscriptions GROUP BY 1;

-- Créditos lançados por assinatura e estornados
SELECT kind, count(*), sum(units) FROM credit_ledger
WHERE kind IN ('subscription','subscription_reversal') GROUP BY 1;
```

## Logs (Vercel)
| Log | Significado |
|---|---|
| `asaas_webhook` | evento processado (`outcome`: `paid`, `reversed`, `ignored`, `duplicate`…) |
| `asaas_webhook_bad_token` | chamada sem o token certo; se for o Asaas, o token está diferente |
| `asaas_webhook_failed` | erro ao gravar; o Asaas reenvia |
| `asaas_request_rejected` | o Asaas recusou uma chamada nossa; o motivo está em `errors` |
| `subscription_cancel_on_delete_failed` | a conta foi excluída, mas a assinatura não foi cancelada no Asaas; cancele pelo painel |

**Fila pausada:** depois de 15 falhas seguidas, o Asaas pausa a fila. Se houver vários
`asaas_webhook_failed`, corrija a causa e reative a fila no painel do Asaas. Os eventos
acumulados são reenviados, e a duplicata não tem efeito.

## Pendências fora do código
- **Regras das lojas:** antes de pôr o botão de assinar no app iOS ou Android, confira a regra
  de pagamento de cada loja. Veja a spec. Pelo site não há esse risco.
- **Política de privacidade:** incluir o Asaas como processador de pagamento, que recebe nome e
  CPF/CNPJ.
- **Nota fiscal:** configurar a emissão automática no painel do Asaas, se o cliente quiser.
