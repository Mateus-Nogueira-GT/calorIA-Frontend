# Pente fino: social, desafios e diário

Data: 25/11/2026. Base: `origin/main` `4b6d53d` (PR #104). Branch: `fix/pente-fino-3`.
Origem: auditoria do loop de pente fino (ledger em `docs/qa/pente-fino-ledger.md`, branch `fix/pente-fino-1`).
- Reproduzidos por teste: S2, S5 e S8.
- Reproduzidos em PostgreSQL local: S3 e S7.
- Confirmados pela leitura do código: S1, S4, S6 e S10.

Plano: [2026-11-25-pente-fino-social-desafios.md](../plans/2026-11-25-pente-fino-social-desafios.md).

## Requisitos

### R1. S1: sequência que parou volta a zero na leitura (média-alta)

`current_streak` só é regravado num check-in ou em `update_user_streak`. Quem parou continua aparecendo
com a sequência antiga no ranking (`challenges.service.ts:250-254`), nos amigos (`friends.service.ts:166`),
no perfil (`users.service.ts:56`) e no contexto do coach (`chat-context.ts:293`).

Correção: calcular o valor efetivo na leitura, sem job.
- Desafio: vale `current_streak` se `last_check_in >= hoje_SP - 1`. Se não, vale 0.
- Sequência pessoal: a mesma regra, com `last_active_date`.
- `hoje_SP` é `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
- O ranking ordena pelo valor efetivo, depois por `total_days` e, como desempate final e estável, por
  `user_id`.

**Aceite:** o membro A tem `current_streak` 10 e `last_check_in` de 5 dias atrás. O membro B tem 3 e
`last_check_in` de hoje. B vem em primeiro, e a sequência de A aparece como 0 no ranking, nos amigos e no perfil.

### R2. S2: post de "7 dias seguidos" sai uma vez só e não derruba o toggle (média)

`diets.service.ts:453-470`. O post de marco só é publicado quando a sequência **subiu** nesta chamada:
- compara o valor antes e depois do `update_user_streak`, ou
- faz a função devolver se avançou.

A preferência é não mudar a assinatura SQL, se der.

A publicação fica em try/catch com log, como no check-in (`challenges.service.ts:346`).

**Aceite:** no dia 7, marcar a segunda refeição não cria outro `feed_posts`. Uma falha no post não muda o
status de resposta do toggle.

### R3. S3: check-in não aceita data anterior ao último nem antes do início (média)

`challenges.service.ts:288` e `:319-334`.
- Uma data menor que `last_check_in` é rejeitada com 409 e não altera a sequência nem `total_days`.
- Uma data menor que `start_date` também é rejeitada.
- `total_days` só incrementa quando `challenge_days` de fato inseriu a linha.

A janela de ±1 dia continua, por causa dos fusos.

**Aceite:** com `last_check_in = D`, um check-in em D-1 devolve 409 e o estado fica inalterado. Hoje, ontem
e amanhã num mesmo dia real não geram sequência 3: depois do check-in de amanhã, o de hoje é recusado.

### R4. S4: o total do Diário bate com a barra de progresso (média)

`app/src/features/food-log/components/DayMacroSummary.tsx:12` passa a usar os mesmos totais da tela, com
as refeições do plano concluídas incluídas. `FoodLogScreen.tsx:82-85` repassa `dayTotals` ou o plano.

**Aceite:** com uma refeição do plano concluída de 500 kcal e uma refeição livre de 100 kcal, a barra e o
"Total consumido" mostram 600.

### R5. S5: o card "Participar" do convite não some no `load()` (média)

`app/src/features/challenges/store.ts:43-51`. O `load()` mantém os desafios vindos de convite ainda não
aceitos: faz merge por id com `joined === false`, e não substituição.

**Aceite:** resolver o convite, rodar `load()` sem esse desafio no retorno, e o desafio continua na lista
com "Participar".

### R6. S6: o último dia do desafio vale até a meia-noite de Brasília (média)

`challenges.service.ts:49` (`finished`) e `:151` (`joinChallenge`) passam a comparar com `hoje_SP`, e não
com `CURRENT_DATE` em UTC.

**Aceite:** em `2026-12-03T00:30Z`, um desafio com fim em 12-02 ainda tem `finished = false`. O teste usa um
relógio controlado ou um `SET TIME ZONE`/`now()` fixado na transação.

### R7. S7 e S8: contadores de curtida corretos e curtida sem 500 (baixa/média)

- **Migration nova `029_feed_counters_atomic.sql`.** Os triggers de `likes_count` e `comments_count` passam
  a usar `= x ± 1`, e não `COUNT(*)`. A migration também recalcula os contadores existentes uma vez.
- **Backend.** `feed.service.ts:276-280` faz `INSERT … ON CONFLICT DO NOTHING`.
- **App.** `feed/store.ts:99-126` ignora toques enquanto uma requisição de curtida daquele post estiver em
  andamento.

**Aceite:**
- Duas curtidas concorrentes dão `likes_count = 2`. O teste usa Postgres, com a transação 1 mantida aberta.
- Duas curtidas seguidas pelo mesmo usuário não dão 500.
- Dois toques rápidos no app geram uma requisição só.

### R8. S10: resposta do feed não aparece na conta seguinte (baixa-média)

`app/src/features/feed/store.ts:47-56` e `:74-82` capturam o dono da sessão (`captureSessionOwner` de
`@shared/services/session-owner`) e descartam a resposta se ele mudou. Se o padrão couber sem refatorar,
aplicar o mesmo em `challenges/store.ts` `load()`.

**Aceite:** com o feed pendente, a sessão é trocada e só então o feed resolve. Os `posts` ficam vazios.

## Fora de escopo (registrado como suspeito, não corrigido)

- **S9.** O gráfico semanal da Evolução ignora as refeições do plano. É decisão de produto: somar no
  servidor ou rotular o gráfico.
- **`createDietJob`.** Há uma corrida check-then-insert que pode gerar duas gerações pagas. Corrigir exige um
  índice parcial único, e isso fica para uma spec própria.
- **Pedido de amizade simultâneo dos dois lados.** Devolve 500 em vez de 409.

## Limites

As migrations não são aplicadas no Supabase remoto. Nada nativo muda, e o app sai por OTA.
