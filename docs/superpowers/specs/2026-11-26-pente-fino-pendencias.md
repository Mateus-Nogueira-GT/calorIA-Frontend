# Pente fino: pendências que ficaram abertas (lote 7)

Data: 26/11/2026. Base: `fix/pente-fino-integrado`, que junta as branches `fix/pente-fino-1` a `-6` sobre `origin/main` `4b6d53d`.
Pedido do usuário: corrigir tudo o que estava aberto, menos o F3.
Ledger: `docs/qa/pente-fino-ledger.md`.
Plano: [2026-11-26-pente-fino-pendencias.md](../plans/2026-11-26-pente-fino-pendencias.md).

A branch integrada foi validada antes deste lote:

| Suíte | Resultado |
|---|---|
| Backend, testes unitários | 665 ✓ |
| Integração Postgres (credits, credit-grants, subscriptions, admin, chat-history, challenges, feed) | 106 ✓ |
| App | 917/918 (o `AddMealModal` estoura timeout só sob carga e passa sozinho) |

## Regra de implantação

Tudo o que muda contrato com versões do app já instaladas (inclusive os runtimes legados de OTA) ou que
depende de comportamento do Supabase que não dá para observar localmente vai atrás de uma **flag de env
que liga desligada**, com o comportamento de hoje. Os itens nessa situação são **A4** e **A5**.

O relatório final precisa dizer com clareza que esses dois continuam exploráveis até o usuário conferir e
ligar as flags.

## Grupo 1: autenticação (worker W1)

### R1. A4: cadastro com confirmação de e-mail (flag `AUTH_REQUIRE_EMAIL_CONFIRMATION`, padrão `false`)

**Problema.** `/auth/register` cria a conta com `email_confirm: true`. Quem cadastra o e-mail de outra
pessoa fica com a conta quando a pessoa entra depois pelo Google ou pela Apple.

**Com a flag ligada:**
- `createUser` usa `email_confirm: false` e o backend dispara o e-mail de confirmação do Supabase
  (`supabaseAuth.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`). Conferir a API
  instalada.
- A resposta é `201 { status: 'confirmation_required', email }`, sem sessão. O schema de resposta vira uma
  união e continua compatível com a resposta de hoje quando a flag está desligada.
- O login com e-mail não confirmado já devolve `403 EMAIL_NOT_CONFIRMED` (`auth.service.ts`).
- Uma rota `POST /auth/resend-confirmation` reenvia o e-mail, com rate limit por IP e resposta neutra
  (não revela se o e-mail existe).

**No app**, quando vier `confirmation_required`, ele mostra o estado "Confirme seu e-mail", com
"Reenviar" e "Já confirmei, entrar". O W1 precisa mapear e definir o comportamento de **todos** os
caminhos que hoje cadastram e esperam sessão:
- `RegisterScreen`;
- o "Criar conta para salvar" do scanner de convidado (o scan pendente não pode se perder);
- o gate de convite;
- o `ProfileSetup`;
- os créditos de boas-vindas automáticos (só depois da confirmação ou no primeiro login);
- o seed da conta demo, que continua confirmada.

Antes, o W1 deve ler o ramo de login social (`auth.service.ts:150-170`) e registrar no relatório o que o
backend faz quando o e-mail já existe com outro provedor.

**Limite.** A flag não protege contas que já foram cadastradas.

**Aceite (testes unit/route com fakes):**
- Flag desligada: a resposta é idêntica à de hoje.
- Flag ligada: `createUser` com `email_confirm: false`, resend chamado, resposta sem tokens.
- Resend com resposta neutra.
- Testes do app para o estado de confirmação em cada caminho mapeado.

### R2. A5: reset de senha só com sessão de recuperação (modo log, depois enforce)

**Leitura prévia.** Primeiro ler como o app obtém o token que envia a `/auth/reset-password`: deep link do
`resetPasswordForEmail`, fragmento `#access_token=…&type=recovery`.

**Comportamento:**
- O backend decodifica o `amr` do access token, que o `getUser` já validou.
- Com `AUTH_RESET_REQUIRE_RECOVERY=log` (padrão), ele registra em log o formato do `amr`, sem dados
  pessoais, e se haveria rejeição.
- Com `enforce`, ele exige uma entrada de recuperação (`method` em `recovery`/`otp`, conforme o que o log
  mostrar) com timestamp de até 1 h. Sem ela, devolve `401 INVALID_RESET_TOKEN`.
- Depois da troca de senha, o backend encerra as outras sessões (`admin.signOut(jwt, 'others')` ou o
  equivalente da versão instalada).

**Aceite:**
- No modo `log`, nada é rejeitado.
- No modo `enforce`, um token sem `amr` de recuperação recebe 401 e um com `amr` de recuperação recente
  passa.
- O signOut de outras sessões é chamado.

### R3. A7: rate limit por conta depois do JWT verificado

- Um hook `onRequest`, registrado antes do rate limit, tenta `request.jwtVerify()` em silêncio quando há
  bearer. Com isso o `keyGenerator` usa `sub` apenas para tokens verificados.
- Token inválido continua limitado por IP.
- `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/forgot-password` e
  `/auth/resend-confirmation` seguem limitados por IP.
- **Fica aberto:** o store em memória por instância. Resolver isso pede um Redis ou equivalente (infra).

**Aceite:**
- Dois tokens válidos de usuários diferentes no mesmo IP têm limites independentes.
- Um `sub` forjado em token inválido não troca a chave.

## Grupo 2: pagamentos (worker W2)

### R4. P7: timeout do Asaas não deixa cobrança órfã

**Erros.** O cliente do Asaas passa a distinguir erro **ambíguo** de erro **definitivo**:
- ambíguo: abort/timeout, erro de rede ou 5xx;
- definitivo: 4xx.

**Busca.** Criar `findPaymentByExternalReference` e `findSubscriptionByExternalReference`
(`GET /payments?externalReference=` e `GET /subscriptions?externalReference=`, filtrando registros
deletados). Conferir a API pública do Asaas pelo formato que o client já usa. Não chamar o Asaas real.

**Recarga (`credit-purchases.service.ts`):**
- Erro definitivo: apaga a linha, como hoje.
- Erro ambíguo: mantém a linha `pending` sem id e devolve `502 PAYMENT_PROVIDER_ERROR`.
- No próximo checkout do mesmo pacote, se houver linha `pending` sem id:
  - criada há menos de 1 min: `409 CHECKOUT_IN_PROGRESS`;
  - mais velha que isso: reconciliar por `externalReference`. Se achou, grava o id e o invoice e devolve
    essa fatura. Se não achou, apaga a linha e segue com o checkout novo.
- O webhook continua casando por `externalReference`.

**Assinatura (`subscriptions.service.ts`):** isto **substitui** a regra do lote 1 ("pending sem id recente
dá 409; antiga é cancelada localmente").
- Erro ambíguo em `createSubscription`: mantém a linha.
- No checkout seguinte, se a linha estiver `pending` sem id, **reconcilia primeiro** por
  `externalReference = local.id`:
  - **Achou:** grava `asaas_subscription_id`. Mesmo plano devolve a fatura dela. Plano diferente cancela
    pelo caminho normal, que já inclui o cancelamento remoto.
  - **Não achou e é recente** (menos de 10 min): 409, porque outro checkout pode estar em voo.
  - **Não achou e é antiga:** cancela localmente, como hoje.
  - **A própria busca falhou:** 409, para nunca arriscar uma segunda assinatura.

**Webhook:** se o `p.subscription` não casar com nenhuma linha, buscar a assinatura no Asaas
(`GET /subscriptions/{id}`). Se o `externalReference` dela for uma linha local `pending` sem id, gravar o id
e processar o evento.

**Aceite (testes com o fake do Asaas e com Postgres):**
- Timeout depois de criar seguido de checkout novo: nenhuma segunda criação, mesma fatura.
- Timeout sem criar: segue com o checkout novo.
- Webhook de assinatura órfã: casa e credita.
- Busca falhando: 409.

### R5. P8: com a recarga ligada, os créditos aparecem de verdade

**Leitura prévia.** Ler como o app deriva a visibilidade de créditos a partir de `/credits/me` (por
exemplo `enabled`/`featureVisible`) antes de mudar qualquer coisa.

**Regra:** com `CREDIT_PURCHASES_ENABLED=true`, `wallet()` e o ledger devolvem os dados reais e marcam o
recurso como visível, mesmo com a cobrança e os convites desligados. Quem vende créditos precisa mostrar o
saldo. A cobrança continua desligada, ou seja, o uso não debita. Com todas as flags desligadas, nada muda.

**Aceite:**
- Teste unitário: com a recarga ligada e o resto desligado, `wallet()` devolve o saldo real e
  `enabled: true` (ou o campo equivalente).
- Com tudo desligado, o resultado é igual ao de hoje.

## Grupo 3: dados (worker W3)

### R6. C4: `POST /food-log` idempotente

**Backend:**
- Cabeçalho `Idempotency-Key` **opcional**, para não quebrar clientes antigos.
- Migration `030_food_log_idempotency.sql`: coluna `idempotency_key text` em `meals`, com índice único
  parcial `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. Conferir o nome real da tabela.
- Repetir a mesma chave devolve a refeição já criada, com 200 ou 201 e o mesmo corpo. Só o primeiro
  insert conta.

**App:** o cartão `log_meal` do coach gera uma chave por cartão, guardada no cartão, e a reusa no "Tente de
novo". O scanner pode usar uma chave por item na mesma tentativa, se isso couber sem refatorar.

**Aceite:**
- Integração Postgres: duas requisições com a mesma chave geram uma refeição só.
- Requisição sem chave mantém o comportamento de hoje.
- App: repetir o cartão envia a mesma chave.

### R7. Corrida no `createDietJob`

**Migration `031_diet_jobs_one_running.sql`:**
1. Fecha os jobs ativos duplicados por usuário, mantendo o mais recente e marcando os outros como
   `failed`/`stale` com um motivo. Conferir os status reais.
2. Cria o índice único parcial de "um job ativo por usuário".

**Código:** `jobs.service.ts` trata o `23505` devolvendo o job ativo que já existe.

**Aceite (Postgres):**
- A migration aplicada sobre dados com 2 jobs ativos do mesmo usuário não falha e deixa 1 ativo.
- Dois `createDietJob` concorrentes resultam num job só.

### R8. S9: o gráfico semanal soma as refeições do plano concluídas

`/food-log/summary` (`food-log.service.ts:224-254`) soma, por dia, as refeições do plano concluídas
naquele dia, com a mesma regra de data que o Dashboard usa. Conferir como o app soma `completed_at` ou o
dia do plano. O resultado inclui fibra.

**Aceite:** teste com uma refeição do plano concluída hoje (500 kcal) e uma refeição livre (100 kcal): o
summary do dia dá 600.

### R9. Pedido de amizade simultâneo dos dois lados

`friends.service.ts`: o `23505` no insert vira `409 FRIEND_REQUEST_EXISTS`. Se o pedido existente veio do
outro lado e está pendente, a resposta é `409` com o código `FRIEND_REQUEST_INCOMING`, para o app oferecer
"aceitar". O W3 decide pelo padrão das mensagens de erro do app.

**Aceite:** teste unitário em que o `23505` vira 409.

## Fora de escopo

- F3 (conta ilimitada sem replay), por decisão do usuário.
- O store do rate limit compartilhado entre instâncias, que depende de infra.
