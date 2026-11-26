# Roteiro de deploy do pente fino (25–26/11/2026)

Branch com tudo: `fix/pente-fino-integrado`, sobre `origin/main` `4b6d53d`.

Nada foi publicado ainda. Este roteiro lista a ordem de publicação e o que precisa ser conferido antes de cada passo.

O detalhe de cada achado está em [pente-fino-ledger.md](./pente-fino-ledger.md).

## 0. Hotfix A1 primeiro, separado

**Falha:** é possível forjar um JWT para qualquer usuário, inclusive admin.

**O hotfix** são três commits de `fix/pente-fino-4-seguranca` que entram limpos em `origin/main`. Não esperar a branch integrada para subir:

```
git cherry-pick 48810e1 93995f3 fceee8d
```

**Antes do deploy:** decodificar um access token real de produção e confirmar duas coisas:

- `iss` é exatamente `${SUPABASE_URL}/auth/v1`, com a mesma `SUPABASE_URL` configurada no Vercel;
- `aud` é `authenticated`.

Se algum dos dois não bater, todo usuário logado passa a receber 401.

**Depois do deploy:**

- procurar no bucket `avatars` arquivos que não são imagem (por exemplo, JSON com `"keys"`);
- procurar nos logs tokens com `iss` diferente de `/auth/v1`.

## 1. Migrations

Ordem de aplicação no SQL Editor do Supabase. Nenhuma foi aplicada no remoto.

| Migration | Quando aplicar | Observação |
|---|---|---|
| `028_credit_purchases_inflight_index.sql` | Junto com a 027, antes de ligar a recarga | Índice de compra em andamento só para `pending`. |
| `029_feed_counters_atomic.sql` | Antes do backend novo | Triggers de curtidas e comentários atômicos. Recalcula uma vez os contadores errados. |
| `030_food_log_idempotency.sql` | Qualquer momento | Coluna `meals.idempotency_key` com índice parcial único. O backend detecta a coluna e só deduplica depois que ela existir. |
| `031_diet_jobs_one_running.sql` | Antes do backend novo | Tem `BEGIN/LOCK/COMMIT` próprios. Fecha os jobs ativos duplicados (mantém o mais recente; os outros viram `failed` com `DUPLICATE_ACTIVE_JOB`) antes de criar o índice. Rodar sozinha. |
| `032_user_streak_lock.sql` | Antes do backend novo | `CREATE OR REPLACE` de `update_user_streak` com `FOR UPDATE`. Mesma assinatura da 014, sem mudar dados. |

**Checagem recomendada em produção** (achado F8): os writers antigos gravavam `chat_history.messages` como string jsonb, e as linhas antigas não foram reparadas. Para medir:

```sql
SELECT jsonb_typeof(messages), count(*) FROM chat_history GROUP BY 1;
```

## 2. Backend

Publicar a `fix/pente-fino-integrado`. Com as flags no padrão, a resposta das rotas é compatível com as versões do app já instaladas.

Já valem ao publicar, sem flag:

- **Depois de um reset de senha bem-sucedido**, as outras sessões do usuário são encerradas.
- **`Idempotency-Key` malformado em `POST /food-log`** devolve `400 INVALID_IDEMPOTENCY_KEY`. O cabeçalho continua opcional.
- **Rate limit:** passa a contar por conta para tokens verificados, e `/auth/*` continua limitado por IP. O contador fica em memória, por instância.
- **Pedido de amizade:** quando o outro lado já mandou um pedido, a resposta é `REQUEST_INCOMING` (antes era `REQUEST_PENDING`).
- **Erros de check-in:** `CHECK_IN_OUT_OF_ORDER` e `CHALLENGE_NOT_STARTED` aparecem no app com a mensagem genérica.

## 3. App (OTA)

Só há mudanças em JS/TS. Nada em `app/android` ou `app/ios`, e `package.json`, lockfiles e configs do Expo estão iguais aos de `origin/main`. Mesmo assim, conferir o fingerprint antes de publicar.

O OTA precisa sair **antes** de ligar `AUTH_REQUIRE_EMAIL_CONFIRMATION`. O saldo com a recarga ligada (P8) também só aparece em quem recebeu o OTA.

## 4. Flags (todas desligadas por padrão)

### `AUTH_REQUIRE_EMAIL_CONFIRMATION=true` (A4)

É uma mitigação, não um fechamento:

- Se o dono real clicar no link de confirmação, a senha de quem cadastrou o e-mail antes dele passa a funcionar.
- Não foi testado como o Supabase liga um login do Google a uma conta ainda não confirmada.
- Não protege as contas que já existem.

Antes de ligar, conferir:

1. O OTA com a tela "Confirme seu e-mail" já foi publicado.
2. "Confirm email" está ligado no projeto Supabase, e o login com conta não confirmada devolve `email_not_confirmed`.
3. `resend` do tipo `signup` envia e-mail para usuários criados pela admin API.
4. SMTP e limites de envio de e-mail estão configurados.
5. `AUTH_EMAIL_CONFIRMATION_REDIRECT_URL` está na allow-list (Auth › URL Configuration).
6. Existe um template de confirmação no dashboard. Só o de recuperação está versionado.

### `AUTH_RESET_REQUIRE_RECOVERY=enforce` (A5)

Antes de ligar, conferir:

1. Fazer um reset real em produção e ler o log `reset_password_recovery_check`.
2. Confirmar que `amr` chega como objetos com `method` igual a `recovery` ou `otp` e com timestamp.
3. Se vier em outro formato, ajustar `RECOVERY_METHODS` em `auth.service.ts` antes de ligar.

### `CREDIT_PURCHASES_ENABLED=true`

A flag controla só a criação de checkout. Com a tabela `credit_purchases` existindo, os webhooks de compra e estorno são processados mesmo com a flag desligada (lote 8, R1).


- Aplicar 026, 027 e 028 antes (ver `docs/operacao-assinaturas.md`).
- Com só a recarga ligada, a carteira real aparece e cria o bônus de boas-vindas de 75.

## Pendências conhecidas

- **F3:** conta ilimitada sem replay nem lease. Fica de fora por decisão do usuário.
- **Assinatura cancelada só localmente:** se ela existir no Asaas (cancelamento do usuário ou exclusão de conta de uma linha sem id), continua cobrando.
- **Rate limit:** o store em memória por instância precisa de Redis ou equivalente.
- **Idempotência no diário:** só o cartão do coach envia a chave. Scanner e registro manual, não.
- **Gráfico semanal:** conta conclusões de dietas substituídas, e `completed_at` guarda só a última conclusão.
- **Pedido de amizade:** o app ainda não oferece "aceitar" para `REQUEST_INCOMING`.
- **Links do app:** o link aberto deslogado se perde, e o convite com o app aberto troca o `NavigationContainer`.
