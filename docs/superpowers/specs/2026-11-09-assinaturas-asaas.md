# Spec: assinatura paga pelo Asaas

**Data:** 09/11/2026 · **Escopo deste ciclo:** backend completo. App e web ficam para depois,
porque os pacotes e os valores ainda não foram decididos pelo cliente.

## Objetivo
Permitir que o usuário assine um plano mensal (ou de outro ciclo) e pague por Pix, boleto ou
cartão pelo Asaas. Enquanto a assinatura estiver paga, o plano concede **créditos por ciclo**,
**uso ilimitado** ou os dois. O backend fica pronto e desligado por flag, e os planos são
cadastrados pelo painel admin, sem deploy, quando o cliente decidir.

## Antes de ligar no app nativo: regra das lojas
As lojas exigem a cobrança delas para assinaturas digitais vendidas dentro do app:
- na App Store, a regra 3.1.1, In-App Purchase;
- no Google Play, o Play Billing.

Vender pelo Asaas **dentro do app iOS/Android** pode levar à recusa da versão. No Brasil houve
mudanças recentes nas regras de pagamento externo, mas **não conferi** o que vale hoje para o
CalorIA. Isso precisa ser verificado antes de mostrar o botão de assinar no app nativo.
- **O que não tem risco:** vender pelo site (`app.caloriaoficial.com.br`). O app nativo só lê o
  status da assinatura.
- **O backend não depende desse ponto:** a mesma API serve o site, o app e, se um dia entrar, a
  compra pela loja.

## Planos (definidos depois, sem deploy)
A tabela `subscription_plans` é editada pelo admin.

| Campo | Regra |
|---|---|
| `code` | identificador fixo (`basico`, `pro`…); não muda depois de criado |
| `name`, `description` | texto mostrado ao usuário |
| `price_cents` | de R$ 1,00 a R$ 10.000,00 |
| `cycle` | `MONTHLY`, `QUARTERLY`, `SEMIANNUALLY` ou `YEARLY` |
| `credits_per_cycle` | créditos somados ao saldo a cada pagamento confirmado (opcional) |
| `unlimited` | uso sem cobrança de créditos enquanto estiver pago |
| `active` | só planos ativos aparecem e aceitam novas assinaturas |

O plano precisa ter `credits_per_cycle`, `unlimited` ou os dois. **Mudar o preço não altera
assinaturas existentes**: a assinatura guarda uma cópia do preço, do ciclo e do benefício na
contratação.

## Fluxo
1. **Escolha:** o usuário escolhe o plano e informa CPF/CNPJ e nome.
   - O CPF é validado pelos dígitos verificadores e vai só para o Asaas.
   - **O CalorIA não grava o CPF**, só o id do cliente no Asaas.
2. **Cobrança:** o backend cria o cliente (uma vez por conta) e a assinatura no Asaas, com
   `billingType: UNDEFINED`, em que o usuário escolhe Pix, boleto ou cartão na fatura.
   - Devolve o link da **primeira fatura** (`invoiceUrl`).
   - **Nenhum dado de cartão passa pelo CalorIA.**
3. **Pagamento:** o usuário paga na página do Asaas.
4. **Liberação:** o Asaas avisa pelo webhook.
   - Com `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`, o pagamento libera o período:
     `pago até = vencimento + 1 ciclo + 1 dia`.
   - Os créditos do ciclo entram **uma única vez por pagamento**.
5. **Renovação:** o Asaas gera as próximas cobranças, e cada pagamento estende o período.

## Estados
| Estado | Quando |
|---|---|
| `pending` | assinatura criada, primeira fatura em aberto |
| `active` | algum pagamento confirmado |
| `past_due` | o Asaas avisou atraso (`PAYMENT_OVERDUE`); o benefício vale até `pago até` |
| `canceled` | cancelada pelo usuário ou pelo Asaas; o benefício vale até `pago até` |

**O benefício depende só de `pago até > agora`.** Cancelar não corta o que já foi pago.

## Estorno e chargeback
`PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED` e `PAYMENT_CHARGEBACK_REQUESTED`:
- **Créditos:** os créditos daquele pagamento são retirados, até o saldo disponível, porque o
  saldo nunca fica negativo. O extrato ganha um lançamento de estorno.
- **Período:** se esse pagamento era o que sustentava o período atual, o período termina agora.
- **Estorno parcial:** é tratado como total, de forma conservadora. O admin pode devolver
  créditos à mão, se for o caso.

## Webhook
- `POST /api/webhooks/asaas`, sem login.
- **Autenticação:** o header `asaas-access-token` é comparado com `ASAAS_WEBHOOK_TOKEN` em tempo
  constante. Sem o header ou com valor diferente, a resposta é 401.
- **Duplicatas:** a entrega é "at least once". O `id` do evento é gravado numa tabela própria, e
  um evento repetido responde 200 sem efeito.
- **Gravação:** o evento e o seu efeito entram na mesma transação.
  - Se o banco falhar, a resposta é 500, e o Asaas reenvia mais tarde.
  - A fila do Asaas pausa depois de 15 falhas seguidas, por isso há o alerta no log.
- **Eventos de fora do CalorIA:** um evento de cobrança que não pertence a uma assinatura do
  CalorIA, ou um tipo que não interessa, é registrado e responde 200. Isso evita pausar a fila
  da conta Asaas, que pode ter outros produtos.

## API
**Usuário (login obrigatório):**
| Rota | Efeito |
|---|---|
| `GET /subscriptions/plans` | planos ativos (sem login) |
| `GET /subscriptions/me` | assinatura atual, benefício e link da fatura em aberto |
| `POST /subscriptions/checkout` | `{ plan_code, cpf_cnpj, name }` → `{ invoice_url }` |
| `POST /subscriptions/cancel` | cancela no Asaas; o benefício vale até `pago até` |

**Regras do checkout:**
- Uma assinatura aberta por conta, garantida por índice único.
- Com o pagamento já em dia, a resposta é `409 ALREADY_SUBSCRIBED`. A troca de plano fica para
  um ciclo próximo.
- Se já houver uma assinatura `pending` do **mesmo plano**, o checkout devolve a mesma fatura e
  não cria cobrança nova.
- Se a assinatura `pending` for de **outro plano**, ela é cancelada e uma nova é criada.
- Dois toques simultâneos resultam em uma assinatura só. O segundo recebe 409.

**Admin:**
- `GET /admin/subscription-plans`;
- `POST /admin/subscription-plans`;
- `PATCH /admin/subscription-plans/:id`.

## Integração com os créditos
- **Ilimitado por assinatura:** a cobrança de foto e chat pula o débito quando há assinatura
  ilimitada com `pago até > agora`, igual ao ilimitado manual. `GET /credits/me` mostra
  `unlimited: true`.
- **Extrato:** ganha os tipos `subscription` e `subscription_reversal`, únicos por pagamento.
- **Cobrança de créditos:** a assinatura só tem efeito com `CREDITS_ENFORCEMENT_ENABLED=true`.
  Com a cobrança desligada, tudo já é grátis.

## Exclusão de conta
- **No Asaas:** antes de apagar a conta, o backend tenta cancelar a assinatura. Uma falha aí não
  impede a exclusão, só gera alerta no log.
- **No banco:** os registros de assinatura e pagamento ficam sem o vínculo com a pessoa, mas
  ficam como histórico financeiro. O cliente do Asaas é apagado do CalorIA.

## Configuração (Vercel)
| Variável | Uso |
|---|---|
| `SUBSCRIPTIONS_ENABLED` | `false` por padrão; só ligar depois de aplicar a migração |
| `ASAAS_ENV` | `sandbox` (padrão) ou `production` |
| `ASAAS_API_KEY` | chave da conta Asaas |
| `ASAAS_WEBHOOK_TOKEN` | 32 a 255 caracteres, o mesmo cadastrado no webhook do Asaas |
| `ASAAS_SUCCESS_URL` | opcional: para onde o Asaas manda o usuário depois de pagar |

Com a flag ligada e a chave ausente, as rotas respondem `503 PAYMENTS_UNAVAILABLE`.

## Decisões para o cliente (não bloqueiam o backend)
- **Pacotes e valores:** cadastrados no painel quando forem decididos.
- **Créditos do ciclo:** acumulam ou expiram no fim do ciclo? **Padrão adotado: acumulam.**
  Expirar exige um job e muda o extrato, e fica para depois se for pedido.
- **Período de teste grátis e cupom:** fora deste ciclo.
- **Troca de plano no meio do ciclo:** fora deste ciclo. Hoje é preciso cancelar e assinar de
  novo depois do fim do período.

## Fora desta spec
- Telas do app e do site.
- Compra pela App Store ou pelo Google Play.
- Nota fiscal. O Asaas tem emissão própria, e isso se configura no painel dele.

## Aceite
- [ ] Checkout em sandbox devolve `invoice_url`; pagar no sandbox ativa a assinatura e soma os
      créditos uma vez, mesmo com o webhook repetido.
- [ ] Plano ilimitado: foto e chat não debitam enquanto estiver pago; depois de `pago até`,
      voltam a debitar.
- [ ] Estorno retira os créditos (sem saldo negativo) e encerra o período.
- [ ] Webhook sem token ou com token errado → 401; evento desconhecido → 200 sem efeito.
- [ ] Dois checkouts simultâneos → uma assinatura.
- [ ] Flag desligada → as rotas respondem 404 e a cobrança de créditos não consulta as tabelas
      novas.
- [ ] Migração testada em PostgreSQL real no CI.
