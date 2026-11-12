# Spec: recarga de créditos pelo Asaas, dentro do app

**Data:** 12/11/2026 · **Decisões do cliente:**
- **Modelo:** **recarga de créditos** (pacotes avulsos), em vez de assinatura.
- **Onde vender:** **dentro do app**.
- **Preço de referência:** **1 crédito = R$ 6**.
- **Cobrança de créditos:** passa a ficar **ligada**.

O backend de assinatura (PR #101) continua no código, desligado, e reaproveita o cliente
Asaas, o webhook e o extrato.

## Riscos registrados (decisão do cliente)
- **Lojas:** a App Store (3.1.1) e o Google Play pedem a compra pela loja também para créditos
  consumíveis. Vender pelo Asaas dentro do app pode levar à recusa da versão.
- **Preço:** com 1 crédito = R$ 6, uma foto (3 créditos) custa R$ 18 e uma resposta do coach
  (0,4 crédito) custa R$ 2,40. Os pacotes são editáveis pelo admin, sem deploy, caso o valor
  mude.
- **Ordem para ligar a cobrança:** `CREDITS_ENFORCEMENT_ENABLED` só liga **depois** do Asaas em
  produção. Com o sandbox, ninguém consegue pagar de verdade e o saldo de todos acaba.

## Pacotes
A tabela `credit_packages` é editada pelo admin.

| Campo | Regra |
|---|---|
| `code` | identificador fixo; não muda depois de criado |
| `name` | texto mostrado ao usuário |
| `credits` | de 1 a 100.000 |
| `price_cents` | de R$ 5,00 (mínimo de cobrança do Asaas) a R$ 10.000,00 |
| `active` | só os ativos aparecem e aceitam compra |
| `sort_order` | ordem de exibição |

A compra guarda uma cópia dos créditos e do preço: editar o pacote não muda compras já feitas.

## Fluxo no app
1. **Créditos › Comprar créditos:** lista os pacotes com o preço, os créditos e o preço por
   crédito.
2. **Primeira compra:** o app pede nome e CPF/CNPJ.
   - O CPF é validado e vai só para o Asaas, sem ser gravado no CalorIA.
   - Nas compras seguintes o cliente Asaas é reaproveitado e o app não pede mais.
3. **Pagamento:** o backend cria uma cobrança avulsa no Asaas (`POST /v3/payments`,
   `billingType: UNDEFINED`, vencimento hoje + 1 dia) e devolve o link da fatura.
   - O app abre a fatura no navegador (`Linking.openURL`), sem módulo nativo novo, então a
     recarga sai por OTA.
   - O usuário paga com Pix, cartão ou boleto.
4. **Volta ao app:** o app confere a compra a cada 5 s, por até 2 min, e também quando volta ao
   primeiro plano.
   - Paga → "Créditos adicionados", e o saldo é recarregado.
   - Ainda pendente → "Assim que o pagamento for confirmado, os créditos entram".
5. **Compra pendente do mesmo pacote** com menos de 24 h: devolve a mesma fatura, sem cobrança
   nova.

## Créditos
- **Pagamento confirmado** (webhook `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`, para cobrança
  avulsa):
  - os créditos entram **uma única vez por pagamento**, como o tipo `purchase` no extrato;
  - a compra fica `paid`.
- **Estorno ou chargeback:** retira os créditos daquela compra até o saldo disponível, como o
  tipo `purchase_reversal`, e a compra fica `refunded`.
- **Cobrança removida ou vencida sem pagamento** (`PAYMENT_DELETED`/`PAYMENT_OVERDUE`): a compra
  fica `canceled`/`expired`.
- **Saldo insuficiente:** no scanner e no coach, o aviso ganha o botão **Comprar créditos**.

## API
| Rota | Efeito |
|---|---|
| `GET /credit-purchases/packages` | pacotes ativos (login) |
| `GET /credit-purchases/customer` | `{ has_customer }`, para saber se pede CPF |
| `POST /credit-purchases/checkout` | `{ package_code, cpf_cnpj?, name? }` → `{ purchase_id, invoice_url }` |
| `GET /credit-purchases/:id` | status da compra |
| `GET`/`POST`/`PATCH /admin/credit-packages` | pacotes |

- **Flag:** `CREDIT_PURCHASES_ENABLED`. Desligada → 404.
- **Webhook:** passa a responder com qualquer uma das duas flags de pagamento.

## Admin (app)
O painel ganha a aba **Pacotes**: lista, cria, edita preço e créditos, ativa e desativa.

## Fora desta spec
- Compra pela App Store ou pelo Google Play.
- Nota fiscal (configurada no painel do Asaas).
- Cupom.

## Aceite
- [ ] Sandbox: comprar um pacote → pagar na fatura → os créditos entram uma vez, mesmo com o
      webhook repetido.
- [ ] Primeira compra pede CPF; a segunda não pede.
- [ ] Estorno retira os créditos sem deixar saldo negativo.
- [ ] Saldo insuficiente no scanner ou no coach → botão Comprar créditos.
- [ ] Admin cria e edita pacotes pelo app.
- [ ] Tudo no app sai por OTA, sem build de loja.
