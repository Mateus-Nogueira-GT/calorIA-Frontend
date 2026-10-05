# Feedbacks de uso — cardápio, coach, biotipo e refeição concluída

Data: 2026-10-05 · Branch: `feat/feedbacks-cardapio-coach-biotipo`

Quatro feedbacks de uso real. Entrega: app por **OTA** (iOS e Android, canal
`production`, mesmo fingerprint — nada nativo muda) e backend pelo deploy da
Vercel ao dar merge na `main`.

## F1 — Cardápio: nomes por extenso + fibras

**Hoje:** `MacroChips.tsx` mostra `kcal`, `P 20g`, `C 50g`, `G 10g` por
refeição. Fibra não existe em nenhuma camada da dieta (só na tabela `foods`).

**Quer:** `Proteína 20g`, `Carboidrato 50g`, `Gordura 10g`, `Fibra 6g`
(kcal continua `450 kcal`).

**Design:**
- Migration `020_diet_fiber.sql`: `diet_items.fiber_g`, `diet_meals.total_fiber`,
  `diet_days.total_fiber` — `NUMERIC(8,2)` **nullable**, sem default (dieta
  antiga = sem dado, não "0g").
- IA: `fiber_g` obrigatório no `aiDietItemSchema` (Structured Outputs exige todo
  campo obrigatório); prompt pede fibra por item.
- Persistência grava fibra **somente se a coluna existir**. As migrations rodam
  à mão no SQL Editor do Supabase, então o backend não pode depender da ordem
  "migration antes do deploy": checa `information_schema.columns` uma vez por
  processo (cache só do resultado positivo) e, sem a coluna, grava como hoje.
- Leitura (`getTodayPlan`) via `to_jsonb(dm)->>'total_fiber'` — funciona com
  ou sem a coluna (devolve null).
- API: `plannedMealSchema.fiber: number | null`.
- App: `PlannedMeal.fiber: number | null`; chip "Fibra Xg" só aparece se não
  for null.

**Limitação aceita:** dietas já geradas não têm fibra → o chip não aparece até
o usuário gerar uma dieta nova.

## F2 — Coach não pode reperguntar o que o cadastro já tem

**Causa raiz (investigada):**
1. O onboarding coleta nome, biotipo, altura, peso, objetivo, personalidade e
   **gênero do mentor** (`coach_gender`). Ele **não** coleta sexo do usuário,
   idade nem nível de atividade, e é exatamente isso que o coach exige.
2. A instrução `KNOWN_DATA_INSTRUCTION` é "tudo ou nada": só pula as perguntas
   se TODOS os 7 dados obrigatórios forem conhecidos. Com dados parciais, o
   modelo volta ao roteiro de entrevista e repergunta até peso e altura.
3. `goal = 'health'` (opção do onboarding) não existe no enum da tool
   `collect_diet_data` → o coach repergunta o objetivo.
4. `body_type` nunca entra no contexto do coach.

**Design:**
- Onboarding passa a perguntar **sexo** (Masculino/Feminino), **idade** (anos,
  13–100 → `birth_date = <ano atual - idade>-07-01`, mesma convenção do backend)
  e **nível de atividade** (5 opções do enum). Envia `gender`, `birth_date`,
  `activity_level`. A pergunta do mentor vira "Qual o gênero do seu mentor
  (o coach)?" para não confundir com o sexo do usuário.
- Prompt: instrução por campo. Todo dado em DADOS JÁ CONHECIDOS é usado
  **sem perguntar de novo** (no máximo uma confirmação única "uso estes dados,
  algo mudou?"); pergunta só os ausentes. Quando todos os obrigatórios são
  conhecidos, mantém o comportamento atual.
- `goal='health'` é mapeado para `maintain` na tool/schema (o rótulo
  "Melhorar saúde" continua no app). Biotipo entra em DADOS JÁ CONHECIDOS
  (exceto `unknown`).
- `weight_kg` passa por `Number()` no contexto (hoje vira "80.50kg").
- Eval: nova fixture "pós-onboarding" (peso, altura, idade, sexo, objetivo,
  atividade conhecidos; sem refeições/dia) → o coach **não** chama a tool e
  pergunta só as refeições/dia/saúde.

## F3 — Biotipo em linguagem leiga + "Ajude-me a descobrir"

**Opções novas** (mesmos `value`s no backend):
- 🦴 **Magro / Acelerado (Ectomorfo)**: "Dificuldade para ganhar peso, metabolismo rápido"
- 💪 **Atlético / Versátil (Mesomorfo)**: "Ganha músculo com facilidade, corpo naturalmente definido"
- 🏋️ **Largo (Endomorfo)**: "Ganha peso com facilidade, estrutura mais larga"
- ❓ **Ajude-me a descobrir**: "O mentor faz algumas perguntas rápidas"

**Ajude-me a descobrir:** o mentor (nas bolhas do chat do onboarding) faz 3
perguntas de múltipla escolha (estrutura óssea / punho, facilidade de ganhar
peso, onde acumula gordura). Cada resposta pontua ecto/meso/endo; vence o maior
(empate → mesomorfo). O mentor responde "Pelo que você me contou, seu biotipo é
**Atlético / Versátil (Mesomorfo)**", grava o valor e segue o fluxo. A
classificação é local e determinística: instantânea, funciona sem rede e sem
custo de IA, e o onboarding nem tem token definitivo ainda. As perguntas são
apresentadas pelo mentor de IA. As sub-perguntas não contam na barra de
progresso.

## F4 — "Marcar como concluída" dá erro

**Causa raiz:** `toggleMealCompleted` (`diets.service.ts`) faz
`SET ... updated_at = NOW()` em `diet_meals`, e essa tabela **não tem**
`updated_at` (006_diets.sql; nenhuma migration adiciona). O Postgres rejeita
→ 500 → "Não foi possível marcar a refeição". Os testes não pegavam porque o
banco é fake.

**Fix:** remover `updated_at = NOW()` do UPDATE (sem mudança de schema).
Teste de regressão: o SQL emitido não referencia `updated_at`. No app,
`MealPlanCard` chama o toggle sem tratar a rejeição (o store já mostra o
alerta e relança) → capturar para não gerar unhandled rejection.

## Fora de escopo
- Abreviações P/C/G na tela do scanner (`ScanItemRow`) — feedback foi do cardápio.
- Editar biotipo/sexo/idade depois do onboarding (tela de perfil).
- Fibra no food-log/scanner.

## Entrega
1. PR → CI verde → merge na `main`.
2. Vercel faz deploy do backend (F2, F4, F1-backend).
3. Workflow **OTA update** publica o app no canal `production` (iOS + Android).
4. **Ação manual:** rodar `020_diet_fiber.sql` no SQL Editor do Supabase.
   Antes disso o backend funciona normalmente, só sem fibra.
