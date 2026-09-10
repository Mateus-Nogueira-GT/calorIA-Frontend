# Spec — Guardrails da camada de IA (coach, geração de dieta, visão)

**Data:** 2026-09-09
**Origem:** sessão de debug a nível de LLM/agente/prompt, executada sobre `fix/android-ios-review-apple` logo após `cba29e5` ("dieta era regerada a cada mensagem"), que corrigiu o loop de geração mas não suas causas estruturais.
**Plano de implementação:** `docs/superpowers/plans/2026-09-09-guardrails-ia-coach.md`
**Spec anterior (contexto):** `docs/superpowers/specs/2026-09-08-android-ios-review-apple.md` — nada de lá se repete aqui.

---

## 0. Feedback loop desta sessão

| # | Comando | Estado hoje | Cobre |
|---|---------|-------------|-------|
| L1 | `cd backend && npm test` (vitest) | 🟢 121 testes / 15 arquivos | tudo que é função pura neste spec |
| L2 | `cd backend && npm run typecheck` | 🟢 | contratos zod/tool |
| L3 | `cd backend && npm run lint` (biome) | 🟡 **11 erros pré-existentes** (mesmos da `main`) | baseline: nenhuma task pode aumentar |
| L4 | `cd app && ./node_modules/.bin/jest --ci` | 🟢 308 testes | contrato app↔backend (`coach.service`, `diet.service`) |
| L5 | `cd app && ./node_modules/.bin/tsc --noEmit` | 🟢 | idem |

**Limite declarado:** nesta máquina não há chave de IA nem acesso a uma conta com backend real.
Tudo abaixo foi verificado por leitura do código, dos schemas e das libs em `node_modules`.
**Nenhum achado foi reproduzido contra o modelo.** Os guardrails são desenhados para serem
verificáveis sem modelo (funções puras) justamente por isso; o único item que exige modelo é o
eval offline (G17), e ele é opt-in.

---

## 1. Mapa da superfície de IA

Três chamadas de LLM, três contratos:

| Superfície | Arquivo | Modelo | O que entra | O que sai |
|---|---|---|---|---|
| **Coach** | `backend/src/modules/chat/chat.service.ts` | `OPENAI_MODEL` (`openai/gpt-5`), `tools: [collect_diet_data]`, `tool_choice: auto` | mensagem (≤ 2000 chars), 30 últimas mensagens, perfil, contexto do dia | texto **ou** tool call com `CollectedUserData` |
| **Geração de dia** | `backend/src/modules/diets/jobs.service.ts` → `processJobStep` | `OPENAI_DIET_MODEL`, structured output `aiSingleDaySchema` | dados coletados, metas calculadas, resumo dos dias anteriores | JSON de 1 dia (refeições → itens) |
| **Visão** | `backend/src/modules/scanner/scanner.service.ts` → `analyzePhoto` | `OPENAI_VISION_MODEL`, structured output `visionAnalysisSchema`, `detail: low` | foto (data URL ≤ 8 MB) | 1 item com kcal/macros/confiança |

Pontos onde texto controlado pelo usuário entra em prompt:
`message` (chat), `dietary_restrictions`, `allergies`, `food_preferences` (extraídos pelo modelo,
gravados em `profiles`, reinjetados em **todo** prompt futuro do chat e do dia).

Estado que o servidor grava e nunca lê: `chat_history.status` (`collecting` / `generating` /
`completed`) e a tabela `ai_usage`.

---

## 2. Achados

Ordenados por gravidade. Cada um tem evidência no código; nenhum foi reproduzido com modelo.

### A1 — CRÍTICA — nenhum limite de plausibilidade nos dados que viram dieta

`COLLECT_DIET_DATA_TOOL` (chat.service) e `collectedUserDataSchema` (`shared/diet-ai-schema.ts`)
declaram `weight_kg: number`, `height_cm: number`, `age: integer` **sem min/max**. O único freio
é `Math.max(1000, …)` em `computeTargets` (jobs.service).

Consequências verificáveis pela fórmula do próprio código:
- Mulher 45 kg / 160 cm (IMC 17,6, abaixo do peso), sedentária, "perder peso": BMR 1164 →
  TDEE 1397 → −500 = 897 → **1000 kcal/dia**. Déficit para quem não deveria estar em déficit.
- `age: 12` passa. Não há idade mínima em lugar nenhum.
- Altura em metros (`1.75`) ou peso em libras produzem BMR absurdo, persistido em `profiles`.
- Piso de 1000 kcal fica abaixo do mínimo recomendado sem supervisão (≈ 1200 F / 1500 M).

### A2 — CRÍTICA — nenhuma checagem pós-geração de alérgenos

O prompt do dia (`buildDayPrompt`) diz `Alergias (EVITAR): …` — e é só isso. Um escorregão do
modelo persiste amendoim no lanche de quem é alérgico, sem ninguém conferir. Instrução de prompt
não é guardrail para dano físico.

### A3 — ALTA — a chamada da tool é invisível para o modelo nas rodadas seguintes

O histórico guarda só `{ role, content }` (`ChatHistoryMessage`). Depois de gerar,
`handleDietGeneration` grava apenas `message_to_user` como texto; a mensagem com `tool_calls` e o
resultado nunca entram. Para o modelo, a conversa é: dados → "vou gerar" → "ok". Nada indica
que algo rodou. É a **causa estrutural** do loop corrigido em `cba29e5`.

Buraco remanescente, confirmado: `hasActiveDiet` vem de `getActiveDiet`, que filtra
`status = 'active'`. Durante a **primeira** geração a dieta é `draft` → `hasActiveDiet = false`
→ `EXISTING_DIET_INSTRUCTION` não entra. Um "ok" nesse intervalo faz o modelo chamar a tool; o
guard em `createDietJob` reaproveita o job, mas o usuário recebe outra "vou gerar sua dieta", o
perfil é re-escrito e paga-se uma chamada de chat à toa.

### A4 — ALTA — `finish_reason` ignorado

`choice.message.content ?? 'Desculpe, não consegui processar sua mensagem.'`. Com GPT-5 os
reasoning tokens consomem o `max_tokens: 2000` (o comentário do código admite). Ao estourar
(`finish_reason: 'length'`) o conteúdo vem vazio/cortado, o fallback é mostrado **como resposta**
e **persistido no histórico**, contaminando as rodadas seguintes. `content_filter` cai no mesmo
buraco. `parallel_tool_calls` não está desligado; só `tool_calls[0]` é tratado.

### A5 — ALTA — validação da saída do dia é rasa

`aiDietItemSchema`: `quantity_g`, `calories`, macros são `z.number()` sem bounds (zero e negativo
passam). Ninguém verifica: nº de refeições = `meals_per_day`; `meal_type` distintos; coerência
kcal ≈ 4p + 4c + 9g; proteína contra a meta (só **calorias** são reconciliadas em
`reconcileDay`); o clamp `[0.6, 1.6]` pode persistir um dia 50 % fora da meta com um `log.info`.
`unit` é string livre num campo chamado `quantity_g`.

### A6 — MÉDIA — truncamento de contexto por caractere induz alucinação

`formatUserContext` faz `block.slice(0, 1400)`. Pode cortar `Faltam: 1250 kcal` em `Faltam: 12`.
Logo abaixo, o prompt diz "nunca invente valores" — e o sistema entrega um valor errado.

### A7 — MÉDIA — `/step` sem lock em voo e sem rate limit próprio

O lock otimista (`WHERE days_completed = N−1`) impede persistir o mesmo dia duas vezes, mas as
duas chamadas de IA já foram pagas. Dois aparelhos logados, ou o app reaberto durante a geração
(o app não persiste `dietJob`), dobram o custo de cada dia. `/step` só tem o rate limit global.

### A8 — MÉDIA — fórmula de cálculo dentro do prompt do chat

`CHAT_SYSTEM_PROMPT` ensina Mifflin-St Jeor "para referência interna". O servidor calcula. O
modelo pode escrever "sua meta será ~1650 kcal" e a dieta chegar com 1580 (arredondamento, o
`−78` para `other`, o piso). Dois números diferentes na mesma tela.

### A9 — MÉDIA — campos livres viram prompt permanente

`dietary_restrictions` / `allergies` (`TEXT[]`, sem limite) e `food_preferences` (livre) são
extraídos pelo modelo, gravados e reinjetados em todo prompt futuro — `u.allergies.join(', ')`
sem corte no prompt do dia. Raio de dano é o próprio usuário (self-injection), mas é inflação de
tokens e ruído para o modelo.

### A10 — MÉDIA — custo sem teto diário

Rate limits por minuto existem (chat 30, scanner 20). Não há teto por dia. `ai_usage` é gravada e
nunca lida.

### A11 — BAIXA — visão só garante `≥ 0`

`Math.max(0, …)`. Um prato de 40 000 kcal passa. `confidence` é clampada e depois não usada. Sem
cache: a mesma foto reenviada é nova chamada.

### A12 — BAIXA — `persistHistory` engole falhas

`warn` e segue. A resposta volta com `conversation_id`; a próxima mensagem carrega histórico sem
o turno anterior. O histórico é a fonte de verdade da conversa.

### A13 — ALTA — sem regras de escopo nem de segurança clínica

Uma linha: "Você NÃO é médico". Nada sobre transtorno alimentar, gestação, menores, condição
diagnosticada, medicamentos, assunto fora de nutrição. A tool não coleta condição de saúde.

### Verificados e OK (registrado para não reinvestigar)

- Concorrência de persistência do dia: `UPDATE … WHERE days_completed = N−1` + rollback da
  transação impede dia duplicado. (Só o **custo** duplica — A7.)
- `processJobStep` é idempotente para job `completed`/`failed`.
- `reconcileDay` é determinístico e testável; o clamp é a única falha (A5).
- `toggleMealCompleted`: contrato `{ is_completed }`, CTE atômico, fuso — corretos. O bug
  reportado ("não marca") era consequência do loop, já corrigido.
- Rate limits por minuto por usuário existem em chat, scanner e auth.
- `analyzePhotoBodySchema` limita a 8 MB e exige `data:image/`.

---

## 3. Decisões de design

Tomadas nesta sessão, com a alternativa rejeitada e o motivo.

**D1 — Escopo.** Os blocos S (segurança da coleta), O (saída do dia) e C (chat) são o núcleo
desta spec. O bloco P (operação: lock em voo, teto de custo, visão, telemetria, evals) entra como
**fase final cortável** do mesmo plano — pode ser adiado sem afetar o resto. (Na sessão de debug
esses itens foram numerados G1–G12 e G13–G17, respectivamente; a spec usa os IDs dos blocos.) *Rejeitado:* só P0 (deixaria o loop
dependendo só do guard de banco) e tudo numa tacada (PR grande demais para revisar).

**D2 — Condições de saúde: perguntar e bloquear.** A tool ganha `health_conditions: string[]`.
Gestação, condição diagnosticada, transtorno alimentar ou idade < 18 → o coach **não gera**,
explica e recomenda profissional; segue conversando. *Rejeitado:* gerar com aviso (o app
entregaria dieta a gestante/diabético com disclaimer) e só prompt (o sistema não saberia da
condição — só o modelo, e só se lembrar).

**D3 — IMC fora da faixa: não gerar déficit, oferecer manutenção.** IMC < 18,5 com
`lose_weight` → recusa o déficit, oferece plano de manutenção. IMC > 40 → gera com piso e aviso.
*Rejeitado:* bloquear tudo (usuário sai sem nada) e gerar com aviso (déficit para quem está
abaixo do peso).

**D4 — Abordagem: módulo de guardrails determinístico.** `backend/src/shared/guardrails/` com
funções puras, sem Fastify/banco/OpenAI, chamadas em três pontos já existentes. **Prompt orienta;
código garante.** *Rejeitado:* só prompt (não garante nada para A1/A2) e motor de políticas
configurável (YAGNI para 12 regras).

**D5 — Recusa de guardrail é texto do coach, não HTTP de erro.** Toda recusa por segurança volta
como mensagem de assistente com status `collecting`. Só falha técnica (IA, histórico) vira 4xx/5xx.

**D6 — Retry de dia inválido: uma vez, com feedback; depois falha.** Nunca persistir um dia
inválido. O `/retry` existente continua do mesmo dia.

**D7 — `age` mínimo no schema é 10, não 18.** Para que o modelo *reporte* 15 anos e o servidor
recuse com a mensagem certa, em vez de o modelo "arredondar" para 18 para passar no schema.

**D8 — Tool ausente em vez de tool proibida.** Com job `pending`/`running`, `tools` não vai na
request. O modelo não chama o que não existe. Fecha A3 sem depender de prompt.

---

## 4. Requisitos

IDs referenciados pelo plano. `[puro]` = função sem I/O, testável isoladamente.

### Bloco S — Segurança da coleta (A1, A13; D2, D3, D7)

- **S1** `[puro]` Bounds no zod `collectedUserDataSchema` **e** no JSON schema da tool:
  `weight_kg` 30–300 · `height_cm` 120–250 · `age` 10–100 · `meals_per_day` 3–6 ·
  `dietary_restrictions`/`allergies`/`health_conditions` ≤ 10 itens, cada ≤ 40 chars ·
  `food_preferences` ≤ 300 chars. Novo campo `health_conditions: string[]`, obrigatório no schema (structured output exige), podendo vir vazio.
- **S2** `[puro]` `assessSafety(data) → { ok: true } | { ok: false, reason, userMessage }` em
  `shared/guardrails/collected-data.ts`, avaliado nesta ordem: `age < 18` → `MINOR`;
  `health_conditions.length > 0` → `HEALTH_CONDITION`; IMC < 18,5 e `goal = lose_weight` →
  `UNDERWEIGHT_DEFICIT` (mensagem oferece manutenção); IMC > 40 → `ok: true` com
  `warning: 'HIGH_BMI'`. Mensagens em pt-BR, prontas para o coach devolver.
- **S3** `handleDietGeneration` chama S2 antes de `createDietJob`. `ok: false` → responde com
  `userMessage`, persiste com `collecting`, **não** grava perfil, `diet_job_id: null`.
  `warning` → anexa aviso ao `message_to_user`. A `userMessage` fica no histórico: nas rodadas
  seguintes o modelo vê a recusa e a regra S6 o instrui a não chamar a tool de novo pelo mesmo
  motivo — o usuário precisa mudar o dado (ex.: aceitar manutenção) para uma nova tentativa.
- **S4** Zod inválido por bounds → resposta específica por campo ("Você disse 1,75 cm — quis
  dizer 175?"), não a mensagem genérica atual.
- **S5** `[puro]` `computeTargets`: piso 1200 (`female`) / 1500 (`male`, `other`), no lugar de
  1000.
- **S6** `CHAT_SYSTEM_PROMPT`: pergunta obrigatória sobre gestação/condições de saúde antes da
  tool; regra de escopo (assunto fora de nutrição → redirecionar); regra "se a última resposta
  do assistente foi uma recusa por segurança, não chame a tool até o usuário alterar o dado";
  **remove** a fórmula de cálculo, substituída por "não calcule nem prometa metas em kcal" (A8).

### Bloco O — Saída do dia (A2, A5; D6)

- **O1** `[puro]` `shared/guardrails/allergens.ts`: `normalize(s)` (minúsculas, sem acento,
  sem pontuação) + mapa de sinônimos inicial (amendoim/peanut; leite/lactose/queijo/iogurte;
  camarão/frutos do mar/marisco; glúten/trigo/pão/macarrão; ovo/ovos; soja; castanha/nozes/
  amêndoa; peixe) + `checkAllergens(day, allergies, restrictions) → Violation[]` onde
  `Violation = { mealIndex, itemIndex, field: 'food_name' | 'preparation_tip', matched }`.
  Restrições usam um mapa próprio (vegano/vegetariano → carnes, frango, peixe, ovo, leite;
  sem glúten → trigo, pão…). Mapas são constantes exportadas — extensíveis sem tocar a lógica.
- **O2** `[puro]` `shared/guardrails/day.ts`: `validateDay(day, targets, mealsPerDay) →
  DayViolation[]` com tipos: `MEAL_COUNT` (≠ `mealsPerDay`), `DUPLICATE_MEAL_TYPE`,
  `MEAL_ORDER` (fora da ordem canônica), `NON_POSITIVE_QUANTITY`, `NEGATIVE_MACRO`,
  `KCAL_MACRO_MISMATCH` (|kcal − (4p+4c+9g)| / kcal > 25 % — corrigível: recalcula kcal),
  `PROTEIN_OFF_TARGET` (fora de ±20 % da meta do dia).
- **O3** `[puro]` `reconcileOrFail(day, targetCalories)`: embrulha `reconcileDay`; se clampou e o
  total ainda difere > 15 % da meta → `RECONCILE_FAILED`.
- **O4** `processJobStep`, após o parse: `checkAllergens` → `validateDay` (aplicando as correções
  corrigíveis) → `reconcileOrFail`. Violações não corrigíveis: **1ª vez** regenera o dia com as
  violações descritas no prompt; **2ª vez** job `failed`, `error` = código
  (`ALLERGEN_IN_OUTPUT` | `DAY_VALIDATION_FAILED` | `RECONCILE_FAILED`). Nunca persiste dia
  inválido. Cada regeneração é uma chamada de IA a mais, logada.
- **O5** `buildDayPrompt` lista os `meal_type` exatos a preencher para `meals_per_day = N`,
  na ordem canônica `breakfast, morning_snack, lunch, afternoon_snack, dinner, supper`
  (3 → breakfast, lunch, dinner; 4 → + afternoon_snack; 5 → + morning_snack; 6 → + supper).
- **O6** `aiDietItemSchema`: `quantity_g > 0`, `calories ≥ 0`, macros ≥ 0 (structured output
  aceita `minimum`/`exclusiveMinimum`; o zod espelha).

### Bloco C — Chat: gating, histórico, respostas (A3, A4, A6, A12; D5, D8)

- **C1** `sendChatMessage`: consulta job `pending`/`running` do usuário (extrair a query de
  `createDietJob` para `getPendingJob(fastify, userId)`); se houver, a request vai **sem
  `tools`**. `hasActiveDiet` passa a ser `context.diet !== null || pendingJob !== null`.
- **C2** Marcadores no histórico: após `createDietJob`, mensagem de assistente
  `[Dieta de 7 dias iniciada em DD/MM às HH:MM]`; ao completar (`processJobStep`, ramo `done`),
  `[Dieta concluída — 7 dias]` no `chat_history` da `conversation_id` do job. O modelo passa a
  ver que gerou. O app renderiza como mensagem normal do coach (sem mudança no app).
- **C3** `finish_reason`: `length` → repetir **uma** vez com `reasoning_effort: 'minimal'` e
  `max_tokens: 4000`; persistindo → 502 `AI_TRUNCATED`, **nada persistido**. `content_filter` →
  422 `AI_CONTENT_FILTERED`. `parallel_tool_calls: false`. Tool com nome desconhecido → `warn` e
  tratado como resposta sem tool.
- **C4** `formatUserContext`: truncar por **linha**, ordem: metas → consumido → faltam → próxima
  refeição → perfil → restrições → streak. Nunca corta uma linha no meio.
- **C5** `persistHistory` propaga o erro; `sendChatMessage` responde 500 `HISTORY_WRITE_FAILED`.
  O app já trata falha de envio com retry (`lastFailedAction: 'send'`).
- **C6** `errorSchema` documenta os códigos novos: `AI_TRUNCATED`, `AI_CONTENT_FILTERED`,
  `HISTORY_WRITE_FAILED`, `ALLERGEN_IN_OUTPUT`, `DAY_VALIDATION_FAILED`, `RECONCILE_FAILED`.

### Bloco P — Operação, fase final cortável (A7, A10, A11)

- **OP1** Migração `017_diet_jobs_step_lock.sql`: `step_started_at TIMESTAMPTZ NULL`.
  `processJobStep` adquire: `UPDATE diet_jobs SET step_started_at = NOW() WHERE id = $1 AND
  status IN ('pending','running') AND (step_started_at IS NULL OR step_started_at < NOW() −
  interval '150 seconds') RETURNING id`; 0 linhas → devolve `toStatus(job)` **sem chamar IA**.
  Libera (`NULL`) ao persistir ou falhar. `rateLimit` 12/min em `/jobs/:id/step`.
- **OP2** `AI_DAILY_TOKEN_CAP` (env, default `200000`): `checkDailyQuota(fastify, userId)` soma
  `total_tokens` de `ai_usage` nas últimas 24 h; acima → 429 `AI_QUOTA_EXCEEDED` em chat, step e
  visão. Mensagem amigável no app (já existe tratamento de 429 no chat).
- **OP3** Visão: kcal clampado 0–3000; `KCAL_MACRO_MISMATCH` recalcula kcal pelos macros;
  `confidence < 0,5` → `uncertain: true` no item (`scanItemSchema`), o app mostra "estimativa
  incerta — confira". Cache 24 h por `sha256(image)` em tabela `scan_cache(hash, result, created_at)`
  (migração `018`).
- **OP4** `logAiUsage` ganha `conversationId?`, `jobId?`, `finishReason?`, `toolCalled?`
  (colunas opcionais em `ai_usage`, migração `019`). Consulta de alerta documentada no runbook:
  tool calls por conversa > 1 em 10 min.
- **OP5** Testes de contrato de prompt: snapshot de `assembleSystemPrompt` e `buildDayPrompt`
  para 3 perfis fixos. Eval offline: 6–8 conversas gravadas em `backend/evals/`, runner que
  chama o modelo mais barato e verifica "chamou a tool / não chamou"; `skip` por padrão,
  ligado por `RUN_AI_EVALS=1`.

---

## 5. Fora de escopo

- Moderação de conteúdo do usuário (OpenRouter não modera; um classificador é outro projeto).
- Dark mode, tablet, iOS — spec anterior.
- Persistir `dietJob` no app (com P1 no servidor, o custo de re-armar o polling é ~zero).
- Reescrever o toggle de refeição — verificado correto.

---

## 6. Critérios de aceite

- L1–L5 verdes; L3 ≤ 11.
- Cada função `[puro]` tem teste próprio cobrindo as bordas listadas no plano.
- Um dia gerado com alérgeno **nunca** chega a `diet_days` (teste de serviço com mock de db).
- Com job em andamento, a request ao modelo **não contém** `tools` (teste de serviço).
- `finish_reason: 'length'` sem recuperação **não** grava no histórico (teste de serviço).
- Nenhuma recusa por segurança retorna HTTP ≥ 400.
