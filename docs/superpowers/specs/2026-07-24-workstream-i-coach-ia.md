# Spec — Workstream I: Qualidade do Coach IA

**Data:** 2026-07-24
**Origem:** Avaliação do agente de IA pós-auditoria (pontos 1–5 do relatório).
**Pré-requisito:** branch `fix/spec-auditoria` (PR #10) — usa `completedToday`, datas locais (Workstream A) e o fluxo draft/retry de dieta (Workstream B).

---

## 1. Objetivo

Transformar o coach de um coletor de formulário em um coach que **conhece o usuário**, gerar dietas **variadas e que batem a meta**, e **reduzir/medir o custo** de IA. Cinco entregas (I1–I5), independentes entre si exceto onde indicado.

## 2. Decisões de design (fechadas)

| # | Decisão | Escolha |
|---|---------|---------|
| DI1 | Onde entra o contexto do usuário | Bloco de texto compacto **no system prompt**, montado por request (sem RAG/embedding — os dados são poucos e estruturados) |
| DI2 | Orçamento do bloco de contexto | ≤ ~350 tokens (~1.400 chars); falha na montagem **nunca** bloqueia o chat (contexto parcial) |
| DI3 | Fonte do "hoje" no chat | Cliente envia `date`/`tzOffsetMinutes` no body (convenção do Workstream A); ausentes → UTC |
| DI4 | Correção de calorias do dia | **Determinística** (escala proporcional das quantidades), não re-chamada ao modelo; tolerância ±10%, fator limitado a [0.6, 1.6] |
| DI5 | Modelo da geração de dias | Env nova `OPENAI_DIET_MODEL`; **default = `OPENAI_MODEL`** (custo só muda com opt-in explícito na Vercel) |
| DI6 | Telemetria de uso | `fastify.log.info` estruturado (`ai_usage`) — sem tabela nova nesta spec |
| DI7 | Fallback de modelos | Parâmetro `models: [...]` do OpenRouter via env `OPENAI_FALLBACK_MODELS` (CSV, opcional; vazio = comportamento atual) |
| DI8 | `meals_per_day` na pré-coleta | Recuperado do `input` do último `diet_job` (não existe no perfil; sem migration) |

## 3. Requisitos

### I1 — Contexto do usuário no coach *(ponto 1 — maior impacto)*

**Problema:** o system prompt ([chat.service.ts:12](../../../backend/src/modules/chat/chat.service.ts#L12)) não recebe nada do estado do usuário; as sugestões da tela ("Analise meu dia", "Como bater minha meta de proteína?") produzem respostas genéricas.

- **I1.1** Novo módulo `backend/src/modules/chat/chat-context.ts` com:
  - `fetchUserContext(fastify, userId, query: TodayQuery): Promise<UserContextData>` — coleta tolerante a falha (cada fonte em try/catch, campo `null` quando indisponível): perfil (peso, altura, birth_date→idade, sexo, objetivo, atividade, restrições, alergias), dieta ativa (nome + metas kcal/P/C/G via `getActiveDiet`), plano de hoje (`getTodayPlan(fastify, userId, query)` — refeições com `completedToday`), diário livre do dia (`listMeals(fastify, userId, date)`), streak (`SELECT current_streak FROM streaks`).
  - `formatUserContext(data: UserContextData): string` — **função pura** que monta o bloco rotulado, ex.:
    ```
    ## CONTEXTO DO USUÁRIO (dados reais — use-os; não invente valores)
    Perfil: 82kg, 178cm, 31 anos, masculino, objetivo: perder peso, atividade: moderada.
    Restrições: sem lactose. Alergias: amendoim.
    Dieta ativa: "Plano personalizado" — meta 2100 kcal | 148g prot | 210g carb | 58g gord.
    Hoje (2026-07-24): consumidas 1240 kcal / 86g prot (plano: 2 de 4 refeições concluídas; diário livre: 1 item).
    Faltam: 860 kcal, 62g proteína. Próxima refeição do plano: Jantar (19h) — 620 kcal.
    Streak atual: 5 dias.
    ```
    Limite duro de 1.400 caracteres (trunca restrições/itens se necessário). Seções sem dado são omitidas.
- **I1.2** `sendChatMessage` injeta o bloco após o system prompt de personalidade. Instrução adicional no prompt: *"Quando o usuário perguntar sobre o dia/metas/progresso, responda com os números do CONTEXTO. Não invente valores que não estejam nele."*
- **I1.3** `chatMessageBodySchema` ([chat.schemas.ts](../../../backend/src/modules/chat/chat.schemas.ts)) ganha `date` (localDateSchema, opcional) e `tzOffsetMinutes` (opcional) — mesma validação do Workstream A.
- **I1.4** App: `coachService.sendMessage` ([coach.service.ts](../../../app/src/shared/services/coach.service.ts)) envia `date: todayString()` e `tzOffsetMinutes: tzOffsetMinutes()`.
- **I1.5** Testes (`chat-context.test.ts`): formatação com dados completos, parciais (só perfil), vazios (string vazia), e teto de 1.400 chars com 20 restrições.

### I2 — Pré-preencher a coleta com o perfil *(ponto 2)*

**Problema:** usuário recorrente responde as 7 perguntas de novo a cada dieta.

- **I2.1** `sendChatMessage` amplia o SELECT do perfil (hoje só `coach_personality`) para incluir `weight_kg, height_cm, birth_date, gender, goal, activity_level, dietary_restrictions, allergies`; busca também `meals_per_day` do último `diet_jobs.input` (via `parseInput` já existente — DI8).
- **I2.2** Função pura `formatKnownData(profile, mealsPerDay): string` gera o bloco `## DADOS JÁ CONHECIDOS` listando apenas campos preenchidos, com a idade derivada do `birth_date`.
- **I2.3** Instrução no system prompt: *"Se TODOS os dados obrigatórios constam em DADOS JÁ CONHECIDOS, faça UMA única mensagem de confirmação resumindo-os e perguntando se algo mudou. Se o usuário confirmar, chame collect_diet_data com esses valores. Pergunte individualmente apenas os campos ausentes ou que o usuário disser que mudaram."*
- **I2.4** Testes: bloco presente com perfil completo; ausente com perfil vazio; parcial lista só o que existe.
- **Nota:** I1 e I2 compartilham o fetch do perfil — implementar juntos evita query duplicada.

### I3 — Variedade entre os dias da dieta *(ponto 3)*

**Problema:** cada `/step` gera um dia sem ver os anteriores ([jobs.service.ts:229](../../../backend/src/modules/diets/jobs.service.ts#L229)) — "varie os alimentos" é impossível de obedecer.

- **I3.1** Antes da chamada de IA no `processJobStep`, 1 query: alimentos dos dias já gerados da dieta —
  `SELECT dd.day_name, ARRAY_AGG(di.food_name ORDER BY di.calories DESC) AS foods FROM diet_days dd JOIN diet_meals dm ON ... JOIN diet_items di ON ... WHERE dd.diet_id = ${dietId} GROUP BY dd.day_number, dd.day_name ORDER BY dd.day_number`.
- **I3.2** Função pura `summarizePreviousDays(rows: {day_name, foods: string[]}[]): string` — até **8 alimentos por dia**, teto total de 600 caracteres, formato `Segunda: frango grelhado, arroz integral, …`. Vazio (dia 1) → string vazia.
- **I3.3** `buildDayPrompt` ganha a seção (quando não vazia):
  ```
  DIAS JÁ GERADOS — para garantir variedade, evite repetir a mesma proteína
  principal do almoço/jantar em dias consecutivos e varie os carboidratos:
  <resumo>
  ```
- **I3.4** Testes: resumo vazio no dia 1; 8 alimentos no máximo por dia; teto de 600 chars; prompt do dia 3 contém os nomes dos dias 1–2.

### I4 — Validação ±10% + correção determinística *(ponto 4)*

**Problema:** nada confere o dia gerado contra a meta; e [jobs.service.ts:276](../../../backend/src/modules/diets/jobs.service.ts#L276) grava `meal.total_calories` do modelo enquanto os macros vêm da soma dos itens (inconsistente).

- **I4.1** Função pura `reconcileDay(day: AiSingleDay, targetCalories: number): { day: AiSingleDay; scaled: boolean; factor: number }` em `jobs.service.ts`:
  - Soma kcal de todos os itens. Desvio ≤ 10% → retorna intacto (`scaled: false`, `factor: 1`).
  - Desvio > 10% → `factor = targetCalories / total`, **limitado a [0.6, 1.6]**; multiplica `quantity_g, calories, protein_g, carbs_g, fat_g` de cada item pelo fator. Arredondamento: valores ≥ 10 → inteiro; < 10 → 1 casa decimal (preserva "1 unidade" → "1.2 unidade" em vez de sumir).
- **I4.2** `processJobStep` aplica `reconcileDay(aiDay, targets.targetCalories)` entre a geração e a persistência; quando `scaled`, loga `fastify.log.info({ jobId, dayNumber, factor, before, after }, 'Dia reescalonado para a meta')`.
- **I4.3** Consistência: o INSERT de `diet_meals` passa a somar **também** `total_calories` dos itens (`meal.items.reduce`), como já faz com os macros. `dayTotals` permanece somando itens.
- **I4.4** Testes: dia dentro da tolerância intacto; dia 30% acima escala para ±1% da meta com macros proporcionais; fator clampado quando a geração vier absurda (ex.: 3× a meta → aplica 0.6 e loga); arredondamento (95.3g → 95; 1.24 unidade → 1.2).

### I5 — Custo, telemetria e resiliência *(ponto 5)*

- **I5.1** Env nova em [env.ts](../../../backend/src/shared/env.ts): `OPENAI_DIET_MODEL` (mesmo `preprocess` de vazio→default; **default: valor de `OPENAI_MODEL`**). `processJobStep` usa `env.OPENAI_DIET_MODEL`. `createDietJob` grava esse modelo em `diets.ai_model`.
- **I5.2** Env nova `OPENAI_FALLBACK_MODELS` (string CSV, opcional). Helper puro `parseFallbackModels(csv: string | undefined): string[]` (trim, remove vazios). Quando não-vazio, as chamadas de chat/step/vision incluem `models: [modeloPrimário, ...fallbacks]` no body (parâmetro OpenRouter; passa pelo SDK OpenAI como campo extra — cast local `as never`/comentário explicando).
- **I5.3** Helper `logAiUsage(fastify, params: { feature: 'chat' | 'diet_day' | 'vision'; model: string; userId: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })` em `backend/src/shared/ai-usage.ts` → `fastify.log.info({ ai_usage: {...} })`. Chamado após **cada** completion nos 3 pontos (chat, step, scanner) com `completion.usage`. Nunca lança (try/catch interno).
- **I5.4** [.env.example](../../../backend/.env.example) documenta as duas envs novas com exemplo de uso (`OPENAI_DIET_MODEL=openai/gpt-5-mini`, `OPENAI_FALLBACK_MODELS=openai/gpt-4.1,google/gemini-2.5-pro`).
- **I5.5** Testes: `parseFallbackModels` (CSV com espaços/vazios); `logAiUsage` não lança sem `usage`.

## 4. Critérios de aceite

1. **I1:** perguntar "quanta proteína falta hoje?" com dieta ativa e 2 refeições concluídas → resposta cita os gramas restantes coerentes com o banco (verificável em dev com seed). Payload do system prompt cresce ≤ 1.400 chars. Chat continua funcionando se o banco de contexto falhar (simulado).
2. **I2:** usuário com perfil completo pede nova dieta → o coach confirma os dados em **1 mensagem** (não refaz as 7 perguntas); usuário sem perfil segue o fluxo atual.
3. **I3:** gerar dieta completa em dev → nenhum par de dias consecutivos com a mesma proteína principal no almoço (inspeção manual) e o prompt do dia N contém o resumo dos dias 1..N-1 (teste unitário).
4. **I4:** dia mockado com 2.730 kcal para meta de 2.100 → persiste ~2.100 (±1%) com macros e gramas escalados; dia com 2.150 persiste intacto.
5. **I5:** com `OPENAI_DIET_MODEL` setado, `diets.ai_model` registra o modelo barato; cada chamada de IA emite 1 linha `ai_usage` com tokens; com `OPENAI_FALLBACK_MODELS` setado, o body da chamada contém `models` (teste de unidade sobre o objeto de request).
6. Suítes existentes continuam verdes (backend `vitest`, app `jest` na baseline).

## 5. Fora de escopo

- Streaming SSE no chat (ponto 7).
- Scanner itemizado / detail high (ponto 6).
- Guardrails de saúde ampliados e tool-feedback no histórico (ponto 8) — *exceto* a instrução mínima de "não inventar valores fora do contexto" (I1.2).
- Tabela de usage/custos no banco (DI6 registra só em log).
- Grounding na tabela `foods` (RAG) — evolução futura.

## 6. Ordem de execução sugerida

| Ordem | Item | Racional |
|---|---|---|
| 1 | **I5** | Base transversal (envs + logging) — as demais entregas já nascem instrumentadas |
| 2 | **I4 + I3** | Só tocam `jobs.service`; funções puras com testes diretos |
| 3 | **I2 + I1** | Compartilham o fetch de perfil; I1 depende do contrato de data local no body do chat |

## 7. Rastreabilidade

| Ponto do relatório | Requisitos |
|---|---|
| 1. Coach cego (sem contexto) | I1.1–I1.5 |
| 2. Recoleta das 7 perguntas | I2.1–I2.4 |
| 3. Dias gerados às cegas | I3.1–I3.4 |
| 4. Sem validação numérica + total_calories inconsistente | I4.1–I4.4 |
| 5. Custo/telemetria/fallback | I5.1–I5.5 |
