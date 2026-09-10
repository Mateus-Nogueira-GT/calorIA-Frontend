# Guardrails da camada de IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa.
> Passos usam checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-09-09-guardrails-ia-coach-design.md`

**Goal:** Fazer o servidor garantir, por código determinístico, o que hoje só o prompt pede:
dados plausíveis, nenhum alérgeno na dieta, dias coerentes com a meta, chat que sabe que já
gerou, e respostas truncadas que nunca chegam ao histórico.

**Architecture:** Um módulo novo de funções puras (`backend/src/shared/guardrails/`) sem
Fastify, banco ou OpenAI, chamado em três pontos que já existem: antes de criar o job
(`handleDietGeneration`), depois de gerar um dia (`processJobStep`) e ao montar a request do
chat (`sendChatMessage`). Prompt orienta; código garante. Toda recusa por segurança volta como
texto do coach, não como erro HTTP.

**Tech Stack:** Fastify 5 + zod 3 + `openai` SDK **4.104** (OpenRouter) + postgres.js no
backend, vitest para testes; React Native + zustand + jest no app.

---

## Global Constraints

- **Branch:** criar `feat/guardrails-ia-coach` a partir de `fix/android-ios-review-apple`
  (`8971f19`), porque a correção do loop (`cba29e5`) e a spec vivem lá. Quando o PR #44 for
  mesclado, `git rebase main`. Nunca commitar na `main`.
- Comandos do backend rodam em `backend/`; os do app em `app/`. `node_modules` não vem no
  repositório — `npm install` em ambos antes de começar.
- **Baseline medido (2026-09-09):** backend `npm test` → 121 testes / 15 arquivos verdes;
  `npm run typecheck` → limpo; `npm run lint` → **11 erros pré-existentes** (mesmos da `main`);
  app `./node_modules/.bin/jest --ci` → 308 verdes; `./node_modules/.bin/tsc --noEmit` → limpo.
  Nenhuma tarefa pode piorar nenhum dos cinco. Lint: "≤ 11" é o critério, não "zero".
- **Sem chave de IA nesta máquina.** Nenhuma tarefa pode depender de chamar o modelo. A
  única exceção é o eval opt-in da Task 20, que fica `skip` por padrão.
- Arquivos em `shared/guardrails/` **não importam** `fastify`, `postgres`, `openai` nem nada
  de `modules/`. Só `zod`, tipos de `shared/diet-ai-schema.ts` e Node puro.
- Estilo: biome (aspas simples, sem ponto-e-vírgula, largura 100). Rodar `npm run format`
  antes de cada commit do backend.
- Mensagens ao usuário em pt-BR; códigos de erro em SCREAMING_SNAKE; comentários explicam o
  "porquê", como o resto do código.
- Commits pequenos, um por tarefa, mensagem em pt-BR no padrão do repo
  (`feat(coach): …`, `fix(diets): …`, `test: …`), terminando com
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

### Desvios declarados da spec

- **O6 (bounds no schema do structured output)** — NÃO vai para `aiDietItemSchema`.
  `zodResponseFormat` liga `strict: true`, e uma keyword não suportada pelo provedor derruba a
  geração inteira em produção, sem como testar aqui. As mesmas garantias (`quantity_g > 0`,
  macros ≥ 0) são entregues pela Task 8 (`NON_POSITIVE_QUANTITY`, `NEGATIVE_MACRO`) com o
  mecanismo de retry-com-feedback, que é mais útil do que um erro de schema.
- **C3 `reasoning_effort: 'minimal'`** — o tipo `ReasoningEffort` do SDK 4.104 é
  `'low' | 'medium' | 'high' | null`. O valor entra por spread de um `Record<string, unknown>`
  (o mesmo truque de `buildModelsField` para `models`), com comentário. A API aceita.

---

## Estrutura de arquivos

**Novos (backend):**

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/guardrails/collected-data.ts` | `assessSafety` (IMC/idade/condições), `bmi`, `describeInvalidFields` (mensagem por campo inválido) |
| `src/shared/guardrails/allergens.ts` | `normalizeFoodText`, mapas de sinônimos/restrições/exceções, `checkAllergens` |
| `src/shared/guardrails/day.ts` | `MEAL_TYPE_ORDER`, `mealTypesFor`, `fixItemCalories`, `validateDay`, `reconcileDay` (movido de jobs.service), `reconcileOrFail`, `describeViolations` |
| `src/shared/guardrails/index.ts` | reexports + `applyDayGuardrails` (composição: alérgenos → kcal → reconcile → validação) |
| `src/shared/guardrails/vision.ts` | `sanitizeVisionResult` (Fase D) |
| `src/shared/testing/fake-fastify.ts` | mock de `fastify.db`/`log`/`openai` para testes de serviço |
| `src/evals/` | fixtures + runner opt-in (Fase D) |
| `supabase/migrations/017_diet_jobs_step_lock.sql`, `018_scan_cache.sql`, `019_ai_usage_context.sql` | Fase D |
| `docs/operacao-ia.md` | consulta de alerta + variáveis novas (Fase D) |

**Modificados (backend):** `src/shared/diet-ai-schema.ts`, `src/shared/env.ts`,
`src/shared/ai-usage.ts`, `src/modules/chat/chat.service.ts`, `src/modules/chat/chat-context.ts`,
`src/modules/chat/chat.routes.ts`, `src/modules/diets/jobs.service.ts`,
`src/modules/diets/diets.routes.ts`, `src/modules/scanner/scanner.service.ts`,
`src/modules/scanner/scanner.schemas.ts`, `src/modules/scanner/scanner.routes.ts`, `.env.example`.

**Modificados (app, só Fase D):** `src/features/coach/store.ts`,
`src/shared/services/scanner.service.ts`, `src/features/scanner/components/ScanItemRow.tsx`.

**Ordem das fases:** A (coleta) → B (dia) → C (chat) → D (operação, cortável). A e B são
independentes entre si; C depende de A (campo `health_conditions`) e de B só na Task 15
(marcador de conclusão em `processJobStep`). D depende de tudo.

---

## Fase A — Segurança da coleta (bloco S)

### Task 1: bounds no schema e na tool + campo `health_conditions` (S1)

**Files:**
- Modify: `backend/src/shared/diet-ai-schema.ts:59-72`
- Modify: `backend/src/modules/chat/chat.service.ts:135-181` (`COLLECT_DIET_DATA_TOOL`)
- Modify: `backend/src/modules/diets/jobs.service.test.ts:34-46` (fixture `base`)
- Test: `backend/src/shared/diet-ai-schema.test.ts` (novo)

**Interfaces:**
- Produces: `CollectedUserData.health_conditions: string[]` (sempre presente após o parse —
  `.default([])`, para jobs gravados antes desta mudança continuarem parseáveis).
- Produces: `SAFETY_LIMITS` NÃO fica aqui — os números ficam no zod; a Task 3 os lê de lá
  via constantes exportadas `COLLECTED_BOUNDS`.

- [ ] **Step 1: teste que falha**

```ts
// backend/src/shared/diet-ai-schema.test.ts
import { describe, expect, it } from 'vitest'
import { COLLECTED_BOUNDS, collectedUserDataSchema } from './diet-ai-schema.js'

const valido = {
  weight_kg: 80,
  height_cm: 180,
  age: 30,
  gender: 'male',
  goal: 'maintain',
  activity_level: 'moderate',
  meals_per_day: 4,
  dietary_restrictions: [],
  allergies: [],
  food_preferences: null,
  message_to_user: 'ok',
  health_conditions: [],
}

describe('collectedUserDataSchema — bounds de plausibilidade (S1)', () => {
  it('aceita um perfil comum', () => {
    expect(collectedUserDataSchema.safeParse(valido).success).toBe(true)
  })

  it.each([
    ['weight_kg', 29.9],
    ['weight_kg', 300.1],
    ['height_cm', 119],
    ['height_cm', 251],
    ['age', 9],
    ['age', 101],
    ['meals_per_day', 2],
    ['meals_per_day', 7],
  ])('rejeita %s = %s', (campo, valor) => {
    const r = collectedUserDataSchema.safeParse({ ...valido, [campo]: valor })
    expect(r.success).toBe(false)
  })

  it('aceita as bordas inclusivas', () => {
    expect(collectedUserDataSchema.safeParse({ ...valido, weight_kg: 30 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, weight_kg: 300 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, height_cm: 120 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, height_cm: 250 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, age: 10 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, age: 100 }).success).toBe(true)
  })

  it('altura em metros (1.75) é rejeitada — o servidor pede confirmação em vez de calcular BMR absurdo', () => {
    expect(collectedUserDataSchema.safeParse({ ...valido, height_cm: 1.75 }).success).toBe(false)
  })

  it('listas: até 10 itens de até 40 chars; preferências até 300 chars', () => {
    const onze = Array.from({ length: 11 }, (_, i) => `item${i}`)
    expect(collectedUserDataSchema.safeParse({ ...valido, allergies: onze }).success).toBe(false)
    expect(
      collectedUserDataSchema.safeParse({ ...valido, allergies: ['a'.repeat(41)] }).success,
    ).toBe(false)
    expect(
      collectedUserDataSchema.safeParse({ ...valido, food_preferences: 'x'.repeat(301) }).success,
    ).toBe(false)
    expect(
      collectedUserDataSchema.safeParse({ ...valido, health_conditions: onze }).success,
    ).toBe(false)
  })

  it('health_conditions ausente vira [] (jobs gravados antes desta versão)', () => {
    const { health_conditions: _omit, ...semCampo } = valido
    const r = collectedUserDataSchema.safeParse(semCampo)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.health_conditions).toEqual([])
  })

  it('exporta os bounds para reuso (prompt, mensagens de erro)', () => {
    expect(COLLECTED_BOUNDS.weightKg).toEqual([30, 300])
    expect(COLLECTED_BOUNDS.heightCm).toEqual([120, 250])
    expect(COLLECTED_BOUNDS.age).toEqual([10, 100])
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/diet-ai-schema.test.ts`
Expected: FAIL — `COLLECTED_BOUNDS` não existe; bounds não rejeitam.

- [ ] **Step 3: implementar no zod**

```ts
// backend/src/shared/diet-ai-schema.ts — substituir o bloco "Dados coletados pelo chat"

/**
 * Limites de plausibilidade (S1 da spec de guardrails). Fora deles o servidor
 * NÃO calcula metas: pede confirmação ao usuário (altura em metros, peso em
 * libras e idade impossível chegavam ao BMR sem ninguém conferir).
 *
 * age começa em 10, não 18, de propósito (D7): queremos que o modelo REPORTE
 * 15 anos para o servidor recusar com a mensagem certa, em vez de o modelo
 * "arredondar" para 18 só para passar no schema.
 */
export const COLLECTED_BOUNDS = {
  weightKg: [30, 300],
  heightCm: [120, 250],
  age: [10, 100],
  mealsPerDay: [3, 6],
  listMaxItems: 10,
  listItemMaxChars: 40,
  preferencesMaxChars: 300,
} as const

const shortList = z
  .array(z.string().max(COLLECTED_BOUNDS.listItemMaxChars))
  .max(COLLECTED_BOUNDS.listMaxItems)

/** Dados coletados pelo chat antes de gerar a dieta */
export const collectedUserDataSchema = z.object({
  weight_kg: z.number().min(COLLECTED_BOUNDS.weightKg[0]).max(COLLECTED_BOUNDS.weightKg[1]),
  height_cm: z.number().min(COLLECTED_BOUNDS.heightCm[0]).max(COLLECTED_BOUNDS.heightCm[1]),
  age: z.number().int().min(COLLECTED_BOUNDS.age[0]).max(COLLECTED_BOUNDS.age[1]),
  gender: z.enum(['male', 'female', 'other']),
  goal: z.enum(['lose_weight', 'maintain', 'gain_muscle', 'gain_weight']),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  meals_per_day: z
    .number()
    .int()
    .min(COLLECTED_BOUNDS.mealsPerDay[0])
    .max(COLLECTED_BOUNDS.mealsPerDay[1]),
  dietary_restrictions: shortList,
  allergies: shortList,
  food_preferences: z.string().max(COLLECTED_BOUNDS.preferencesMaxChars).nullable(),
  message_to_user: z.string(),
  // Gestação, diagnóstico, transtorno alimentar… (D2). Default [] para jobs
  // gravados antes desta versão continuarem parseáveis em processJobStep.
  health_conditions: shortList.default([]),
})
```

- [ ] **Step 4: espelhar na tool (JSON schema)**

Em `chat.service.ts`, dentro de `COLLECT_DIET_DATA_TOOL.function.parameters`:

```ts
      required: [
        'weight_kg',
        'height_cm',
        'age',
        'gender',
        'goal',
        'activity_level',
        'meals_per_day',
        'message_to_user',
        'dietary_restrictions',
        'allergies',
        'food_preferences',
        'health_conditions',
      ],
      properties: {
        weight_kg: { type: 'number', minimum: 30, maximum: 300, description: 'Peso em kg' },
        height_cm: {
          type: 'number',
          minimum: 120,
          maximum: 250,
          description: 'Altura em centímetros (175, nunca 1.75)',
        },
        age: { type: 'integer', minimum: 10, maximum: 100, description: 'Idade em anos' },
        gender: { type: 'string', enum: ['male', 'female', 'other'] },
        goal: { type: 'string', enum: ['lose_weight', 'maintain', 'gain_muscle', 'gain_weight'] },
        activity_level: {
          type: 'string',
          enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        },
        meals_per_day: { type: 'integer', minimum: 3, maximum: 6 },
        dietary_restrictions: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', maxLength: 40 },
        },
        allergies: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 40 } },
        health_conditions: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', maxLength: 40 },
          description:
            'Gestação/amamentação, doenças diagnosticadas (diabetes, renal, cardíaca…), ' +
            'transtorno alimentar, medicação contínua. Vazio se o usuário disse não ter nenhuma.',
        },
        food_preferences: {
          type: ['string', 'null'],
          maxLength: 300,
          description: 'Preferências e aversões alimentares',
        },
        message_to_user: {
          type: 'string',
          description: 'Mensagem encorajadora enquanto a dieta é gerada',
        },
      },
```

E na `description` da tool, acrescentar ao final: `' Pergunte antes sobre gestação e condições de saúde e preencha health_conditions.'`

- [ ] **Step 5: atualizar a fixture de `jobs.service.test.ts`**

No objeto `base` (linha 34), acrescentar `health_conditions: [],` depois de `food_preferences: null,`.

- [ ] **Step 6: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: typecheck limpo; 121 + 7 novos = 128 testes verdes.

- [ ] **Step 7: commit**

```bash
cd backend && npm run format && git add src/shared/diet-ai-schema.ts src/shared/diet-ai-schema.test.ts src/modules/chat/chat.service.ts src/modules/diets/jobs.service.test.ts
git commit -m "feat(coach): limites de plausibilidade nos dados coletados e campo health_conditions

Peso 30–300 kg, altura 120–250 cm, idade 10–100, listas curtas. Fora disso o
servidor não calcula metas (S1 da spec de guardrails). O campo novo é o que
permite recusar gestação/condição diagnosticada por código, não por prompt.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: piso calórico 1200/1500 (S5)

**Files:**
- Modify: `backend/src/modules/diets/jobs.service.ts:38-51` (`computeTargets`)
- Modify: `backend/src/modules/diets/jobs.service.test.ts:72-83`

- [ ] **Step 1: trocar o teste "nunca abaixo de 1000" por dois testes**

Substituir o `it('nunca retorna alvo abaixo de 1000 kcal', …)` por:

```ts
  it('piso de 1200 kcal para mulheres (mínimo sem supervisão)', () => {
    const t = computeTargets({
      ...base,
      weight_kg: 35,
      height_cm: 140,
      age: 80,
      gender: 'female',
      activity_level: 'sedentary',
      goal: 'lose_weight',
    })
    expect(t.targetCalories).toBe(1200)
  })

  it('piso de 1500 kcal para homens e "outro"', () => {
    const magro = { ...base, weight_kg: 40, height_cm: 150, age: 90, activity_level: 'sedentary' as const, goal: 'lose_weight' as const }
    expect(computeTargets({ ...magro, gender: 'male' }).targetCalories).toBe(1500)
    expect(computeTargets({ ...magro, gender: 'other' }).targetCalories).toBe(1500)
  })
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/diets/jobs.service.test.ts`
Expected: FAIL — hoje retorna 1000.

- [ ] **Step 3: implementar**

```ts
// jobs.service.ts — dentro de computeTargets, substituir a linha do targetCalories
  // S5: piso mínimo sem supervisão profissional. 1000 (antes) fica abaixo do
  // que qualquer diretriz recomenda; abaixo do piso o plano vira risco.
  const floor = u.gender === 'female' ? MIN_CALORIES_FEMALE : MIN_CALORIES_OTHER
  const targetCalories = Math.max(floor, Math.round(tdee + adjust))
```

E, acima da função (junto de `TOTAL_DAYS`):

```ts
export const MIN_CALORIES_FEMALE = 1200
export const MIN_CALORIES_OTHER = 1500
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/modules/diets/jobs.service.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/diets/jobs.service.ts src/modules/diets/jobs.service.test.ts
git commit -m "fix(diets): piso calórico 1200 (F) / 1500 (M, outro) no lugar de 1000

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `assessSafety` — IMC, idade, condições (S2)

**Files:**
- Create: `backend/src/shared/guardrails/collected-data.ts`
- Create: `backend/src/shared/guardrails/index.ts`
- Test: `backend/src/shared/guardrails/collected-data.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function bmi(weightKg: number, heightCm: number): number
  export type SafetyReason = 'MINOR' | 'HEALTH_CONDITION' | 'UNDERWEIGHT_DEFICIT'
  export type SafetyAssessment =
    | { ok: true; warning: 'HIGH_BMI' | null; warningMessage: string | null }
    | { ok: false; reason: SafetyReason; userMessage: string }
  export function assessSafety(
    data: Pick<CollectedUserData, 'age' | 'weight_kg' | 'height_cm' | 'goal' | 'health_conditions'>,
  ): SafetyAssessment
  export const SAFETY_THRESHOLDS = { minAdultAge: 18, bmiUnderweight: 18.5, bmiHigh: 40 } as const
  ```
- Consumes: `CollectedUserData` da Task 1.

- [ ] **Step 1: teste que falha**

```ts
// backend/src/shared/guardrails/collected-data.test.ts
import { describe, expect, it } from 'vitest'
import { assessSafety, bmi } from './collected-data.js'

const adulto = {
  age: 30,
  weight_kg: 70,
  height_cm: 175,
  goal: 'lose_weight' as const,
  health_conditions: [] as string[],
}

describe('bmi', () => {
  it('70 kg / 175 cm → 22.9', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2)
  })
})

describe('assessSafety (S2) — ordem: menor → condição → IMC baixo+déficit → IMC alto', () => {
  it('adulto saudável, IMC normal: ok sem aviso', () => {
    expect(assessSafety(adulto)).toEqual({ ok: true, warning: null, warningMessage: null })
  })

  it('menor de 18 é recusado antes de qualquer outra regra', () => {
    const r = assessSafety({ ...adulto, age: 17, health_conditions: ['diabetes'] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('MINOR')
      expect(r.userMessage).toMatch(/menos de 18/)
    }
  })

  it('condição de saúde: recusa e cita a condição na mensagem', () => {
    const r = assessSafety({ ...adulto, health_conditions: ['gestante'] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('HEALTH_CONDITION')
      expect(r.userMessage).toContain('gestante')
      expect(r.userMessage).toMatch(/nutricionista ou médico/)
    }
  })

  it('IMC 18.4 + perder peso: recusa o déficit e oferece manutenção', () => {
    // 50 kg / 165 cm = 18.37
    const r = assessSafety({ ...adulto, weight_kg: 50, height_cm: 165, goal: 'lose_weight' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('UNDERWEIGHT_DEFICIT')
      expect(r.userMessage).toMatch(/MANUTENÇÃO/)
    }
  })

  it('IMC 18.4 + manter peso: ok (só o déficit é bloqueado)', () => {
    const r = assessSafety({ ...adulto, weight_kg: 50, height_cm: 165, goal: 'maintain' })
    expect(r.ok).toBe(true)
  })

  it('IMC exatamente 18.5 + perder peso: ok (limite é exclusivo)', () => {
    // 18.5 * 1.65^2 = 50.36 kg
    const r = assessSafety({ ...adulto, weight_kg: 50.4, height_cm: 165, goal: 'lose_weight' })
    expect(r.ok).toBe(true)
  })

  it('IMC 40.1: gera com aviso HIGH_BMI', () => {
    // 110 kg / 165 cm = 40.4
    const r = assessSafety({ ...adulto, weight_kg: 110, height_cm: 165 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warning).toBe('HIGH_BMI')
      expect(r.warningMessage).toMatch(/acompanhamento médico/)
    }
  })

  it('IMC exatamente 40: sem aviso (limite é exclusivo)', () => {
    // 40 * 1.65^2 = 108.9
    const r = assessSafety({ ...adulto, weight_kg: 108.9, height_cm: 165 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warning).toBeNull()
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/guardrails/collected-data.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: implementar**

```ts
// backend/src/shared/guardrails/collected-data.ts
import type { CollectedUserData } from '../diet-ai-schema.js'

/**
 * Avaliação de segurança dos dados coletados (S2 da spec de guardrails).
 * Função pura: sem banco, sem modelo. As mensagens já vêm prontas para o
 * coach devolver — a recusa é TEXTO na conversa, nunca um HTTP 4xx (D5).
 */

export const SAFETY_THRESHOLDS = {
  minAdultAge: 18,
  bmiUnderweight: 18.5,
  bmiHigh: 40,
} as const

export type SafetyReason = 'MINOR' | 'HEALTH_CONDITION' | 'UNDERWEIGHT_DEFICIT'

export type SafetyAssessment =
  | { ok: true; warning: 'HIGH_BMI' | null; warningMessage: string | null }
  | { ok: false; reason: SafetyReason; userMessage: string }

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

const MINOR_MESSAGE =
  'Obrigado por compartilhar! Como você tem menos de 18 anos, não posso montar um plano ' +
  'alimentar por aqui — nessa fase o acompanhamento precisa ser feito com um responsável e ' +
  'um nutricionista ou pediatra. Posso continuar tirando dúvidas gerais sobre alimentação, ' +
  'se quiser.'

const UNDERWEIGHT_MESSAGE =
  'Pelo seu peso e altura, seu IMC está abaixo de 18,5 — por segurança, não vou montar um ' +
  'plano de perda de peso. Posso montar um plano de MANUTENÇÃO, com calorias equilibradas ' +
  'para o seu corpo. Quer que eu faça isso?'

const HIGH_BMI_WARNING =
  'Observação: como seu IMC está acima de 40, montei o plano com um piso seguro de calorias ' +
  'e recomendo acompanhamento médico junto com a dieta.'

function healthConditionMessage(conditions: string[]): string {
  const lista = conditions.join(', ')
  return (
    `Obrigado por me contar sobre: ${lista}. Nesses casos um plano alimentar precisa ser ` +
    'feito por um nutricionista ou médico que conheça seu histórico — por segurança, não vou ' +
    'gerar uma dieta por aqui. Continuo à disposição para conversar sobre alimentação em geral.'
  )
}

export function assessSafety(
  data: Pick<CollectedUserData, 'age' | 'weight_kg' | 'height_cm' | 'goal' | 'health_conditions'>,
): SafetyAssessment {
  if (data.age < SAFETY_THRESHOLDS.minAdultAge) {
    return { ok: false, reason: 'MINOR', userMessage: MINOR_MESSAGE }
  }
  if (data.health_conditions.length > 0) {
    return {
      ok: false,
      reason: 'HEALTH_CONDITION',
      userMessage: healthConditionMessage(data.health_conditions),
    }
  }
  const imc = bmi(data.weight_kg, data.height_cm)
  if (imc < SAFETY_THRESHOLDS.bmiUnderweight && data.goal === 'lose_weight') {
    return { ok: false, reason: 'UNDERWEIGHT_DEFICIT', userMessage: UNDERWEIGHT_MESSAGE }
  }
  if (imc > SAFETY_THRESHOLDS.bmiHigh) {
    return { ok: true, warning: 'HIGH_BMI', warningMessage: HIGH_BMI_WARNING }
  }
  return { ok: true, warning: null, warningMessage: null }
}
```

```ts
// backend/src/shared/guardrails/index.ts
export * from './collected-data.js'
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/shared/guardrails/collected-data.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/shared/guardrails
git commit -m "feat(guardrails): assessSafety — menor de idade, condição de saúde e IMC fora da faixa

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: mock de serviço reutilizável + `assessSafety` e mensagens por campo em `handleDietGeneration` (S3, S4)

**Files:**
- Create: `backend/src/shared/testing/fake-fastify.ts`
- Modify: `backend/src/shared/guardrails/collected-data.ts` (adiciona `describeInvalidFields`)
- Modify: `backend/src/modules/chat/chat.service.ts:279-363` (`handleDietGeneration`)
- Test: `backend/src/shared/guardrails/collected-data.test.ts` (adiciona describe)
- Test: `backend/src/modules/chat/chat.service.safety.test.ts` (novo)

**Interfaces:**
- Produces (helper de teste, usado pelas Tasks 10, 11, 12, 13, 16):
  ```ts
  export type DbRoute = [substring: string, rows: unknown[] | Error]
  export interface OpenAiHandlers {
    chatCreate?: (params: unknown) => Promise<unknown>
    parse?: (params: unknown) => Promise<unknown>
  }
  export interface FakeFastify {
    fastify: FastifyInstance
    calls: { sql: string; params: unknown[] }[]
    openaiCalls: { kind: 'chat' | 'parse'; params: Record<string, unknown> }[]
    logs: { level: string; msg: string }[]
  }
  export function fakeFastify(routes?: DbRoute[], openai?: OpenAiHandlers): FakeFastify
  ```
  O `db` devolve, para cada query, as linhas da primeira rota cuja substring apareça no SQL
  (sem match → `[]`), sempre com `.count = rows.length` como o postgres.js. Se a rota devolver
  um `Error`, a query rejeita com ele (simula banco fora).
- Produces: `describeInvalidFields(issues: ZodIssue[], raw: unknown): string`.

- [ ] **Step 1: criar o helper**

```ts
// backend/src/shared/testing/fake-fastify.ts
import type { FastifyInstance } from 'fastify'

/**
 * Mock mínimo do FastifyInstance para testes de serviço: template tagueado do
 * postgres.js (com `begin`), logger que grava, e cliente OpenAI com handlers
 * injetáveis. Não importa vitest — é um arquivo de src comum.
 */

/** Rota: substring do SQL → linhas devolvidas, ou um Error para a query rejeitar. */
export type DbRoute = [substring: string, rows: unknown[] | Error]

export interface OpenAiHandlers {
  chatCreate?: (params: unknown) => Promise<unknown>
  parse?: (params: unknown) => Promise<unknown>
}

export interface FakeFastify {
  fastify: FastifyInstance
  calls: { sql: string; params: unknown[] }[]
  openaiCalls: { kind: 'chat' | 'parse'; params: Record<string, unknown> }[]
  logs: { level: string; msg: string }[]
}

export function fakeFastify(routes: DbRoute[] = [], openai: OpenAiHandlers = {}): FakeFastify {
  const calls: FakeFastify['calls'] = []
  const openaiCalls: FakeFastify['openaiCalls'] = []
  const logs: FakeFastify['logs'] = []

  const db = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.join(' ? ')
    calls.push({ sql, params })
    const rows = routes.find(([sub]) => sql.includes(sub))?.[1] ?? []
    if (rows instanceof Error) return Promise.reject(rows)
    return Promise.resolve(Object.assign([...rows], { count: rows.length }))
  }
  // biome-ignore lint/suspicious/noExplicitAny: mock mínimo do driver
  ;(db as any).begin = (fn: (sql: unknown) => Promise<unknown>) => fn(db)

  const logAt = (level: string) => (obj: unknown, msg?: string) => {
    logs.push({ level, msg: msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj)) })
  }
  const log = { info: logAt('info'), warn: logAt('warn'), error: logAt('error'), debug: logAt('debug') }

  const notConfigured = (kind: string) => () =>
    Promise.reject(new Error(`fakeFastify: handler openai.${kind} não configurado`))
  const chatCreate = openai.chatCreate ?? notConfigured('chatCreate')
  const parse = openai.parse ?? notConfigured('parse')

  const fastify = {
    db,
    log,
    openai: {
      chat: {
        completions: {
          create: (params: Record<string, unknown>) => {
            openaiCalls.push({ kind: 'chat', params })
            return chatCreate(params)
          },
        },
      },
      beta: {
        chat: {
          completions: {
            parse: (params: Record<string, unknown>) => {
              openaiCalls.push({ kind: 'parse', params })
              return parse(params)
            },
          },
        },
      },
    },
  } as unknown as FastifyInstance

  return { fastify, calls, openaiCalls, logs }
}

/** Completion de chat mínima com resposta de texto. */
export function textCompletion(content: string, finishReason = 'stop') {
  return {
    choices: [{ finish_reason: finishReason, message: { role: 'assistant', content, tool_calls: undefined } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** Completion de chat com chamada da tool collect_diet_data. */
export function toolCompletion(args: Record<string, unknown>, name = 'collect_diet_data') {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}
```

- [ ] **Step 2: testes de `describeInvalidFields` (falham)**

Acrescentar em `collected-data.test.ts`:

```ts
import { z } from 'zod'
import { collectedUserDataSchema } from '../diet-ai-schema.js'
import { describeInvalidFields } from './collected-data.js'

describe('describeInvalidFields (S4) — pergunta específica por campo', () => {
  const base = {
    weight_kg: 80, height_cm: 180, age: 30, gender: 'male', goal: 'maintain',
    activity_level: 'moderate', meals_per_day: 4, dietary_restrictions: [], allergies: [],
    food_preferences: null, message_to_user: 'ok', health_conditions: [],
  }
  function issuesFor(raw: unknown) {
    const r = collectedUserDataSchema.safeParse(raw)
    if (r.success) throw new Error('esperava falha')
    return r.error.issues
  }

  it('altura em metros: cita o valor e pede em centímetros', () => {
    const raw = { ...base, height_cm: 1.75 }
    const msg = describeInvalidFields(issuesFor(raw), raw)
    expect(msg).toContain('1.75')
    expect(msg).toMatch(/centímetros/)
  })

  it('peso implausível: pede confirmação em kg', () => {
    const raw = { ...base, weight_kg: 600 }
    expect(describeInvalidFields(issuesFor(raw), raw)).toMatch(/600 kg/)
  })

  it('idade: pede confirmação', () => {
    const raw = { ...base, age: 140 }
    expect(describeInvalidFields(issuesFor(raw), raw)).toMatch(/140 anos/)
  })

  it('lista longa: pede resumo', () => {
    const raw = { ...base, allergies: Array.from({ length: 11 }, (_, i) => `a${i}`) }
    expect(describeInvalidFields(issuesFor(raw), raw)).toMatch(/até 10/)
  })

  it('vários campos: junta as perguntas', () => {
    const raw = { ...base, height_cm: 1.75, weight_kg: 600 }
    const msg = describeInvalidFields(issuesFor(raw), raw)
    expect(msg).toContain('1.75')
    expect(msg).toContain('600')
  })

  it('campo sem template: mensagem genérica de peso/altura', () => {
    const issues: z.ZodIssue[] = [{ code: 'custom', path: ['gender'], message: 'x' }]
    expect(describeInvalidFields(issues, base)).toMatch(/confirmar seu peso e altura/)
  })
})
```

- [ ] **Step 3: implementar `describeInvalidFields`**

Acrescentar em `collected-data.ts`:

```ts
import type { ZodIssue } from 'zod'

const GENERIC_INVALID_MESSAGE =
  'Preciso de mais algumas informações antes de gerar sua dieta. Poderia confirmar seu peso e altura?'

function valueAt(raw: unknown, key: string): string {
  const v = (raw as Record<string, unknown> | null)?.[key]
  return v == null ? '?' : String(v)
}

/**
 * S4: zod falhou por bounds → pergunta ESPECÍFICA por campo, em vez de "confirme
 * peso e altura" para tudo. O valor citado é o que o modelo mandou (raw), para
 * o usuário reconhecer o erro ("1.75" → quis dizer 175).
 */
export function describeInvalidFields(issues: ZodIssue[], raw: unknown): string {
  const fields = [...new Set(issues.map((i) => String(i.path[0] ?? '')))]
  const parts: string[] = []
  for (const f of fields) {
    switch (f) {
      case 'weight_kg':
        parts.push(`Você informou ${valueAt(raw, f)} kg de peso — está certo? Se for outra unidade, me diga em kg.`)
        break
      case 'height_cm':
        parts.push(`Você informou ${valueAt(raw, f)} cm de altura — confere? Me passe em centímetros (ex.: 175).`)
        break
      case 'age':
        parts.push(`Você informou ${valueAt(raw, f)} anos — pode confirmar sua idade?`)
        break
      case 'meals_per_day':
        parts.push('Consigo montar de 3 a 6 refeições por dia — quantas você prefere?')
        break
      case 'dietary_restrictions':
      case 'allergies':
      case 'health_conditions':
      case 'food_preferences':
        parts.push('Me passe suas restrições, alergias e preferências de forma resumida (até 10 itens, poucas palavras cada).')
        break
      default:
        break
    }
  }
  return parts.length > 0 ? [...new Set(parts)].join(' ') : GENERIC_INVALID_MESSAGE
}
```

- [ ] **Step 4: teste de serviço (falha)**

```ts
// backend/src/modules/chat/chat.service.safety.test.ts
import { describe, expect, it } from 'vitest'
import { fakeFastify, toolCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

const dados = {
  weight_kg: 70, height_cm: 175, age: 30, gender: 'female', goal: 'lose_weight',
  activity_level: 'moderate', meals_per_day: 4, dietary_restrictions: [], allergies: [],
  food_preferences: null, message_to_user: 'Vou montar sua dieta!', health_conditions: [],
}

describe('handleDietGeneration — guardrails de coleta (S3/S4)', () => {
  it('gestante: não cria job, responde com a recusa e persiste como collecting', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, health_conditions: ['gestante'] }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).toBeNull()
    expect(r.message.content).toContain('gestante')
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('UPDATE profiles'))).toBe(false)
    const persist = calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    expect(persist?.params).toContain('collecting')
  })

  it('IMC baixo + perder peso: recusa o déficit e oferece manutenção, sem job', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, weight_kg: 45, height_cm: 165 }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).toBeNull()
    expect(r.message.content).toMatch(/MANUTENÇÃO/)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
  })

  it('altura em metros: pergunta específica citando o valor', async () => {
    const { fastify } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, height_cm: 1.75 }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).toBeNull()
    expect(r.message.content).toContain('1.75')
  })

  it('IMC > 40: cria o job e anexa o aviso à mensagem', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, weight_kg: 120, height_cm: 160 }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).not.toBeNull()
    expect(r.message.content).toContain('Vou montar sua dieta!')
    expect(r.message.content).toMatch(/acompanhamento médico/)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(true)
  })
})
```

- [ ] **Step 5: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat/chat.service.safety.test.ts src/shared/guardrails`
Expected: FAIL — o gestante cria job; a altura devolve a mensagem genérica.

- [ ] **Step 6: implementar em `handleDietGeneration`**

Import no topo de `chat.service.ts`:

```ts
import { assessSafety, describeInvalidFields } from '../../shared/guardrails/index.js'
```

Substituir o bloco `if (!parseResult.success) { … }` e o início do fluxo por:

```ts
  if (!parseResult.success) {
    fastify.log.warn(
      { errors: parseResult.error.flatten() },
      'Dados coletados pela IA são inválidos',
    )
    // S4: pergunta específica por campo (altura em metros, peso implausível…).
    const fallbackMsg = describeInvalidFields(parseResult.error.issues, rawArgs)
    history.push({ role: 'assistant', content: fallbackMsg })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: { role: 'assistant', content: fallbackMsg, created_at: new Date().toISOString() },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    }
  }

  const userData = parseResult.data

  // S2/S3: menor de idade, condição de saúde ou IMC baixo com déficit → o coach
  // recusa em TEXTO (status collecting), sem job e sem gravar perfil. A recusa
  // fica no histórico: nas rodadas seguintes o modelo a vê e não insiste (S6).
  const safety = assessSafety(userData)
  if (!safety.ok) {
    fastify.log.info({ userId, reason: safety.reason }, 'Geração de dieta recusada por segurança')
    history.push({ role: 'assistant', content: safety.userMessage })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: {
        role: 'assistant',
        content: safety.userMessage,
        created_at: new Date().toISOString(),
      },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    }
  }

  const userMessage = safety.warningMessage
    ? `${userData.message_to_user}\n\n${safety.warningMessage}`
    : userData.message_to_user
```

(O restante — `createDietJob`, `UPDATE profiles`, persist com `generating` — fica igual e passa
a usar o `userMessage` acima.)

- [ ] **Step 7: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: verde. Se `fetchUserContext` lançar em algum caminho com o mock vazio, corrigir o
**mock** (adicionar rota) — nunca o serviço.

- [ ] **Step 8: commit**

```bash
cd backend && npm run format && git add src/shared/testing src/shared/guardrails src/modules/chat/chat.service.ts src/modules/chat/chat.service.safety.test.ts
git commit -m "feat(coach): recusa por segurança antes de criar o job e pergunta específica por campo inválido

Menor de idade, condição de saúde ou IMC < 18,5 com déficit viram texto do
coach (status collecting), nunca job nem HTTP de erro. IMC > 40 gera com aviso.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: prompt do coach — saúde, escopo, sem fórmula (S6)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts:14-41` (`CHAT_SYSTEM_PROMPT`)
- Test: `backend/src/modules/chat/chat.service.test.ts` (adiciona describe)

- [ ] **Step 1: testes (falham)**

```ts
describe('CHAT_SYSTEM_PROMPT — segurança e escopo (S6)', () => {
  const prompt = buildSystemPrompt('direct')

  it('pergunta sobre gestação/condições de saúde antes da tool', () => {
    expect(prompt).toMatch(/gestante|gestação/i)
    expect(prompt).toContain('health_conditions')
  })

  it('não ensina mais a fórmula de cálculo (o servidor calcula)', () => {
    expect(prompt).not.toContain('Mifflin')
    expect(prompt).not.toContain('TDEE − 500')
    expect(prompt).toMatch(/não calcule nem prometa/i)
  })

  it('tem regra de escopo e de não insistir após recusa', () => {
    expect(prompt).toMatch(/fora de nutrição/i)
    expect(prompt).toMatch(/recusa por segurança/i)
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat/chat.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: novo prompt**

Substituir a constante inteira:

```ts
const CHAT_SYSTEM_PROMPT = `Você é o CalorIA, um nutricionista virtual simpático e motivador.
Seu objetivo é coletar informações do usuário em forma de conversa natural e, ao final, gerar um plano alimentar personalizado.

## DADOS QUE VOCÊ DEVE COLETAR (obrigatórios):
1. Peso atual em kg
2. Altura em cm (sempre em centímetros: 175, nunca 1,75)
3. Idade (ou data de nascimento)
4. Sexo (masculino / feminino / outro)
5. Objetivo: perder peso / manter peso / ganhar massa / ganhar peso
6. Nível de atividade física: sedentário / levemente ativo / moderadamente ativo / ativo / muito ativo
7. Quantas refeições por dia prefere (3 a 6)
8. Saúde: pergunte UMA vez, antes de gerar, se a pessoa está gestante ou amamentando, tem alguma doença diagnosticada (diabetes, renal, cardíaca, tireoide…), transtorno alimentar ou usa medicação contínua. Registre a resposta em health_conditions (vazio se disser que não tem nenhuma).

## DADOS OPCIONAIS (pergunte se não mencionados):
- Restrições alimentares (vegetariano, vegano, sem glúten, sem lactose, etc.)
- Alergias alimentares
- Alimentos que não gosta ou não come

## REGRAS:
- Faça UMA pergunta por vez — nunca uma lista de perguntas
- Seja breve e amigável (máx 2 parágrafos por resposta)
- Responda sempre em português brasileiro
- Quando tiver TODOS os dados obrigatórios (incluindo a pergunta de saúde), chame a função collect_diet_data
- Não mencione que vai "chamar uma função" — apenas diga que vai gerar a dieta
- NÃO calcule nem prometa metas em calorias ou macros: quem calcula é o sistema, e o número que você disser pode não bater com o plano
- Você NÃO é médico: oriente o usuário a consultar profissionais para questões de saúde
- Escopo: assunto fora de nutrição, alimentação e hábitos (ex.: política, programação, outras áreas) → responda em uma frase que só ajuda com alimentação e volte ao assunto
- Se a sua última resposta foi uma recusa por segurança (menor de idade, condição de saúde, IMC baixo), NÃO chame collect_diet_data de novo até o usuário alterar o dado. Exceção: se recusou por IMC baixo e o usuário aceitar um plano de manutenção, chame a função com goal = maintain`
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/modules/chat/chat.service.test.ts`
Expected: PASS (os 3 novos + os antigos; `buildSystemPrompt` ainda contém `collect_diet_data`).

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/chat/chat.service.ts src/modules/chat/chat.service.test.ts
git commit -m "feat(coach): prompt pergunta sobre saúde, define escopo e deixa de prometer metas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Fase B — Saída do dia (bloco O)

### Task 6: `checkAllergens` — normalização, sinônimos, exceções (O1)

**Files:**
- Create: `backend/src/shared/guardrails/allergens.ts`
- Modify: `backend/src/shared/guardrails/index.ts` (reexport)
- Test: `backend/src/shared/guardrails/allergens.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeFoodText(s: string): string
  export const ALLERGEN_SYNONYMS: Record<string, string[]>
  export const RESTRICTION_RULES: { stems: string[]; forbidden: string[] }[]
  export const SAFE_PHRASES: Record<string, string[]>
  export interface AllergenViolation {
    mealIndex: number; itemIndex: number; field: 'food_name' | 'preparation_tip'
    matched: string; source: string
  }
  export function checkAllergens(day: AiSingleDay, allergies: string[], restrictions: string[]): AllergenViolation[]
  ```

- [ ] **Step 1: teste que falha**

```ts
// backend/src/shared/guardrails/allergens.test.ts
import { describe, expect, it } from 'vitest'
import type { AiSingleDay } from '../diet-ai-schema.js'
import { checkAllergens, normalizeFoodText } from './allergens.js'

function dayWith(...foods: (string | { name: string; tip: string })[]): AiSingleDay {
  return {
    day_name: 'Segunda',
    meals: [
      {
        meal_type: 'lunch',
        name: 'Almoço',
        time_suggestion: '12:00',
        total_calories: 100,
        items: foods.map((f) => ({
          food_name: typeof f === 'string' ? f : f.name,
          quantity_g: 100,
          unit: 'g',
          calories: 100,
          protein_g: 5,
          carbs_g: 10,
          fat_g: 2,
          preparation_tip: typeof f === 'string' ? null : f.tip,
        })),
      },
    ],
  }
}

describe('normalizeFoodText', () => {
  it('minúsculas, sem acento, sem pontuação, espaços únicos', () => {
    expect(normalizeFoodText('  Pão de Queijo, c/ Requeijão!  ')).toBe('pao de queijo c requeijao')
  })
})

describe('checkAllergens (O1)', () => {
  it('sem alergias nem restrições: nada', () => {
    expect(checkAllergens(dayWith('Pasta de amendoim'), [], [])).toEqual([])
  })

  it('match direto no nome do alimento', () => {
    const v = checkAllergens(dayWith('Arroz', 'Pasta de amendoim'), ['amendoim'], [])
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ mealIndex: 0, itemIndex: 1, field: 'food_name', source: 'amendoim' })
  })

  it('match por sinônimo (leite → iogurte)', () => {
    const v = checkAllergens(dayWith('Iogurte natural'), ['leite'], [])
    expect(v).toHaveLength(1)
    expect(v[0].matched).toBe('iogurte')
  })

  it('acentos não escondem o alérgeno (camarão)', () => {
    const v = checkAllergens(dayWith('Camarão grelhado', 'Mix de frutos do mar'), ['Camarão'], [])
    expect(v).toHaveLength(2)
  })

  it('também olha o preparation_tip', () => {
    const v = checkAllergens(
      dayWith({ name: 'Salada', tip: 'finalize com amendoim torrado' }),
      ['amendoim'],
      [],
    )
    expect(v).toHaveLength(1)
    expect(v[0].field).toBe('preparation_tip')
  })

  it('restrição vegana proíbe carne, frango, peixe, ovo e laticínios', () => {
    const v = checkAllergens(
      dayWith('Peito de frango', 'Ovos mexidos', 'Tofu grelhado', 'Queijo minas'),
      [],
      ['vegana'],
    )
    expect(v.map((x) => x.itemIndex).sort()).toEqual([0, 1, 3])
  })

  it('restrição vegetariana proíbe carnes e peixes, mas não ovo/leite', () => {
    const v = checkAllergens(dayWith('Tilápia', 'Ovos mexidos', 'Iogurte'), [], ['vegetariano'])
    expect(v).toHaveLength(1)
    expect(v[0].itemIndex).toBe(0)
  })

  it('exceções: leite de coco não é leite; noz-moscada não é noz', () => {
    expect(checkAllergens(dayWith('Leite de coco'), ['leite'], [])).toEqual([])
    expect(checkAllergens(dayWith('Frango com noz-moscada'), ['nozes'], [])).toEqual([])
  })

  it('"sem lactose" aceita leite sem lactose; alergia a leite NÃO aceita', () => {
    expect(checkAllergens(dayWith('Leite sem lactose'), [], ['sem lactose'])).toEqual([])
    expect(checkAllergens(dayWith('Leite sem lactose'), ['leite'], [])).toHaveLength(1)
  })

  it('prefixo de palavra: "pao" pega "paozinho", mas "ovo" não pega "novo"', () => {
    expect(checkAllergens(dayWith('Pãozinho integral'), [], ['sem glúten'])).toHaveLength(1)
    expect(checkAllergens(dayWith('Arroz novo'), ['ovo'], [])).toEqual([])
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/guardrails/allergens.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: implementar**

```ts
// backend/src/shared/guardrails/allergens.ts
import type { AiSingleDay } from '../diet-ai-schema.js'

/**
 * Checagem pós-geração de alérgenos e restrições (O1 da spec de guardrails).
 * "Alergias (EVITAR): amendoim" no prompt é pedido, não garantia — um escorregão
 * do modelo persistia amendoim no lanche de quem é alérgico, sem ninguém conferir.
 *
 * Tudo aqui é texto normalizado (minúsculo, sem acento, sem pontuação). Os
 * mapas são constantes exportadas: ampliar sinônimos não exige tocar a lógica.
 */

export function normalizeFoodText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MEATS = [
  'carne', 'bife', 'boi', 'frango', 'peru', 'porco', 'bacon', 'linguica', 'presunto', 'salsicha',
  'hamburguer', 'patinho', 'alcatra', 'picanha', 'peito de frango', 'coxa', 'sobrecoxa', 'costela',
]
const FISH = [
  'peixe', 'tilapia', 'salmao', 'atum', 'sardinha', 'bacalhau', 'merluza', 'pescada', 'camarao',
  'frutos do mar', 'marisco', 'lula', 'polvo',
]
const DAIRY = ['leite', 'queijo', 'iogurte', 'requeijao', 'manteiga', 'creme de leite', 'coalhada', 'ricota', 'whey']
const EGGS = ['ovo', 'ovos', 'omelete', 'maionese', 'gema', 'clara']
const GLUTEN = [
  'gluten', 'trigo', 'pao', 'macarrao', 'cevada', 'centeio', 'farinha de trigo', 'biscoito',
  'bolacha', 'torrada', 'bolo', 'lasanha', 'pizza',
]

/** Alérgeno canônico → termos que o caracterizam (todos já normalizados). */
export const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  amendoim: ['amendoim', 'amendoins', 'peanut', 'pasta de amendoim', 'pacoca'],
  leite: [...DAIRY, 'lactose'],
  camarao: ['camarao', 'frutos do mar', 'marisco', 'lagosta', 'siri', 'caranguejo', 'lula', 'polvo', 'mexilhao', 'ostra'],
  gluten: GLUTEN,
  ovo: EGGS,
  soja: ['soja', 'tofu', 'shoyu', 'edamame', 'misso', 'proteina de soja'],
  castanha: ['castanha', 'castanhas', 'nozes', 'noz', 'amendoa', 'amendoas', 'avela', 'pistache', 'macadamia', 'caju', 'pecan'],
  peixe: ['peixe', 'tilapia', 'salmao', 'atum', 'sardinha', 'bacalhau', 'merluza', 'pescada'],
}

/** Restrição (por radical, casa "vegano"/"vegana") → termos proibidos. */
export const RESTRICTION_RULES: { stems: string[]; forbidden: string[] }[] = [
  { stems: ['vegan'], forbidden: [...MEATS, ...FISH, ...EGGS, ...DAIRY, 'mel'] },
  { stems: ['vegetarian'], forbidden: [...MEATS, ...FISH] },
  { stems: ['gluten'], forbidden: GLUTEN },
  { stems: ['lactose'], forbidden: DAIRY },
  { stems: ['carne vermelha'], forbidden: ['carne', 'bife', 'boi', 'patinho', 'alcatra', 'picanha', 'porco', 'bacon', 'linguica', 'presunto', 'costela'] },
]

/**
 * Termo → frases em que ele NÃO indica o alérgeno. "leite de coco" não é leite;
 * "noz moscada" não é noz. Vale para alergias e restrições.
 */
export const SAFE_PHRASES: Record<string, string[]> = {
  leite: ['leite de coco', 'leite de amendoa', 'leite de amendoas', 'leite de aveia', 'leite de soja', 'leite de castanha', 'leite de arroz', 'leite vegetal'],
  queijo: ['queijo vegano', 'queijo de castanha'],
  iogurte: ['iogurte vegetal', 'iogurte de coco'],
  manteiga: ['manteiga de amendoim', 'manteiga de castanha'],
  noz: ['noz moscada'],
  pao: ['pao sem gluten', 'pao de queijo'],
  macarrao: ['macarrao sem gluten', 'macarrao de arroz', 'macarrao de abobrinha'],
  carne: ['carne de soja', 'carne vegetal'],
  hamburguer: ['hamburguer de soja', 'hamburguer vegetal', 'hamburguer de grao de bico'],
}

/** Só para a RESTRIÇÃO "sem lactose" (não para alergia a leite, que é à proteína). */
const LACTOSE_FREE_PHRASES = ['sem lactose', 'zero lactose']

export interface AllergenViolation {
  mealIndex: number
  itemIndex: number
  field: 'food_name' | 'preparation_tip'
  matched: string
  source: string
}

interface Rule {
  source: string
  terms: string[]
  lactoseFreeOk: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Casa o termo no INÍCIO de uma palavra: "pao" pega "paozinho", "ovo" não pega "novo". */
function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(term)}`).test(text)
}

function allergyRule(allergy: string): Rule {
  const n = normalizeFoodText(allergy)
  const terms = new Set<string>()
  if (n.length >= 3) terms.add(n)
  for (const [key, syns] of Object.entries(ALLERGEN_SYNONYMS)) {
    if (n === key || syns.includes(n) || n.includes(key)) {
      terms.add(key)
      for (const s of syns) terms.add(s)
    }
  }
  return { source: allergy, terms: [...terms], lactoseFreeOk: false }
}

function restrictionRules(restriction: string): Rule[] {
  const n = normalizeFoodText(restriction)
  return RESTRICTION_RULES.filter((r) => r.stems.some((stem) => n.includes(stem))).map((r) => ({
    source: restriction,
    terms: r.forbidden,
    lactoseFreeOk: r.stems.includes('lactose'),
  }))
}

function isSafeUse(text: string, term: string, rule: Rule): boolean {
  if ((SAFE_PHRASES[term] ?? []).some((p) => text.includes(p))) return true
  if (rule.lactoseFreeOk && LACTOSE_FREE_PHRASES.some((p) => text.includes(p))) return true
  return false
}

export function checkAllergens(
  day: AiSingleDay,
  allergies: string[],
  restrictions: string[],
): AllergenViolation[] {
  const rules: Rule[] = [...allergies.map(allergyRule), ...restrictions.flatMap(restrictionRules)]
  if (rules.length === 0) return []

  const violations: AllergenViolation[] = []
  day.meals.forEach((meal, mealIndex) => {
    meal.items.forEach((item, itemIndex) => {
      const fields: [AllergenViolation['field'], string | null][] = [
        ['food_name', item.food_name],
        ['preparation_tip', item.preparation_tip],
      ]
      for (const [field, raw] of fields) {
        if (!raw) continue
        const text = normalizeFoodText(raw)
        for (const rule of rules) {
          const hit = rule.terms.find((t) => containsTerm(text, t) && !isSafeUse(text, t, rule))
          if (hit) {
            violations.push({ mealIndex, itemIndex, field, matched: hit, source: rule.source })
            break // uma violação por campo basta para rejeitar o dia
          }
        }
      }
    })
  })
  return violations
}
```

E em `index.ts`: `export * from './allergens.js'`.

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/shared/guardrails/allergens.test.ts`
Expected: PASS (11 testes). Se algum sinônimo do teste não casar, ajustar o **mapa**, não o
teste — o teste é o contrato.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/shared/guardrails
git commit -m "feat(guardrails): checkAllergens — alérgenos e restrições na saída do dia, com sinônimos e exceções

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `day.ts` — tipos de refeição, kcal coerente, validação, reconcile-ou-falha (O2, O3, O5-parte)

**Files:**
- Create: `backend/src/shared/guardrails/day.ts`
- Modify: `backend/src/modules/diets/jobs.service.ts:215-271` (remove `reconcileDay`/`roundSmart`, passa a reexportar)
- Modify: `backend/src/shared/guardrails/index.ts`
- Test: `backend/src/shared/guardrails/day.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MEAL_TYPE_ORDER: readonly ['breakfast','morning_snack','lunch','afternoon_snack','dinner','supper']
  export type MealType = (typeof MEAL_TYPE_ORDER)[number]
  export function mealTypesFor(mealsPerDay: number): MealType[]
  export type DayViolationType =
    | 'ALLERGEN' | 'MEAL_COUNT' | 'DUPLICATE_MEAL_TYPE' | 'MEAL_ORDER'
    | 'NON_POSITIVE_QUANTITY' | 'NEGATIVE_MACRO' | 'PROTEIN_OFF_TARGET' | 'RECONCILE_FAILED'
  export interface DayViolation { type: DayViolationType; detail: string }
  export function kcalFromMacros(p: number, c: number, f: number): number
  export function fixItemCalories(day: AiSingleDay): { day: AiSingleDay; fixed: number }
  export function validateDay(day: AiSingleDay, targets: { protein: number }, mealsPerDay: number): DayViolation[]
  export function reconcileDay(day: AiSingleDay, targetCalories: number): { day: AiSingleDay; scaled: boolean; factor: number }  // movido
  export function reconcileOrFail(day: AiSingleDay, targetCalories: number):
    | { ok: true; day: AiSingleDay; scaled: boolean; factor: number }
    | { ok: false; day: AiSingleDay; violation: DayViolation }
  export function describeViolations(violations: DayViolation[]): string
  ```
- `jobs.service.ts` continua exportando `reconcileDay` (reexport) — `jobs.service.test.ts` não muda.

- [ ] **Step 1: teste que falha**

```ts
// backend/src/shared/guardrails/day.test.ts
import { describe, expect, it } from 'vitest'
import type { AiSingleDay } from '../diet-ai-schema.js'
import {
  describeViolations,
  fixItemCalories,
  mealTypesFor,
  reconcileOrFail,
  validateDay,
} from './day.js'

type Meal = AiSingleDay['meals'][number]
type MealType = Meal['meal_type']

function meal(type: MealType, items: Partial<Meal['items'][number]>[]): Meal {
  const full = items.map((it, i) => ({
    food_name: `Alimento ${i}`,
    quantity_g: 100,
    unit: 'g',
    calories: 200,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 8,
    preparation_tip: null,
    ...it,
  }))
  return {
    meal_type: type,
    name: type,
    time_suggestion: '12:00',
    total_calories: full.reduce((s, i) => s + i.calories, 0),
    items: full,
  }
}

const tresRefeicoes: AiSingleDay = {
  day_name: 'Segunda',
  meals: [meal('breakfast', [{}]), meal('lunch', [{}]), meal('dinner', [{}])],
}

describe('mealTypesFor (O5)', () => {
  it('3 → café, almoço, jantar; 6 → todos na ordem canônica', () => {
    expect(mealTypesFor(3)).toEqual(['breakfast', 'lunch', 'dinner'])
    expect(mealTypesFor(4)).toEqual(['breakfast', 'lunch', 'afternoon_snack', 'dinner'])
    expect(mealTypesFor(5)).toEqual(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner'])
    expect(mealTypesFor(6)).toEqual(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'])
  })
})

describe('fixItemCalories (O2 — kcal coerente com macros)', () => {
  it('item coerente fica intacto', () => {
    // 10*4 + 20*4 + 8*9 = 192 ≈ 200 (4%)
    const r = fixItemCalories(tresRefeicoes)
    expect(r.fixed).toBe(0)
    expect(r.day).toEqual(tresRefeicoes)
  })

  it('item 40% fora tem kcal recalculada pelos macros e total da refeição refeito', () => {
    const day: AiSingleDay = { day_name: 'x', meals: [meal('lunch', [{ calories: 400 }])] }
    const r = fixItemCalories(day)
    expect(r.fixed).toBe(1)
    expect(r.day.meals[0].items[0].calories).toBe(192)
    expect(r.day.meals[0].total_calories).toBe(192)
  })
})

describe('validateDay (O2)', () => {
  const targets = { protein: 30 } // 3 itens × 10 g = 30 g

  it('dia correto: sem violações', () => {
    expect(validateDay(tresRefeicoes, targets, 3)).toEqual([])
  })

  it('contagem de refeições diferente de meals_per_day', () => {
    const v = validateDay(tresRefeicoes, targets, 4)
    expect(v.map((x) => x.type)).toContain('MEAL_COUNT')
  })

  it('meal_type duplicado', () => {
    const day = { ...tresRefeicoes, meals: [meal('lunch', [{}]), meal('lunch', [{}]), meal('dinner', [{}])] }
    expect(validateDay(day, targets, 3).map((x) => x.type)).toContain('DUPLICATE_MEAL_TYPE')
  })

  it('tipos fora da ordem/conjunto canônico', () => {
    const day = { ...tresRefeicoes, meals: [meal('lunch', [{}]), meal('breakfast', [{}]), meal('dinner', [{}])] }
    const v = validateDay(day, targets, 3)
    expect(v.map((x) => x.type)).toContain('MEAL_ORDER')
    expect(v.find((x) => x.type === 'MEAL_ORDER')?.detail).toContain('breakfast, lunch, dinner')
  })

  it('quantidade zero/negativa e macro negativo', () => {
    const day = { ...tresRefeicoes, meals: [meal('breakfast', [{ quantity_g: 0 }]), meal('lunch', [{ fat_g: -1 }]), meal('dinner', [{}])] }
    const types = validateDay(day, targets, 3).map((x) => x.type)
    expect(types).toContain('NON_POSITIVE_QUANTITY')
    expect(types).toContain('NEGATIVE_MACRO')
  })

  it('proteína fora de ±20% da meta', () => {
    expect(validateDay(tresRefeicoes, { protein: 50 }, 3).map((x) => x.type)).toContain('PROTEIN_OFF_TARGET')
    expect(validateDay(tresRefeicoes, { protein: 36 }, 3)).toEqual([]) // 30/36 = -16.7%
  })
})

describe('reconcileOrFail (O3)', () => {
  it('dentro do clamp: ok, dia reescalonado', () => {
    // 600 kcal, meta 800 → fator 1.33 (dentro de [0.6, 1.6])
    const r = reconcileOrFail(tresRefeicoes, 800)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.scaled).toBe(true)
  })

  it('clamp insuficiente (>15% fora após escalar): RECONCILE_FAILED', () => {
    // 600 kcal, meta 2000 → fator ideal 3.3, clamp 1.6 → 960 (52% abaixo)
    const r = reconcileOrFail(tresRefeicoes, 2000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violation.type).toBe('RECONCILE_FAILED')
  })
})

describe('describeViolations', () => {
  it('gera feedback legível para o prompt de regeneração', () => {
    const txt = describeViolations([
      { type: 'ALLERGEN', detail: "'Pasta de amendoim' contém amendoim (alergia: amendoim)" },
      { type: 'MEAL_COUNT', detail: 'vieram 4 refeições; precisam ser exatamente 6' },
    ])
    expect(txt).toContain('REJEITADA')
    expect(txt).toContain('amendoim')
    expect(txt).toContain('exatamente 6')
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/guardrails/day.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: implementar `day.ts`**

```ts
// backend/src/shared/guardrails/day.ts
import type { AiSingleDay } from '../diet-ai-schema.js'

/**
 * Guardrails da SAÍDA de um dia gerado (O2/O3 da spec). Antes, só as calorias
 * eram reconciliadas; nº de refeições, meal_type repetido, quantidade zero,
 * kcal incoerente com macros e proteína longe da meta passavam direto.
 */

export const MEAL_TYPE_ORDER = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'supper',
] as const
export type MealType = (typeof MEAL_TYPE_ORDER)[number]

const MEAL_SETS: Record<number, MealType[]> = {
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'afternoon_snack', 'dinner'],
  5: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner'],
  6: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'],
}

/** Tipos exatos que um dia com N refeições deve conter, na ordem canônica (O5). */
export function mealTypesFor(mealsPerDay: number): MealType[] {
  const n = Math.min(6, Math.max(3, Math.round(mealsPerDay)))
  return [...MEAL_SETS[n]]
}

export type DayViolationType =
  | 'ALLERGEN'
  | 'MEAL_COUNT'
  | 'DUPLICATE_MEAL_TYPE'
  | 'MEAL_ORDER'
  | 'NON_POSITIVE_QUANTITY'
  | 'NEGATIVE_MACRO'
  | 'PROTEIN_OFF_TARGET'
  | 'RECONCILE_FAILED'

export interface DayViolation {
  type: DayViolationType
  detail: string
}

export const KCAL_MISMATCH_TOLERANCE = 0.25
export const PROTEIN_TOLERANCE = 0.2
export const RECONCILE_FAIL_TOLERANCE = 0.15

export function kcalFromMacros(p: number, c: number, f: number): number {
  return 4 * p + 4 * c + 9 * f
}

/** Arredonda preservando frações pequenas: ≥10 → inteiro; <10 → 1 casa. */
function roundSmart(n: number): number {
  if (n >= 10) return Math.round(n)
  return Math.round(n * 10) / 10
}

function mealTotal(items: { calories: number }[]): number {
  return roundSmart(items.reduce((s, i) => s + i.calories, 0))
}

/**
 * kcal do item incoerente com 4p+4c+9g (>25%) → recalcula pelos macros. É a
 * única violação CORRIGÍVEL: os macros são a informação primária; a kcal é
 * derivada e o modelo erra a soma com frequência.
 */
export function fixItemCalories(day: AiSingleDay): { day: AiSingleDay; fixed: number } {
  let fixed = 0
  const meals = day.meals.map((meal) => {
    const items = meal.items.map((it) => {
      const expected = kcalFromMacros(it.protein_g, it.carbs_g, it.fat_g)
      if (expected <= 0) return it
      const drift = Math.abs(it.calories - expected) / Math.max(it.calories, 1)
      if (drift <= KCAL_MISMATCH_TOLERANCE) return it
      fixed++
      return { ...it, calories: roundSmart(expected) }
    })
    return { ...meal, items, total_calories: mealTotal(items) }
  })
  return { day: { ...day, meals }, fixed }
}

export function validateDay(
  day: AiSingleDay,
  targets: { protein: number },
  mealsPerDay: number,
): DayViolation[] {
  const v: DayViolation[] = []
  const expected = mealTypesFor(mealsPerDay)
  const types = day.meals.map((m) => m.meal_type)

  if (types.length !== expected.length) {
    v.push({
      type: 'MEAL_COUNT',
      detail: `vieram ${types.length} refeições; precisam ser exatamente ${expected.length}: ${expected.join(', ')}`,
    })
  }
  const dup = types.find((t, i) => types.indexOf(t) !== i)
  if (dup) {
    v.push({ type: 'DUPLICATE_MEAL_TYPE', detail: `meal_type repetido: ${dup}` })
  }
  if (
    types.length === expected.length &&
    !dup &&
    types.some((t, i) => t !== expected[i])
  ) {
    v.push({
      type: 'MEAL_ORDER',
      detail: `os meal_type devem ser, nesta ordem: ${expected.join(', ')} (vieram: ${types.join(', ')})`,
    })
  }

  let protein = 0
  day.meals.forEach((meal, mi) => {
    meal.items.forEach((it, ii) => {
      protein += it.protein_g
      if (!(it.quantity_g > 0)) {
        v.push({
          type: 'NON_POSITIVE_QUANTITY',
          detail: `refeição ${mi + 1}, item ${ii + 1} ('${it.food_name}') com quantidade ${it.quantity_g}`,
        })
      }
      if (it.protein_g < 0 || it.carbs_g < 0 || it.fat_g < 0 || it.calories < 0) {
        v.push({
          type: 'NEGATIVE_MACRO',
          detail: `refeição ${mi + 1}, item ${ii + 1} ('${it.food_name}') com valor negativo`,
        })
      }
    })
  })

  if (targets.protein > 0) {
    const drift = Math.abs(protein - targets.protein) / targets.protein
    if (drift > PROTEIN_TOLERANCE) {
      v.push({
        type: 'PROTEIN_OFF_TARGET',
        detail: `proteína total ${Math.round(protein)} g; meta ${targets.protein} g (tolerância ±20%)`,
      })
    }
  }
  return v
}

// ─── Reconciliação com a meta (I4, movida do jobs.service) ───────────────────

const RECONCILE_TOLERANCE = 0.1 // ±10% da meta é aceitável
const RECONCILE_MIN_FACTOR = 0.6
const RECONCILE_MAX_FACTOR = 1.6

/**
 * Escala determinística do dia para bater a meta de calorias (I4). O modelo às
 * vezes entrega um dia 20-40% fora da meta; em vez de re-chamar a IA (caro/lento
 * e não-determinístico), reescalamos as quantidades proporcionalmente.
 * - Desvio ≤ 10% → intacto.
 * - Fora disso → fator = meta/total, limitado a [0.6, 1.6] (evita distorção
 *   absurda quando a geração vem muito errada).
 */
export function reconcileDay(
  day: AiSingleDay,
  targetCalories: number,
): { day: AiSingleDay; scaled: boolean; factor: number } {
  let total = 0
  for (const meal of day.meals) for (const it of meal.items) total += it.calories

  if (total <= 0 || targetCalories <= 0) return { day, scaled: false, factor: 1 }
  if (Math.abs(total - targetCalories) / targetCalories <= RECONCILE_TOLERANCE) {
    return { day, scaled: false, factor: 1 }
  }

  const factor = Math.min(
    RECONCILE_MAX_FACTOR,
    Math.max(RECONCILE_MIN_FACTOR, targetCalories / total),
  )

  const scaledDay: AiSingleDay = {
    ...day,
    meals: day.meals.map((meal) => {
      const items = meal.items.map((it) => ({
        ...it,
        quantity_g: roundSmart(it.quantity_g * factor),
        calories: roundSmart(it.calories * factor),
        protein_g: roundSmart(it.protein_g * factor),
        carbs_g: roundSmart(it.carbs_g * factor),
        fat_g: roundSmart(it.fat_g * factor),
      }))
      return { ...meal, items, total_calories: mealTotal(items) }
    }),
  }
  return { day: scaledDay, scaled: true, factor }
}

/**
 * O3: o clamp [0.6, 1.6] podia persistir um dia 50% fora da meta com um
 * log.info. Agora, se depois de escalar ainda estiver >15% fora, é violação.
 */
export function reconcileOrFail(
  day: AiSingleDay,
  targetCalories: number,
):
  | { ok: true; day: AiSingleDay; scaled: boolean; factor: number }
  | { ok: false; day: AiSingleDay; violation: DayViolation } {
  const r = reconcileDay(day, targetCalories)
  let total = 0
  for (const meal of r.day.meals) for (const it of meal.items) total += it.calories
  if (targetCalories > 0 && Math.abs(total - targetCalories) / targetCalories > RECONCILE_FAIL_TOLERANCE) {
    return {
      ok: false,
      day: r.day,
      violation: {
        type: 'RECONCILE_FAILED',
        detail: `total do dia ${Math.round(total)} kcal (já reescalonado); meta ${targetCalories} kcal — gere as quantidades próximas da meta`,
      },
    }
  }
  return { ok: true, ...r }
}

/** Feedback para o prompt da segunda tentativa (O4). */
export function describeViolations(violations: DayViolation[]): string {
  const lines = violations.map((v) => `- [${v.type}] ${v.detail}`)
  return (
    'ATENÇÃO — a tentativa anterior foi REJEITADA pelos motivos abaixo. Gere o dia de novo corrigindo TODOS:\n' +
    lines.join('\n')
  )
}
```

- [ ] **Step 4: `jobs.service.ts` passa a reexportar**

Remover de `jobs.service.ts` as linhas 215–271 (constantes `RECONCILE_*`, `roundSmart`,
`reconcileDay`) e acrescentar junto aos imports:

```ts
import { reconcileDay } from '../../shared/guardrails/day.js'
// Reexport: o teste e o histórico do módulo conhecem reconcileDay daqui.
export { reconcileDay }
```

Em `index.ts`: `export * from './day.js'`.

- [ ] **Step 5: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: verde — `jobs.service.test.ts` (reconcileDay) continua passando via reexport.

- [ ] **Step 6: commit**

```bash
cd backend && npm run format && git add src/shared/guardrails src/modules/diets/jobs.service.ts
git commit -m "feat(guardrails): validação estrutural do dia e reconcile-ou-falha; reconcileDay migra para guardrails/day

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `applyDayGuardrails` — composição (O4-parte)

**Files:**
- Modify: `backend/src/shared/guardrails/index.ts`
- Test: `backend/src/shared/guardrails/index.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DayGuardrailCode = 'ALLERGEN_IN_OUTPUT' | 'RECONCILE_FAILED' | 'DAY_VALIDATION_FAILED'
  export type DayGuardrailResult =
    | { ok: true; day: AiSingleDay; notes: string[] }
    | { ok: false; code: DayGuardrailCode; violations: DayViolation[]; feedback: string }
  export function applyDayGuardrails(
    day: AiSingleDay,
    input: { allergies: string[]; dietary_restrictions: string[]; meals_per_day: number },
    targets: { targetCalories: number; protein: number },
  ): DayGuardrailResult
  ```
- Ordem interna e porquê: alérgenos (independe do resto) → `fixItemCalories` (corrige antes de
  escalar) → `reconcileOrFail` → `validateDay` sobre o dia **já reescalonado** (a proteína
  escala junto com as calorias; validar antes daria falso positivo).

- [ ] **Step 1: teste que falha**

```ts
// backend/src/shared/guardrails/index.test.ts
import { describe, expect, it } from 'vitest'
import type { AiSingleDay } from '../diet-ai-schema.js'
import { applyDayGuardrails } from './index.js'

/** Dia com N refeições canônicas, 1 item cada, somando `kcal` e `protein` no total. */
function buildDay(mealsPerDay: 3 | 4, kcal: number, protein: number, food = 'Frango grelhado'): AiSingleDay {
  const types = mealsPerDay === 3
    ? (['breakfast', 'lunch', 'dinner'] as const)
    : (['breakfast', 'lunch', 'afternoon_snack', 'dinner'] as const)
  const n = types.length
  const p = protein / n
  const f = (kcal * 0.25) / 9 / n
  const c = (kcal / n - 4 * p - 9 * f) / 4
  return {
    day_name: 'Segunda',
    meals: types.map((t) => ({
      meal_type: t,
      name: t,
      time_suggestion: '12:00',
      total_calories: kcal / n,
      items: [{ food_name: food, quantity_g: 150, unit: 'g', calories: kcal / n, protein_g: p, carbs_g: c, fat_g: f, preparation_tip: null }],
    })),
  }
}

const input = { allergies: ['amendoim'], dietary_restrictions: [], meals_per_day: 3 }
const targets = { targetCalories: 2000, protein: 140 }

describe('applyDayGuardrails', () => {
  it('dia limpo: ok, sem notas', () => {
    const r = applyDayGuardrails(buildDay(3, 2000, 140), input, targets)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.notes).toEqual([])
  })

  it('alérgeno: código ALLERGEN_IN_OUTPUT e feedback cita o alimento', () => {
    const r = applyDayGuardrails(buildDay(3, 2000, 140, 'Pasta de amendoim'), input, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('ALLERGEN_IN_OUTPUT')
      expect(r.feedback).toContain('Pasta de amendoim')
      expect(r.feedback).toContain('REJEITADA')
    }
  })

  it('dia 30% acima da meta: reescalona e passa, com nota', () => {
    const r = applyDayGuardrails(buildDay(3, 2600, 182), input, targets)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.notes.some((n) => n.includes('reescalonado'))).toBe(true)
  })

  it('dia 3x a meta: clamp não basta → RECONCILE_FAILED', () => {
    const r = applyDayGuardrails(buildDay(3, 6000, 140), input, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('RECONCILE_FAILED')
  })

  it('refeições a menos: DAY_VALIDATION_FAILED', () => {
    const r = applyDayGuardrails(buildDay(3, 2000, 140), { ...input, meals_per_day: 4 }, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('DAY_VALIDATION_FAILED')
      expect(r.violations.map((v) => v.type)).toContain('MEAL_COUNT')
    }
  })

  it('alérgeno tem prioridade sobre os outros códigos', () => {
    const r = applyDayGuardrails(buildDay(3, 6000, 140, 'Amendoim'), input, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('ALLERGEN_IN_OUTPUT')
  })

  it('proteína é validada DEPOIS do reescalonamento (não dá falso positivo)', () => {
    // 2600 kcal com 182 g → escala 0.77 → 2000 kcal com 140 g: dentro da meta.
    const r = applyDayGuardrails(buildDay(3, 2600, 182), input, targets)
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/guardrails/index.test.ts`
Expected: FAIL — `applyDayGuardrails` não existe.

- [ ] **Step 3: implementar**

```ts
// backend/src/shared/guardrails/index.ts — arquivo completo
import type { AiSingleDay } from '../diet-ai-schema.js'
import { checkAllergens } from './allergens.js'
import {
  type DayViolation,
  describeViolations,
  fixItemCalories,
  reconcileOrFail,
  validateDay,
} from './day.js'

export * from './collected-data.js'
export * from './allergens.js'
export * from './day.js'

export type DayGuardrailCode = 'ALLERGEN_IN_OUTPUT' | 'RECONCILE_FAILED' | 'DAY_VALIDATION_FAILED'

export type DayGuardrailResult =
  | { ok: true; day: AiSingleDay; notes: string[] }
  | { ok: false; code: DayGuardrailCode; violations: DayViolation[]; feedback: string }

/**
 * Pipeline de um dia gerado (O4). Ordem: alérgenos → kcal coerente → reconcile
 * → validação sobre o dia JÁ reescalonado (a proteína escala junto; validar
 * antes daria falso positivo). Junta TODAS as violações no feedback — a segunda
 * tentativa recebe a lista completa, não só a primeira.
 */
export function applyDayGuardrails(
  day: AiSingleDay,
  input: { allergies: string[]; dietary_restrictions: string[]; meals_per_day: number },
  targets: { targetCalories: number; protein: number },
): DayGuardrailResult {
  const violations: DayViolation[] = []
  const notes: string[] = []

  for (const a of checkAllergens(day, input.allergies, input.dietary_restrictions)) {
    const item = day.meals[a.mealIndex]?.items[a.itemIndex]
    const texto = a.field === 'food_name' ? item?.food_name : item?.preparation_tip
    violations.push({
      type: 'ALLERGEN',
      detail: `'${texto}' contém "${a.matched}" (PROIBIDO — ${a.source}); remova qualquer traço`,
    })
  }

  const fixed = fixItemCalories(day)
  if (fixed.fixed > 0) notes.push(`kcal recalculada pelos macros em ${fixed.fixed} item(ns)`)

  const rec = reconcileOrFail(fixed.day, targets.targetCalories)
  if (!rec.ok) violations.push(rec.violation)
  else if (rec.scaled) notes.push(`dia reescalonado para a meta (fator ${rec.factor.toFixed(3)})`)

  violations.push(...validateDay(rec.day, targets, input.meals_per_day))

  if (violations.length === 0) return { ok: true, day: rec.day, notes }

  const code: DayGuardrailCode = violations.some((v) => v.type === 'ALLERGEN')
    ? 'ALLERGEN_IN_OUTPUT'
    : violations.some((v) => v.type === 'RECONCILE_FAILED')
      ? 'RECONCILE_FAILED'
      : 'DAY_VALIDATION_FAILED'
  return { ok: false, code, violations, feedback: describeViolations(violations) }
}
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/shared/guardrails`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/shared/guardrails
git commit -m "feat(guardrails): applyDayGuardrails compõe alérgenos, kcal, reconcile e validação com feedback único

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: prompt do dia lista os `meal_type` exatos e aceita feedback (O5)

**Files:**
- Modify: `backend/src/modules/diets/jobs.service.ts:143-197` (`DAY_SYSTEM_PROMPT`, `buildDayPrompt`)
- Test: `backend/src/modules/diets/jobs.service.test.ts` (adiciona describe)

**Interfaces:**
- Produces: `export function buildDayPrompt(u, t, dayNumber, previousDays = '', feedback = ''): string`
  (passa a ser exportada; assinatura ganha `feedback`).

- [ ] **Step 1: testes (falham)**

```ts
import { buildDayPrompt, computeTargets } from './jobs.service.js'

describe('buildDayPrompt (O5)', () => {
  it('lista os meal_type exatos na ordem canônica para meals_per_day', () => {
    const p = buildDayPrompt({ ...base, meals_per_day: 4 }, computeTargets(base), 1)
    expect(p).toContain('breakfast, lunch, afternoon_snack, dinner')
    expect(p).toMatch(/exatamente 4 refeições/)
  })

  it('sem feedback, não há seção de rejeição', () => {
    expect(buildDayPrompt(base, computeTargets(base), 1)).not.toContain('REJEITADA')
  })

  it('com feedback, a seção vem antes das regras', () => {
    const p = buildDayPrompt(base, computeTargets(base), 2, '', 'ATENÇÃO — a tentativa anterior foi REJEITADA')
    expect(p).toContain('REJEITADA')
    expect(p.indexOf('REJEITADA')).toBeLessThan(p.indexOf('Regras:'))
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/diets/jobs.service.test.ts`
Expected: FAIL — `buildDayPrompt` não é exportada.

- [ ] **Step 3: implementar**

```ts
import { mealTypesFor } from '../../shared/guardrails/day.js'

const DAY_SYSTEM_PROMPT =
  'Você é um nutricionista. Gere UM dia de plano alimentar em JSON, com alimentos ' +
  'brasileiros comuns e acessíveis, respeitando as metas e restrições informadas. ' +
  'Some as calorias/macros dos itens de forma coerente com a meta diária (kcal de cada ' +
  'item = 4×proteína + 4×carboidrato + 9×gordura). Use EXATAMENTE os meal_type pedidos, ' +
  'na ordem pedida, sem repetir. Alergias são PROIBIÇÕES absolutas, inclusive em ' +
  'ingredientes e dicas de preparo.'

export function buildDayPrompt(
  u: CollectedUserData,
  t: DietTargets,
  dayNumber: number,
  previousDays = '',
  feedback = '',
): string {
  const goalLabels: Record<string, string> = {
    lose_weight: 'perda de peso',
    maintain: 'manutenção',
    gain_muscle: 'ganho de massa',
    gain_weight: 'ganho de peso',
  }
  const mealTypes = mealTypesFor(u.meals_per_day)
  const varietySection = previousDays
    ? `\nDIAS JÁ GERADOS — para garantir variedade, evite repetir a mesma proteína principal do almoço/jantar em dias consecutivos e varie os carboidratos:\n${previousDays}\n`
    : ''
  const feedbackSection = feedback ? `\n${feedback}\n` : ''
  return `Gere o dia ${dayNumber} de ${TOTAL_DAYS} (${DAYS_PT[dayNumber] ?? `Dia ${dayNumber}`}) de um plano alimentar.

Perfil: ${u.weight_kg}kg, ${u.height_cm}cm, ${u.age} anos, ${u.gender}, objetivo ${goalLabels[u.goal] ?? u.goal}.
Metas do DIA: ${t.targetCalories} kcal, ${t.protein}g proteína, ${t.carbs}g carboidrato, ${t.fat}g gordura.
Refeições: exatamente ${mealTypes.length} refeições, com estes meal_type nesta ordem: ${mealTypes.join(', ')}.
${u.dietary_restrictions?.length ? `Restrições: ${u.dietary_restrictions.join(', ')}.` : ''}
${u.allergies?.length ? `Alergias (PROIBIDO, em qualquer ingrediente ou dica): ${u.allergies.join(', ')}.` : ''}
${u.food_preferences ? `Preferências: ${u.food_preferences}.` : ''}
${varietySection}${feedbackSection}
Regras: varie os alimentos (evite repetir em relação a um dia típico), especifique quantidade em gramas e calorias/macros por item. Distribua as ${mealTypes.length} refeições ao longo do dia.`
}
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/modules/diets/jobs.service.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/diets/jobs.service.ts src/modules/diets/jobs.service.test.ts
git commit -m "feat(diets): prompt do dia lista os meal_type exatos e recebe feedback de rejeição

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `processJobStep` — regenera uma vez com feedback, depois falha (O4)

**Files:**
- Modify: `backend/src/modules/diets/jobs.service.ts:356-453` (geração + catch)
- Modify: `backend/src/modules/diets/diets.routes.ts:302-309` (descrição dos 502)
- Test: `backend/src/modules/diets/process-job-step.test.ts` (novo)

**Interfaces:**
- Consumes: `applyDayGuardrails` (Task 8), `buildDayPrompt(..., feedback)` (Task 9),
  `fakeFastify` (Task 4).
- Produces: helpers internos `generateDay(...)` e `failJob(fastify, jobId, dietId, error)`
  (não exportados; Task 16 os reutiliza).
- Códigos de erro do job: `error` da linha em `diet_jobs` recebe `ALLERGEN_IN_OUTPUT` |
  `DAY_VALIDATION_FAILED` | `RECONCILE_FAILED`; a rota responde 502 com o mesmo código.

- [ ] **Step 1: teste que falha**

```ts
// backend/src/modules/diets/process-job-step.test.ts
import { describe, expect, it } from 'vitest'
import type { AiSingleDay, CollectedUserData } from '../../shared/diet-ai-schema.js'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { computeTargets, processJobStep } from './jobs.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const JOB = '33333333-3333-3333-3333-333333333333'
const DIET = '44444444-4444-4444-4444-444444444444'

const input: CollectedUserData = {
  weight_kg: 80, height_cm: 180, age: 30, gender: 'male', goal: 'maintain',
  activity_level: 'moderate', meals_per_day: 3, dietary_restrictions: [], allergies: ['amendoim'],
  food_preferences: null, message_to_user: 'ok', health_conditions: [],
}
const targets = computeTargets(input)

function dayWith(food: string): AiSingleDay {
  const types = ['breakfast', 'lunch', 'dinner'] as const
  const p = targets.protein / 3
  const f = (targets.targetCalories * 0.25) / 9 / 3
  const kcal = targets.targetCalories / 3
  const c = (kcal - 4 * p - 9 * f) / 4
  return {
    day_name: 'Segunda',
    meals: types.map((t) => ({
      meal_type: t, name: t, time_suggestion: '12:00', total_calories: kcal,
      items: [{ food_name: food, quantity_g: 150, unit: 'g', calories: kcal, protein_g: p, carbs_g: c, fat_g: f, preparation_tip: null }],
    })),
  }
}

const jobRow = {
  id: JOB, conversation_id: null, diet_id: DIET, status: 'running', input,
  total_days: 7, days_completed: 0, error: null,
}

function setup(days: AiSingleDay[]) {
  const queue = [...days]
  return fakeFastify(
    [
      ['FROM diet_jobs WHERE id', [jobRow]],
      ['SET days_completed', [{ id: JOB }]],
    ],
    {
      parse: async () => ({
        choices: [{ message: { parsed: queue.shift() ?? null } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    },
  )
}

describe('processJobStep — guardrails do dia (O4)', () => {
  it('dia limpo: uma chamada, persiste', async () => {
    const { fastify, calls, openaiCalls } = setup([dayWith('Frango grelhado')])

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(1)
    expect(r.daysCompleted).toBe(1)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(true)
  })

  it('alérgeno na 1ª tentativa: regenera com feedback e persiste a 2ª', async () => {
    const { fastify, calls, openaiCalls } = setup([dayWith('Pasta de amendoim'), dayWith('Frango grelhado')])

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(2)
    const segunda = openaiCalls[1].params as { messages: { content: string }[] }
    expect(segunda.messages[1].content).toContain('REJEITADA')
    expect(segunda.messages[1].content).toContain('Pasta de amendoim')
    expect(r.daysCompleted).toBe(1)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(true)
  })

  it('alérgeno nas 2 tentativas: job failed com ALLERGEN_IN_OUTPUT, nada persistido', async () => {
    const { fastify, calls, openaiCalls } = setup([dayWith('Pasta de amendoim'), dayWith('Amendoim torrado')])

    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({ code: 'ALLERGEN_IN_OUTPUT' })

    expect(openaiCalls).toHaveLength(2)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(false)
    const fail = calls.find((c) => c.sql.includes("status = 'failed'") && c.sql.includes('diet_jobs'))
    expect(fail?.params).toContain('ALLERGEN_IN_OUTPUT')
  })

  it('erro de rede na IA continua virando DIET_STEP_FAILED', async () => {
    const { fastify } = fakeFastify([['FROM diet_jobs WHERE id', [jobRow]]], {
      parse: async () => { throw new Error('ECONNRESET') },
    })
    await expect(processJobStep(fastify, USER, JOB)).rejects.toBeInstanceOf(AppError)
    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({ code: 'DIET_STEP_FAILED' })
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/diets/process-job-step.test.ts`
Expected: FAIL — o dia com amendoim é persistido; só 1 chamada.

- [ ] **Step 3: implementar**

Imports em `jobs.service.ts`:

```ts
import { type DayGuardrailResult, applyDayGuardrails } from '../../shared/guardrails/index.js'
```

Acima de `processJobStep`, dois helpers:

```ts
/** O4: uma regeneração com feedback; na segunda falha o job vai para failed. */
const MAX_DAY_ATTEMPTS = 2

async function generateDay(
  fastify: FastifyInstance,
  userId: string,
  dayNumber: number,
  userData: CollectedUserData,
  targets: DietTargets,
  previousDays: string,
  feedback: string,
): Promise<AiSingleDay> {
  const completion = await fastify.openai.beta.chat.completions.parse(
    {
      // I5.1: modelo dedicado da geração de dias (default = OPENAI_MODEL).
      model: env.OPENAI_DIET_MODEL,
      // I5.2: fallbacks do OpenRouter (spread não dispara excess-property check).
      ...buildModelsField(env.OPENAI_DIET_MODEL, env.OPENAI_FALLBACK_MODELS),
      messages: [
        { role: 'system', content: DAY_SYSTEM_PROMPT },
        { role: 'user', content: buildDayPrompt(userData, targets, dayNumber, previousDays, feedback) },
      ],
      response_format: zodResponseFormat(aiSingleDaySchema, 'diet_day'),
      // Reasoning tokens consomem este mesmo orçamento no GPT-5; 6000 truncava
      // o JSON do dia ("length limit was reached"). Folga grande — o teto real
      // de tempo é o maxDuration (300s) + timeout abaixo.
      max_tokens: 20000,
      // Reasoning baixo pra reduzir a latência por dia.
      reasoning_effort: 'low',
    },
    // Timeout explícito abaixo do maxDuration (300s) pra falhar tratável.
    { timeout: 120_000 },
  )
  logAiUsage(fastify, {
    feature: 'diet_day',
    model: env.OPENAI_DIET_MODEL,
    userId,
    usage: completion.usage,
  })
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error('IA retornou dia vazio')
  return parsed
}

/**
 * Marca job e draft como failed. A dieta ATIVA anterior permanece intocada, e
 * o /retry consegue devolver a draft e continuar de onde parou.
 */
async function failJob(
  fastify: FastifyInstance,
  jobId: string,
  dietId: string,
  error: string,
): Promise<void> {
  await fastify.db`
    UPDATE diet_jobs SET status = 'failed', error = ${error.slice(0, 300)}, updated_at = NOW()
    WHERE id = ${jobId}
  `
  await fastify.db`
    UPDATE diets SET status = 'failed', updated_at = NOW()
    WHERE id = ${dietId} AND status = 'draft'
  `
}
```

Em `processJobStep`, substituir o bloco `// 1) Gera o dia …` até o fim do `catch` por:

```ts
  // 1) Gera o dia (chamada longa — SEM segurar transação/lock) e passa pelos
  //    guardrails (O4): alérgeno, kcal, reconcile, estrutura. Uma regeneração
  //    com o feedback das violações; se ainda falhar, o job vai para failed.
  //    NUNCA persiste um dia que não passou.
  let aiDay: AiSingleDay
  try {
    let feedback = ''
    let result: DayGuardrailResult | null = null
    for (let attempt = 1; attempt <= MAX_DAY_ATTEMPTS; attempt++) {
      const generated = await generateDay(fastify, userId, dayNumber, userData, targets, previousDays, feedback)
      result = applyDayGuardrails(generated, userData, targets)
      if (result.ok) break
      fastify.log.warn(
        { jobId, dayNumber, attempt, code: result.code, violations: result.violations },
        'Dia rejeitado pelos guardrails',
      )
      feedback = result.feedback
    }
    if (!result || !result.ok) {
      const code = result?.code ?? 'DAY_VALIDATION_FAILED'
      await failJob(fastify, jobId, job.diet_id, code)
      throw new AppError(
        502,
        code,
        'A dieta gerada não passou nas verificações de segurança. Tente novamente.',
      )
    }
    for (const note of result.notes) fastify.log.info({ jobId, dayNumber }, note)
    aiDay = result.day
  } catch (err) {
    if (err instanceof AppError) throw err
    fastify.log.error({ err, jobId, dayNumber }, 'Falha ao gerar dia da dieta')
    await failJob(fastify, jobId, job.diet_id, String(err))
    throw new AppError(502, 'DIET_STEP_FAILED', 'Falha ao gerar um dia da dieta. Tente novamente.')
  }
```

Remover o `reconcileDay(...)` que existia no bloco antigo (agora é feito dentro de
`applyDayGuardrails`). `dayTotals` e a persistência seguem iguais.

Em `diets.routes.ts`, na rota `/jobs/:id/step`:

```ts
          502: errorSchema.describe(
            'DIET_STEP_FAILED (IA indisponível) | ALLERGEN_IN_OUTPUT | DAY_VALIDATION_FAILED | RECONCILE_FAILED (dia gerado reprovado nos guardrails; o job vai para failed e /retry continua do mesmo dia)',
          ),
```

- [ ] **Step 4: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: typecheck limpo; testes verdes; lint com ≤ 11 erros.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/diets
git commit -m "feat(diets): dia gerado passa pelos guardrails; regenera uma vez com feedback e depois falha

Nunca persiste um dia com alérgeno, fora da meta ou com estrutura errada.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Fase C — Chat (bloco C)

### Task 11: sem `tools` na request enquanto há job em andamento (C1)

**Files:**
- Modify: `backend/src/modules/diets/jobs.service.ts:80-110` (extrai `getPendingJob`)
- Modify: `backend/src/modules/chat/chat.service.ts:196-247` (`sendChatMessage`)
- Test: `backend/src/modules/chat/chat.service.gating.test.ts` (novo)

**Interfaces:**
- Produces: `export async function getPendingJob(fastify, userId): Promise<{ id: string; diet_id: string } | null>`
  em `jobs.service.ts`. `createDietJob` passa a usá-la (comportamento idêntico).
- Em `sendChatMessage`: `hasActiveDiet = context.diet !== null || pendingJob !== null`; com
  `pendingJob`, a request NÃO leva `tools` nem `tool_choice`. Sem, leva os dois e
  `parallel_tool_calls: false`.

- [ ] **Step 1: teste que falha**

```ts
// backend/src/modules/chat/chat.service.gating.test.ts
import { describe, expect, it } from 'vitest'
import { fakeFastify, textCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'
const PENDING_SQL = "status IN ('pending', 'running')"
const PENDING_ROW = { id: 'job-1', diet_id: 'diet-1' }

describe('sendChatMessage — gating da tool (C1)', () => {
  it('com job pending/running, a request vai SEM tools e sem tool_choice', async () => {
    const { fastify, openaiCalls } = fakeFastify([[PENDING_SQL, [PENDING_ROW]]], {
      chatCreate: async () => textCompletion('Sua dieta está sendo gerada!'),
    })

    await sendChatMessage(fastify, USER, { message: 'ok', conversation_id: CONV })

    expect(openaiCalls).toHaveLength(1)
    const params = openaiCalls[0].params
    expect(params.tools).toBeUndefined()
    expect(params.tool_choice).toBeUndefined()
  })

  it('com job em andamento, o prompt avisa que já existe dieta (mesmo sem dieta ativa)', async () => {
    const { fastify, openaiCalls } = fakeFastify([[PENDING_SQL, [PENDING_ROW]]], {
      chatCreate: async () => textCompletion('ok'),
    })

    await sendChatMessage(fastify, USER, { message: 'ok', conversation_id: CONV })

    const messages = openaiCalls[0].params.messages as { role: string; content: string }[]
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('JÁ TEM uma dieta ativa')
  })

  it('sem job, a request leva a tool, tool_choice auto e parallel_tool_calls false', async () => {
    const { fastify, openaiCalls } = fakeFastify([], {
      chatCreate: async () => textCompletion('Qual seu peso?'),
    })

    await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })

    const params = openaiCalls[0].params as { tools?: unknown[]; tool_choice?: string; parallel_tool_calls?: boolean }
    expect(params.tools).toHaveLength(1)
    expect(params.tool_choice).toBe('auto')
    expect(params.parallel_tool_calls).toBe(false)
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat/chat.service.gating.test.ts`
Expected: FAIL — `tools` sempre presente; `parallel_tool_calls` undefined.

- [ ] **Step 3: `getPendingJob` em `jobs.service.ts`**

```ts
/**
 * Job de geração em andamento (pending/running) mais recente do usuário, ou
 * null. Usado por createDietJob (não abrir duas gerações) e pelo chat (C1:
 * não oferecer a tool ao modelo enquanto há geração em voo).
 */
export async function getPendingJob(
  fastify: FastifyInstance,
  userId: string,
): Promise<{ id: string; diet_id: string } | null> {
  const [row] = await fastify.db<{ id: string; diet_id: string }[]>`
    SELECT id, diet_id
    FROM diet_jobs
    WHERE user_id = ${userId} AND status IN ('pending', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ?? null
}
```

Em `createDietJob`, substituir a query inline por:

```ts
  const emAndamento = await getPendingJob(fastify, userId)
  if (emAndamento) {
    fastify.log.info(
      { userId, jobId: emAndamento.id },
      'Geração de dieta já em andamento — reaproveitando o job',
    )
    return { jobId: emAndamento.id, dietId: emAndamento.diet_id }
  }
```

(O comentário longo acima da query permanece — ele explica o porquê.)

- [ ] **Step 4: gating em `sendChatMessage`**

Import: `import { createDietJob, getPendingJob } from '../diets/jobs.service.js'`.

Depois de `fetchUserContext(...)`:

```ts
  // C1: com geração em voo, o modelo NÃO recebe a tool — não chama o que não
  // existe. Fecha o buraco da primeira geração (dieta ainda 'draft', logo
  // hasActiveDiet era false e a instrução de "já tem dieta" não entrava).
  const pendingJob = await getPendingJob(fastify, userId)
  const hasActiveDiet = context.diet !== null || pendingJob !== null
  const systemPrompt = assembleSystemPrompt(
    buildSystemPrompt(profile?.coach_personality),
    formatUserContext(context),
    formatKnownData(context),
    hasActiveDiet,
  )
  const toolParams = pendingJob
    ? {}
    : { tools: [COLLECT_DIET_DATA_TOOL], tool_choice: 'auto' as const, parallel_tool_calls: false }
```

E na chamada, trocar `tools: [COLLECT_DIET_DATA_TOOL], tool_choice: 'auto',` por `...toolParams,`.

- [ ] **Step 5: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: verde (incl. `create-diet-job.test.ts`, que continua vendo 1 query de checagem).

- [ ] **Step 6: commit**

```bash
cd backend && npm run format && git add src/modules/chat src/modules/diets/jobs.service.ts
git commit -m "feat(coach): sem tool na request enquanto há geração em andamento

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: marcadores de início e conclusão no histórico (C2)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts` (`handleDietGeneration`, novo `formatDietStartedMarker`)
- Modify: `backend/src/modules/diets/jobs.service.ts:516-525` (ramo `done`)
- Test: `backend/src/modules/chat/chat.service.test.ts` (adiciona describe)
- Test: `backend/src/modules/chat/chat.service.safety.test.ts` (adiciona it)
- Test: `backend/src/modules/diets/process-job-step.test.ts` (adiciona it)

**Interfaces:**
- Produces: `export function formatDietStartedMarker(now: Date, tzOffsetMinutes?: number): string`
  → `[Dieta de 7 dias iniciada em DD/MM às HH:MM]` (convenção `local = UTC + offset`, como em
  `shared/local-date.ts`; sem offset, UTC).
- Produces: `export const DIET_COMPLETED_MARKER = '[Dieta concluída — 7 dias]'` em `jobs.service.ts`.
- `handleDietGeneration` ganha o parâmetro `tzOffsetMinutes: number | undefined`.

- [ ] **Step 1: testes (falham)**

Em `chat.service.test.ts`:

```ts
import { formatDietStartedMarker } from './chat.service.js'

describe('formatDietStartedMarker (C2)', () => {
  it('usa o fuso do app (local = UTC + offset)', () => {
    expect(formatDietStartedMarker(new Date('2026-09-09T17:32:00Z'), -180)).toBe(
      '[Dieta de 7 dias iniciada em 09/09 às 14:32]',
    )
  })

  it('sem offset, UTC', () => {
    expect(formatDietStartedMarker(new Date('2026-01-05T03:07:00Z'))).toBe(
      '[Dieta de 7 dias iniciada em 05/01 às 03:07]',
    )
  })
})
```

Em `chat.service.safety.test.ts`, dentro do describe existente:

```ts
  it('ao enfileirar o job, grava o marcador de início no histórico (o modelo passa a ver que gerou)', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion(dados),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV, tzOffsetMinutes: -180 })

    expect(r.diet_job_id).not.toBeNull()
    const persist = calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    const messages = JSON.parse(persist?.params[2] as string) as { role: string; content: string }[]
    expect(messages.at(-1)?.content).toMatch(/^\[Dieta de 7 dias iniciada em \d\d\/\d\d às \d\d:\d\d\]$/)
    expect(messages.at(-2)?.content).toBe('Vou montar sua dieta!')
    // A resposta ao app é só a mensagem do coach; o marcador é para o histórico.
    expect(r.message.content).toBe('Vou montar sua dieta!')
  })
```

Em `process-job-step.test.ts`:

```ts
  it('no último dia, anexa o marcador de conclusão ao chat_history da conversa', async () => {
    const CONV = '22222222-2222-2222-2222-222222222222'
    const queue = [dayWith('Frango grelhado')]
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [{ ...jobRow, conversation_id: CONV, days_completed: 6 }]],
        ['SET days_completed', [{ id: JOB }]],
      ],
      { parse: async () => ({ choices: [{ message: { parsed: queue.shift() ?? null } }], usage: null }) },
    )

    const r = await processJobStep(fastify, USER, JOB)

    expect(r.status).toBe('completed')
    const upd = calls.find((c) => c.sql.includes('UPDATE chat_history') && c.sql.includes('messages ||'))
    expect(upd).toBeDefined()
    expect(String(upd?.params.find((p) => typeof p === 'string' && p.includes('Dieta concluída')))).toContain('7 dias')
  })
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat src/modules/diets/process-job-step.test.ts`
Expected: FAIL.

- [ ] **Step 3: implementar no chat**

```ts
// chat.service.ts — junto dos helpers exportados
/**
 * C2: o histórico guarda só {role, content}; a chamada da tool e o job nunca
 * entravam nele. Para o modelo, a conversa era "dados → vou gerar → ok" — nada
 * dizia que algo rodou. Este marcador é o que ele passa a ver.
 */
export function formatDietStartedMarker(now: Date, tzOffsetMinutes?: number): string {
  const local = new Date(now.getTime() + (tzOffsetMinutes ?? 0) * 60_000)
  const dd = String(local.getUTCDate()).padStart(2, '0')
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0')
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mi = String(local.getUTCMinutes()).padStart(2, '0')
  return `[Dieta de 7 dias iniciada em ${dd}/${mm} às ${hh}:${mi}]`
}
```

Em `sendChatMessage`, a chamada passa a ser
`return handleDietGeneration(fastify, userId, conversationId, history, toolCall, data.tzOffsetMinutes)`,
e a assinatura de `handleDietGeneration` ganha `tzOffsetMinutes: number | undefined` como
último parâmetro. Logo antes de `await persistHistory(..., 'generating')`:

```ts
  history.push({ role: 'assistant', content: userMessage })
  history.push({ role: 'assistant', content: formatDietStartedMarker(new Date(), tzOffsetMinutes) })
  await persistHistory(fastify, userId, conversationId, history, 'generating')
```

- [ ] **Step 4: implementar no job**

Em `jobs.service.ts`, junto de `TOTAL_DAYS`:

```ts
export const DIET_COMPLETED_MARKER = `[Dieta concluída — ${TOTAL_DAYS} dias]`
```

No ramo `done`, substituir o `UPDATE chat_history` por:

```ts
        const marker = JSON.stringify([{ role: 'assistant', content: DIET_COMPLETED_MARKER }])
        await fastify.db`
          UPDATE chat_history
          SET status = 'completed', diet_id = ${job.diet_id},
              messages = messages || ${marker}::jsonb,
              updated_at = NOW()
          WHERE id = ${job.conversation_id}
        `
```

- [ ] **Step 5: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: verde.

- [ ] **Step 6: commit**

```bash
cd backend && npm run format && git add src/modules/chat src/modules/diets
git commit -m "feat(coach): marcadores de dieta iniciada/concluída no histórico — o modelo passa a ver que gerou

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `finish_reason` — retry curto em `length`, 502/422 sem persistir (C3)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts` (`sendChatMessage`)
- Test: `backend/src/modules/chat/chat.service.finish.test.ts` (novo)

**Interfaces:**
- Novos códigos: `AI_TRUNCATED` (502), `AI_CONTENT_FILTERED` (422). Nada é persistido em
  nenhum dos dois.
- Tool desconhecida: `warn` e segue como resposta sem tool; como `content` vem `null` nesse
  caso, cai em `AI_TRUNCATED` (resposta vazia) — nunca o texto genérico de antes.

- [ ] **Step 1: teste que falha**

```ts
// backend/src/modules/chat/chat.service.finish.test.ts
import { describe, expect, it } from 'vitest'
import { fakeFastify, textCompletion, toolCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

describe('sendChatMessage — finish_reason (C3)', () => {
  it('length → repete UMA vez com reasoning minimal e max_tokens 4000; persiste a 2ª', async () => {
    const respostas = [textCompletion('', 'length'), textCompletion('Qual seu peso?', 'stop')]
    const { fastify, openaiCalls, calls } = fakeFastify([], {
      chatCreate: async () => respostas.shift(),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })

    expect(openaiCalls).toHaveLength(2)
    expect(openaiCalls[0].params.max_tokens).toBe(2000)
    expect(openaiCalls[1].params.max_tokens).toBe(4000)
    expect(openaiCalls[1].params.reasoning_effort).toBe('minimal')
    expect(r.message.content).toBe('Qual seu peso?')
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(true)
  })

  it('length duas vezes → 502 AI_TRUNCATED e NADA persistido', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => textCompletion('Desculpe, não', 'length'),
    })

    await expect(sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_TRUNCATED',
    })
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
  })

  it('content_filter → 422 AI_CONTENT_FILTERED, nada persistido', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => textCompletion('', 'content_filter'),
    })

    await expect(sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })).rejects.toMatchObject({
      statusCode: 422,
      code: 'AI_CONTENT_FILTERED',
    })
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
  })

  it('tool desconhecida → warn, sem job, e AI_TRUNCATED (content vazio) sem persistir', async () => {
    const { fastify, calls, logs } = fakeFastify([], {
      chatCreate: async () => toolCompletion({}, 'delete_everything'),
    })

    await expect(sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })).rejects.toMatchObject({
      code: 'AI_TRUNCATED',
    })
    expect(logs.some((l) => l.level === 'warn' && l.msg.includes('Tool desconhecida'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
  })

  it('resposta normal (stop) segue igual: 1 chamada, persistida', async () => {
    const { fastify, openaiCalls, calls } = fakeFastify([], {
      chatCreate: async () => textCompletion('Olá!'),
    })
    const r = await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })
    expect(openaiCalls).toHaveLength(1)
    expect(r.message.content).toBe('Olá!')
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(true)
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat/chat.service.finish.test.ts`
Expected: FAIL — hoje `length` vira "Desculpe, não…" persistido.

- [ ] **Step 3: implementar**

Constantes junto de `OPENAI_TIMEOUT_MS`:

```ts
const CHAT_MAX_TOKENS = 2000
const CHAT_RETRY_MAX_TOKENS = 4000

/**
 * C3: no retry por `length`, reasoning mínimo — sobra orçamento para o texto.
 * O tipo ReasoningEffort do SDK 4.104 é 'low'|'medium'|'high'|null e ainda não
 * conhece 'minimal'; a API aceita. Spread de Record não dispara o excess-property
 * check (mesmo truque de buildModelsField para `models`).
 */
const MINIMAL_REASONING = { reasoning_effort: 'minimal' } as Record<string, unknown>
```

Em `sendChatMessage`, substituir o bloco `let completion … catch` e o trecho até
`const choice = completion.choices[0]` por:

```ts
  // ── Chamada à OpenAI com suporte a function calling ──────────────────────
  const baseParams = {
    model: env.OPENAI_MODEL,
    // I5.2: fallbacks do OpenRouter (spread não dispara excess-property check).
    ...buildModelsField(env.OPENAI_MODEL, env.OPENAI_FALLBACK_MODELS),
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...windowedHistory(history),
    ],
    ...toolParams,
    // GPT-5 é reasoning model: não aceita temperature custom (só o default) e
    // gasta "reasoning tokens" do orçamento — por isso um limite mais folgado.
    max_tokens: CHAT_MAX_TOKENS,
    // Reasoning baixo: coletar dados / decidir a tool não precisa de raciocínio
    // profundo, e o reasoning alto estourava os 60s da função (timeout).
    reasoning_effort: 'low' as const,
  }

  const callChat = async (params: typeof baseParams | (typeof baseParams & Record<string, unknown>)) => {
    try {
      return await fastify.openai.chat.completions.create(params, { timeout: OPENAI_TIMEOUT_MS })
    } catch (err) {
      fastify.log.error({ err }, 'Erro ao chamar OpenAI chat')
      throw mapOpenAIError(err)
    }
  }

  let completion = await callChat(baseParams)
  logAiUsage(fastify, { feature: 'chat', model: env.OPENAI_MODEL, userId, usage: completion.usage })

  // C3: reasoning tokens consumiram o orçamento → conteúdo vazio/cortado. Antes,
  // o fallback "Desculpe, não consegui…" era mostrado E persistido no histórico,
  // contaminando as rodadas seguintes. Uma repetição curta; depois, erro limpo.
  if (completion.choices[0]?.finish_reason === 'length') {
    fastify.log.warn({ userId, conversationId }, 'Chat truncado (length) — repetindo com reasoning mínimo')
    completion = await callChat({ ...baseParams, max_tokens: CHAT_RETRY_MAX_TOKENS, ...MINIMAL_REASONING })
    logAiUsage(fastify, { feature: 'chat', model: env.OPENAI_MODEL, userId, usage: completion.usage })
    if (completion.choices[0]?.finish_reason === 'length') {
      throw new AppError(502, 'AI_TRUNCATED', 'A IA não conseguiu concluir a resposta. Tente uma mensagem mais curta.')
    }
  }
  if (completion.choices[0]?.finish_reason === 'content_filter') {
    throw new AppError(422, 'AI_CONTENT_FILTERED', 'Não consigo responder a essa mensagem. Vamos falar de alimentação?')
  }

  const choice = completion.choices[0]

  // ── Detecta chamada de função: IA coletou todos os dados ─────────────────
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0]
    if (toolCall.function.name === 'collect_diet_data') {
      return handleDietGeneration(fastify, userId, conversationId, history, toolCall, data.tzOffsetMinutes)
    }
    fastify.log.warn({ userId, tool: toolCall.function.name }, 'Tool desconhecida chamada pelo modelo')
  }

  // ── Resposta de conversa normal ──────────────────────────────────────────
  const assistantMessage = choice.message.content?.trim() ?? ''
  if (!assistantMessage) {
    // Sem texto e sem tool válida: não há o que mostrar nem o que persistir.
    throw new AppError(502, 'AI_TRUNCATED', 'A IA devolveu uma resposta vazia. Tente novamente.')
  }
  history.push({ role: 'assistant', content: assistantMessage })
```

(O `logAiUsage` antigo logo após o `catch` é removido — passou para dentro do fluxo acima.)

- [ ] **Step 4: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: verde. Se o typecheck reclamar do tipo de `params` em `callChat`, tipar como
`Parameters<typeof fastify.openai.chat.completions.create>[0]` e fazer o cast no spread do
retry — o objetivo é zero `any`.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/chat
git commit -m "fix(coach): finish_reason tratado — retry curto em length, 502/422 sem persistir no histórico

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: contexto truncado por linha, números primeiro (C4)

**Files:**
- Modify: `backend/src/modules/chat/chat-context.ts:188-251` (`formatUserContext`)
- Test: `backend/src/modules/chat/chat-context.test.ts` (adiciona describe)

- [ ] **Step 1: teste que falha**

```ts
describe('formatUserContext — truncamento por linha (C4)', () => {
  function bigData(): UserContextData {
    return {
      profile: fullProfile,
      diet: {
        name: 'Plano '.repeat(180).trim(), // ~1080 chars: força o corte
        targetCalories: 2100,
        targetProtein: 148,
        targetCarbs: 210,
        targetFat: 58,
      },
      today: todayPlan(),
      freeMeals: [],
      streak: 12,
      mealsPerDay: 4,
      date: '2026-07-24',
    }
  }

  it('nunca corta uma linha no meio: toda linha termina com ponto', () => {
    const out = formatUserContext(bigData())
    expect(out.length).toBeLessThanOrEqual(1400)
    const lines = out.split('\n').slice(1) // sem o cabeçalho
    for (const l of lines) expect(l).toMatch(/\.$/)
  })

  it('as linhas numéricas (meta, consumido, faltam) vêm antes das descritivas', () => {
    const out = formatUserContext(bigData())
    expect(out.indexOf('Faltam:')).toBeGreaterThan(-1)
    expect(out.indexOf('Faltam:')).toBeLessThan(out.indexOf('Perfil:'))
  })

  it('o que não cabe é a ÚLTIMA linha (streak), não a de "Faltam"', () => {
    const out = formatUserContext(bigData())
    expect(out).toContain('Faltam: 1480 kcal, 102g proteína.')
    expect(out).not.toContain('Streak')
  })
})
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat/chat-context.test.ts`
Expected: FAIL — `Perfil` vem antes; o corte por caractere deixa a última linha sem ponto.

- [ ] **Step 3: implementar**

Reescrever `formatUserContext` mantendo os textos, mudando a ordem e o corte:

```ts
/**
 * Bloco de contexto (pura). String vazia se não houver nada útil.
 * C4: linhas numéricas primeiro (meta, consumido, faltam, próxima) e corte POR
 * LINHA — o corte por caractere podia virar "Faltam: 12" logo abaixo de "nunca
 * invente valores".
 */
export function formatUserContext(data: UserContextData): string {
  const lines: string[] = []
  const p = data.profile

  if (data.diet) {
    lines.push(
      `Dieta ativa: "${data.diet.name}" — meta ${data.diet.targetCalories} kcal | ` +
        `${data.diet.targetProtein}g prot | ${data.diet.targetCarbs}g carb | ${data.diet.targetFat}g gord.`,
    )
    const c = consumedToday(data)
    lines.push(
      `Hoje (${data.date}): consumidas ${c.calories} kcal / ${c.protein}g prot ` +
        `(plano: ${c.planCompleted} de ${c.planTotal} refeições concluídas; diário livre: ${data.freeMeals.length} item(ns)).`,
    )
    const remainingCal = data.diet.targetCalories - c.calories
    const remainingProt = data.diet.targetProtein - c.protein
    lines.push(`Faltam: ${remainingCal} kcal, ${remainingProt}g proteína.`)
    const next = data.today?.meals.find((m) => !m.completedToday)
    if (next) {
      const at = next.suggestedTime ? ` (${next.suggestedTime})` : ''
      lines.push(
        `Próxima refeição do plano: ${next.title}${at} — ${Math.round(next.calories)} kcal.`,
      )
    }
  } else {
    const c = consumedToday(data)
    if (data.freeMeals.length > 0) {
      lines.push(
        `Hoje (${data.date}): ${c.calories} kcal / ${c.protein}g prot no diário livre (sem dieta ativa gerada).`,
      )
    }
  }

  if (p && (p.weight_kg || p.height_cm || p.goal)) {
    const bits: string[] = []
    if (p.weight_kg) bits.push(`${p.weight_kg}kg`)
    if (p.height_cm) bits.push(`${p.height_cm}cm`)
    const age = ageFromBirthDate(p.birth_date)
    if (age != null) bits.push(`${age} anos`)
    if (p.gender) bits.push(GENDER_LABELS[p.gender] ?? p.gender)
    if (p.goal) bits.push(`objetivo: ${GOAL_LABELS[p.goal] ?? p.goal}`)
    if (p.activity_level)
      bits.push(`atividade: ${ACTIVITY_LABELS[p.activity_level] ?? p.activity_level}`)
    lines.push(`Perfil: ${bits.join(', ')}.`)
  }

  if (p?.dietary_restrictions?.length || p?.allergies?.length) {
    const parts: string[] = []
    if (p.dietary_restrictions?.length)
      parts.push(`Restrições: ${p.dietary_restrictions.slice(0, LIST_MAX_ITEMS).join(', ')}`)
    if (p.allergies?.length)
      parts.push(`Alergias: ${p.allergies.slice(0, LIST_MAX_ITEMS).join(', ')}`)
    lines.push(`${parts.join('. ')}.`)
  }

  if (data.streak != null && data.streak > 0) lines.push(`Streak atual: ${data.streak} dias.`)

  if (lines.length === 0) return ''

  const header = '## CONTEXTO DO USUÁRIO (dados reais — use-os; não invente valores)'
  return truncateByLines(header, lines, CONTEXT_MAX_CHARS)
}

/** Acrescenta linhas inteiras até o teto; a primeira que não couber encerra. */
export function truncateByLines(header: string, lines: string[], max: number): string {
  let out = header
  for (const line of lines) {
    if (out.length + 1 + line.length > max) break
    out += `\n${line}`
  }
  return out
}
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run src/modules/chat/chat-context.test.ts`
Expected: PASS. Se um teste **antigo** afirmar a ordem "Perfil antes de Dieta ativa", atualizar
esse teste para a ordem nova com um comentário citando C4 — a ordem mudou de propósito.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/chat/chat-context.ts src/modules/chat/chat-context.test.ts
git commit -m "fix(coach): contexto do usuário truncado por linha, com os números antes das descrições

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: histórico que falha alto + códigos documentados nas rotas (C5, C6)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts:417-437` (`persistHistory`)
- Modify: `backend/src/modules/chat/chat.routes.ts:59-64`
- Test: `backend/src/modules/chat/chat.service.finish.test.ts` (adiciona it)

- [ ] **Step 1: teste que falha**

```ts
  it('falha ao gravar o histórico → 500 HISTORY_WRITE_FAILED (o app oferece reenviar)', async () => {
    const { fastify } = fakeFastify([['INSERT INTO chat_history', new Error('db down')]], {
      chatCreate: async () => textCompletion('Olá!'),
    })

    await expect(sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })).rejects.toMatchObject({
      statusCode: 500,
      code: 'HISTORY_WRITE_FAILED',
    })
  })
```

(O `fakeFastify` da Task 4 rejeita a query quando a rota devolve um `Error`.)

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/chat/chat.service.finish.test.ts`
Expected: FAIL — hoje resolve normalmente (o erro é engolido com warn).

- [ ] **Step 3: implementar**

```ts
async function persistHistory(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  messages: ChatHistoryMessage[],
  status: string,
): Promise<void> {
  const messagesStr = JSON.stringify(messages)
  try {
    await fastify.db`
      INSERT INTO chat_history (id, user_id, messages, status)
      VALUES (${conversationId}, ${userId}, ${messagesStr}::jsonb, ${status})
      ON CONFLICT (id) DO UPDATE
        SET messages   = ${messagesStr}::jsonb,
            status     = ${status},
            updated_at = NOW()
    `
  } catch (err) {
    // C5: o histórico é a fonte de verdade da conversa. Engolir a falha
    // devolvia conversation_id ao app e a próxima mensagem vinha sem o turno
    // anterior. O app já trata falha de envio com "Tentar novamente".
    fastify.log.error({ err, conversationId }, 'Falha ao persistir histórico de chat')
    throw new AppError(500, 'HISTORY_WRITE_FAILED', 'Não consegui salvar a conversa. Envie a mensagem de novo.')
  }
}
```

Em `chat.routes.ts`, a resposta do `POST /message`:

```ts
        response: {
          200: chatResponseSchema,
          401: errorSchema,
          422: errorSchema.describe('AI_CONTENT_FILTERED — o modelo recusou a mensagem'),
          429: errorSchema.describe('Limite de mensagens atingido (TOO_MANY_REQUESTS)'),
          500: errorSchema.describe('HISTORY_WRITE_FAILED — a conversa não foi salva; reenviar'),
          502: errorSchema.describe('AI_ERROR | AI_UNAVAILABLE | AI_TRUNCATED — nada foi persistido'),
          504: errorSchema.describe('AI_TIMEOUT'),
        },
```

- [ ] **Step 4: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: verde; lint ≤ 11.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/chat
git commit -m "fix(coach): falha ao gravar o histórico vira 500 HISTORY_WRITE_FAILED; códigos de erro documentados na rota

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Fase D — Operação, cortável (bloco P)

Cada tarefa desta fase é independente das outras e pode ser adiada sem afetar A–C.

### Task 16: lock em voo do `/step` + rate limit próprio (OP1)

**Files:**
- Create: `backend/supabase/migrations/017_diet_jobs_step_lock.sql`
- Modify: `backend/src/modules/diets/jobs.service.ts` (`processJobStep`, `failJob`)
- Modify: `backend/src/modules/diets/diets.routes.ts:291-315` (rota `/jobs/:id/step`)
- Modify: `app/src/features/coach/store.ts:167-231` (`runDietGeneration`)
- Test: `backend/src/modules/diets/process-job-step.test.ts` (ajusta `setup`, adiciona it)

**Interfaces:**
- Coluna nova `diet_jobs.step_started_at TIMESTAMPTZ NULL`. Adquirida antes da chamada de IA,
  liberada (`NULL`) ao persistir, ao falhar e no caminho `CONCURRENT_STEP`. Expira em 150 s
  (a chamada de IA tem timeout de 120 s).
- `/step` responde 200 com o status atual, **sem chamar IA**, quando outro step está em voo.

- [ ] **Step 1: migração**

```sql
-- backend/supabase/migrations/017_diet_jobs_step_lock.sql
-- ============================================================
-- Migration 017 — Lock em voo da geração de dia (OP1 dos guardrails de IA)
-- Idempotente.
-- ============================================================
-- Dois aparelhos logados, ou o app reaberto durante a geração, chamavam
-- /step ao mesmo tempo. O lock otimista no UPDATE já impedia persistir o
-- mesmo dia duas vezes — mas as duas chamadas de IA já tinham sido pagas.
ALTER TABLE public.diet_jobs
  ADD COLUMN IF NOT EXISTS step_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.diet_jobs.step_started_at IS
  'Lock em voo do /step: NULL quando nenhum dia está sendo gerado. Expira em 150 s (timeout da IA é 120 s).';
```

- [ ] **Step 2: testes (falham)**

Em `process-job-step.test.ts`, acrescentar a rota do lock ao `setup()` existente:

```ts
function setup(days: AiSingleDay[]) {
  const queue = [...days]
  return fakeFastify(
    [
      ['FROM diet_jobs WHERE id', [jobRow]],
      ['SET step_started_at', [{ id: JOB }]], // OP1: lock adquirido
      ['SET days_completed', [{ id: JOB }]],
    ],
    {
      parse: async () => ({
        choices: [{ message: { parsed: queue.shift() ?? null } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    },
  )
}
```

(Os testes que constroem o fake sem `setup()` — o do marcador de conclusão da Task 12 e o
"erro de rede na IA" da Task 10 — também ganham a linha `['SET step_started_at', [{ id: JOB }]]`;
sem ela, o lock não é adquirido e o serviço devolve o status sem chamar a IA.)

E um describe novo:

```ts
describe('processJobStep — lock em voo (OP1)', () => {
  it('com outro step em voo, devolve o status atual SEM chamar a IA', async () => {
    const { fastify, openaiCalls, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', []], // 0 linhas: lock não adquirido
      ],
      { parse: async () => { throw new Error('não deveria chamar') } },
    )

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(0)
    expect(r.daysCompleted).toBe(0)
    expect(r.status).toBe('running')
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(false)
  })

  it('a query do lock só adquire se NULL ou expirado há 150 s', async () => {
    const { fastify, calls } = setup([dayWith('Frango grelhado')])
    await processJobStep(fastify, USER, JOB)
    const lock = calls.find((c) => c.sql.includes('SET step_started_at = NOW()'))
    expect(lock?.sql).toContain("interval '150 seconds'")
    expect(lock?.sql).toContain('RETURNING id')
  })

  it('libera o lock ao persistir o dia', async () => {
    const { fastify, calls } = setup([dayWith('Frango grelhado')])
    await processJobStep(fastify, USER, JOB)
    const persist = calls.find((c) => c.sql.includes('SET days_completed'))
    expect(persist?.sql).toContain('step_started_at = NULL')
  })

  it('libera o lock ao falhar', async () => {
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ id: JOB }]],
      ],
      { parse: async () => { throw new Error('ECONNRESET') } },
    )
    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({ code: 'DIET_STEP_FAILED' })
    const fail = calls.find((c) => c.sql.includes("status = 'failed'") && c.sql.includes('diet_jobs'))
    expect(fail?.sql).toContain('step_started_at = NULL')
  })
})
```

- [ ] **Step 3: rodar e ver falhar**

Run: `cd backend && npx vitest run src/modules/diets/process-job-step.test.ts`
Expected: FAIL — a IA é chamada mesmo sem lock; nenhum SQL menciona `step_started_at`.

- [ ] **Step 4: implementar**

Em `processJobStep`, logo antes do comentário `// 1) Gera o dia`:

```ts
  // OP1: lock em voo. Sem ele, dois aparelhos (ou o app reaberto) pagavam duas
  // gerações do mesmo dia — o lock otimista lá embaixo só evitava persistir em
  // dobro. Expira em 150 s: acima do timeout de 120 s da IA, para uma função
  // morta no meio não travar o job para sempre.
  const acquired = await fastify.db`
    UPDATE diet_jobs SET step_started_at = NOW()
    WHERE id = ${jobId} AND status IN ('pending', 'running')
      AND (step_started_at IS NULL OR step_started_at < NOW() - interval '150 seconds')
    RETURNING id
  `
  if (acquired.count === 0) {
    fastify.log.info({ jobId, dayNumber }, 'Step já em andamento — sem nova chamada de IA')
    return toStatus(job)
  }
```

No `UPDATE diet_jobs` da persistência (dentro do `begin`):

```ts
      const res = await sql`
        UPDATE diet_jobs
        SET days_completed = ${dayNumber}, status = 'running', step_started_at = NULL, updated_at = NOW()
        WHERE id = ${jobId} AND days_completed = ${dayNumber - 1}
      `
```

No caminho `CONCURRENT_STEP`, antes do `return`:

```ts
      await fastify.db`UPDATE diet_jobs SET step_started_at = NULL WHERE id = ${jobId}`
```

Em `failJob`, o primeiro UPDATE passa a:

```ts
    UPDATE diet_jobs
    SET status = 'failed', error = ${error.slice(0, 300)}, step_started_at = NULL, updated_at = NOW()
    WHERE id = ${jobId}
```

Na rota `/jobs/:id/step` em `diets.routes.ts`, acrescentar antes de `schema:`:

```ts
      // OP1: 7 dias + folga. Sem limite próprio, um cliente em loop pagava IA sem parar.
      config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
```

e na resposta: `429: errorSchema.describe('TOO_MANY_REQUESTS — 12 steps/min')`.

- [ ] **Step 5: app — não martelar o `/step` quando o dia não avançou**

Com o lock, um `/step` concorrente responde 200 na hora com o mesmo `daysCompleted`; o loop do
app chamaria de novo imediatamente. Em `runDietGeneration`, dentro do `try` do `for`, depois
de `apply(s)` e dos dois `if` de completed/failed:

```ts
            // OP1: 200 sem avanço = outro step em voo no servidor. Espera antes
            // de pedir de novo, em vez de bater no rate limit.
            if (s.daysCompleted === before) await sleep(5000);
```

e, logo no início do corpo do `for`, antes do `try`: `const before = get().dietJob?.daysCompleted ?? 0;`
(a variável `before` já existe dentro do `catch`; movê-la para o topo do `for` e remover a
declaração duplicada do `catch`).

Run: `cd app && ./node_modules/.bin/jest src/features/coach/store.test.ts --ci`
Expected: PASS — os testes existentes mockam `stepJob` avançando a cada chamada, logo o
`sleep` novo nunca dispara neles.

- [ ] **Step 6: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run && cd ../app && ./node_modules/.bin/tsc --noEmit`
Expected: verde.

- [ ] **Step 7: commit**

```bash
cd backend && npm run format && git add supabase/migrations/017_diet_jobs_step_lock.sql src/modules/diets ../app/src/features/coach/store.ts
git commit -m "feat(diets): lock em voo do /step e rate limit próprio — nunca duas gerações do mesmo dia

Migração 017 adiciona diet_jobs.step_started_at. O app espera 5 s quando o
step responde sem avanço.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

> **Deploy:** a migração 017 precisa rodar no Supabase ANTES do deploy deste commit — sem a
> coluna, todo `/step` falha. Junto com a 016, que ainda está pendente.

---

### Task 17: teto diário de tokens por usuário (OP2)

**Files:**
- Modify: `backend/src/shared/env.ts`, `backend/.env.example`
- Modify: `backend/src/shared/ai-usage.ts` (novo `checkDailyQuota`)
- Modify: `backend/src/modules/chat/chat.service.ts`, `backend/src/modules/diets/jobs.service.ts`,
  `backend/src/modules/scanner/scanner.service.ts` (chamada no início)
- Modify: `backend/src/modules/diets/diets.routes.ts`, `backend/src/modules/scanner/scanner.routes.ts` (429 documentado)
- Modify: `app/src/features/coach/store.ts` (mensagem específica)
- Test: `backend/src/shared/ai-usage.test.ts` (adiciona describe), `app/src/features/coach/store.test.ts` (adiciona it)

**Interfaces:**
- `env.AI_DAILY_TOKEN_CAP: number` (default `200000`).
- `export async function checkDailyQuota(fastify, userId): Promise<void>` — lança
  `AppError(429, 'AI_QUOTA_EXCEEDED', …)` quando a soma de `total_tokens` das últimas 24 h ≥ teto.
  **Fail-open:** se a consulta falhar, libera com `warn` (telemetria indisponível não bloqueia o produto).

- [ ] **Step 1: testes (falham)**

Em `ai-usage.test.ts`:

```ts
import { checkDailyQuota } from './ai-usage.js'
import { fakeFastify } from './testing/fake-fastify.js'

describe('checkDailyQuota (OP2)', () => {
  const USER = '11111111-1111-1111-1111-111111111111'

  it('abaixo do teto: resolve', async () => {
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: 10 }]]])
    await expect(checkDailyQuota(fastify, USER)).resolves.toBeUndefined()
  })

  it('no teto ou acima: 429 AI_QUOTA_EXCEEDED', async () => {
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: 200_000 }]]])
    await expect(checkDailyQuota(fastify, USER)).rejects.toMatchObject({ statusCode: 429, code: 'AI_QUOTA_EXCEEDED' })
  })

  it('consulta só as últimas 24h do usuário', async () => {
    const { fastify, calls } = fakeFastify([['FROM ai_usage', [{ used: 0 }]]])
    await checkDailyQuota(fastify, USER)
    expect(calls[0].sql).toContain("interval '24 hours'")
    expect(calls[0].params).toContain(USER)
  })

  it('telemetria indisponível: libera com warn (fail-open)', async () => {
    const { fastify, logs } = fakeFastify([['FROM ai_usage', new Error('tabela sumiu')]])
    await expect(checkDailyQuota(fastify, USER)).resolves.toBeUndefined()
    expect(logs.some((l) => l.level === 'warn')).toBe(true)
  })
})
```

Em `app/src/features/coach/store.test.ts`:

```ts
  it('429 AI_QUOTA_EXCEEDED mostra a mensagem de limite diário, não a genérica', async () => {
    const { coachService } = jest.requireMock('@shared/services/coach.service');
    const quota = Object.assign(new Error('429'), {
      isAxiosError: true,
      response: { status: 429, data: { error: 'AI_QUOTA_EXCEEDED' } },
    });
    coachService.sendMessage.mockRejectedValueOnce(quota);

    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('oi'));

    expect(result.current.error).toBe('Você atingiu o limite diário do coach. Volte amanhã.');
    expect(result.current.lastFailedAction).toBe('send');
  });
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/ai-usage.test.ts; cd ../app && ./node_modules/.bin/jest src/features/coach/store.test.ts --ci`
Expected: FAIL nos dois.

- [ ] **Step 3: env**

Em `env.ts`, dentro do `z.object`, depois de `OPENAI_FALLBACK_MODELS`:

```ts
    // OP2: teto diário de tokens por usuário (soma de ai_usage nas últimas 24h).
    // Acima → 429 AI_QUOTA_EXCEEDED em chat, geração de dia e visão.
    AI_DAILY_TOKEN_CAP: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().int().positive().default(200_000),
    ),
```

Em `.env.example`, no bloco de IA:

```
# Teto diário de tokens por usuário (chat + dias de dieta + visão). Uma dieta
# de 7 dias custa ~60-90k tokens; 200k = ~2 dietas/dia. 429 AI_QUOTA_EXCEEDED acima.
AI_DAILY_TOKEN_CAP=200000
```

- [ ] **Step 4: `checkDailyQuota`**

Em `ai-usage.ts` (imports novos: `import { env } from './env.js'` e `import { AppError } from './errors.js'`):

```ts
/**
 * OP2: teto diário por usuário. Rate limits por minuto existiam; por dia, não —
 * e ai_usage era gravada e nunca lida. Fail-open: se a tabela estiver fora,
 * libera com warn; telemetria não pode bloquear o produto.
 */
export async function checkDailyQuota(fastify: FastifyInstance, userId: string): Promise<void> {
  let used = 0
  try {
    const [row] = await fastify.db<{ used: number }[]>`
      SELECT COALESCE(SUM(total_tokens), 0)::INT AS used
      FROM ai_usage
      WHERE user_id = ${userId} AND created_at >= NOW() - interval '24 hours'
    `
    used = row?.used ?? 0
  } catch (err) {
    fastify.log.warn(err, 'Falha ao consultar quota diária de IA — liberando (fail-open)')
    return
  }
  if (used >= env.AI_DAILY_TOKEN_CAP) {
    fastify.log.warn({ userId, used, cap: env.AI_DAILY_TOKEN_CAP }, 'Quota diária de IA excedida')
    throw new AppError(
      429,
      'AI_QUOTA_EXCEEDED',
      'Você atingiu o limite diário de uso da IA. Tente novamente amanhã.',
    )
  }
}
```

- [ ] **Step 5: chamadas**

- `sendChatMessage`: primeira linha do corpo: `await checkDailyQuota(fastify, userId)`.
- `processJobStep`: logo antes do bloco do lock (OP1): `await checkDailyQuota(fastify, userId)`.
- `analyzePhoto`: primeira linha do corpo: `await checkDailyQuota(fastify, userId)`.

Nos testes de serviço existentes o mock devolve `[]` para `FROM ai_usage` → `used = 0` → passa.

Rotas: em `diets.routes.ts` (`/step`) trocar o 429 por
`429: errorSchema.describe('TOO_MANY_REQUESTS (12/min) | AI_QUOTA_EXCEEDED (teto diário)')`;
em `scanner.routes.ts` acrescentar `429: errorSchema.describe('TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED')`;
em `chat.routes.ts` o 429 passa a `'TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED'`.

- [ ] **Step 6: app**

Em `store.ts`, no topo: `import axios from 'axios';` e

```ts
const QUOTA_MESSAGE = 'Você atingiu o limite diário do coach. Volte amanhã.';
const SEND_ERROR_MESSAGE = 'Nao foi possivel enviar sua mensagem. Tente novamente.';

function isQuotaExceeded(e: unknown): boolean {
  return (
    axios.isAxiosError(e) &&
    e.response?.status === 429 &&
    (e.response.data as { error?: string } | undefined)?.error === 'AI_QUOTA_EXCEEDED'
  );
}
```

Nos dois `catch` de envio (`sendMessage` e `retryLastAction`), trocar `catch {` por `catch (e) {` e
`error: 'Nao foi possivel enviar sua mensagem. Tente novamente.'` por
`error: isQuotaExceeded(e) ? QUOTA_MESSAGE : SEND_ERROR_MESSAGE`.

- [ ] **Step 7: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run; cd ../app && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest --ci 2>&1 | tail -5`
Expected: verde nos dois lados.

- [ ] **Step 8: commit**

```bash
cd backend && npm run format && git add src .env.example ../app/src/features/coach
git commit -m "feat(ai): teto diário de tokens por usuário (AI_DAILY_TOKEN_CAP) em chat, dieta e visão

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: visão — limites, `uncertain`, cache por hash (OP3)

**Files:**
- Create: `backend/src/shared/guardrails/vision.ts`, `backend/supabase/migrations/018_scan_cache.sql`
- Modify: `backend/src/shared/guardrails/index.ts` (reexport)
- Modify: `backend/src/modules/scanner/scanner.schemas.ts`, `backend/src/modules/scanner/scanner.service.ts`
- Modify: `app/src/shared/services/scanner.service.ts`, `app/src/features/scanner/components/ScanItemRow.tsx`
- Test: `backend/src/shared/guardrails/vision.test.ts`, `backend/src/modules/scanner/scanner.service.test.ts` (novo),
  `app/src/features/scanner/components/ScanItemRow.test.tsx` (adiciona it)

**Interfaces:**
- ```ts
  export const VISION_MAX_KCAL = 3000
  export const VISION_UNCERTAIN_BELOW = 0.5
  export function sanitizeVisionResult(a: { calories: number; protein: number; carbs: number; fat: number; confidence: number }):
    { calories: number; protein: number; carbs: number; fat: number; confidence: number; uncertain: boolean }
  ```
- Contrato: `scanItemSchema` ganha `uncertain: z.boolean()`; o app lê `item.uncertain`.
- Tabela `scan_cache(image_hash TEXT PK, result JSONB, created_at)`; `result` é
  `{ notFood: true }` ou `{ notFood: false, item: { name, calories, protein, carbs, fat, confidence, uncertain } }`.

- [ ] **Step 1: testes (falham)**

```ts
// backend/src/shared/guardrails/vision.test.ts
import { describe, expect, it } from 'vitest'
import { sanitizeVisionResult } from './vision.js'

describe('sanitizeVisionResult (OP3)', () => {
  it('prato comum passa intacto e não é incerto', () => {
    const r = sanitizeVisionResult({ calories: 650, protein: 40, carbs: 70, fat: 18, confidence: 0.82 })
    expect(r).toEqual({ calories: 650, protein: 40, carbs: 70, fat: 18, confidence: 0.82, uncertain: false })
  })

  it('kcal incoerente com macros (>25%) é recalculada', () => {
    // 4*40 + 4*70 + 9*18 = 602; 1200 está 50% acima
    const r = sanitizeVisionResult({ calories: 1200, protein: 40, carbs: 70, fat: 18, confidence: 0.9 })
    expect(r.calories).toBe(602)
  })

  it('acima de 3000 kcal: clampa e escala os macros junto', () => {
    // macros coerentes com 40000 kcal
    const r = sanitizeVisionResult({ calories: 40000, protein: 2000, carbs: 5000, fat: 1333, confidence: 0.9 })
    expect(r.calories).toBe(3000)
    expect(r.protein).toBe(150)
    expect(r.carbs).toBe(375)
    expect(r.fat).toBe(100)
  })

  it('negativos viram zero', () => {
    const r = sanitizeVisionResult({ calories: -5, protein: -1, carbs: 0, fat: 0, confidence: 0.7 })
    expect(r.calories).toBe(0)
    expect(r.protein).toBe(0)
  })

  it('confiança < 0.5 marca uncertain e clampa a [0, 1]', () => {
    expect(sanitizeVisionResult({ calories: 100, protein: 5, carbs: 10, fat: 2, confidence: 0.3 }).uncertain).toBe(true)
    expect(sanitizeVisionResult({ calories: 100, protein: 5, carbs: 10, fat: 2, confidence: 1.7 }).confidence).toBe(1)
  })
})
```

```ts
// backend/src/modules/scanner/scanner.service.test.ts
import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { analyzePhoto } from './scanner.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const IMG = 'data:image/jpeg;base64,AAAA'
const analysis = { is_food: true, name: 'Arroz e feijão', calories: 500, protein: 20, carbs: 80, fat: 8, confidence: 0.4 }

describe('analyzePhoto — guardrails e cache (OP3)', () => {
  it('sem cache: chama a IA, devolve uncertain e grava no cache', async () => {
    const { fastify, openaiCalls, calls } = fakeFastify([], {
      parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }),
    })

    const r = await analyzePhoto(fastify, IMG, USER)

    expect(openaiCalls).toHaveLength(1)
    expect(r.items[0].uncertain).toBe(true)
    expect(r.items[0].name).toBe('Arroz e feijão')
    expect(calls.some((c) => c.sql.includes('INSERT INTO scan_cache'))).toBe(true)
  })

  it('com cache (24h): devolve o resultado guardado SEM chamar a IA', async () => {
    const cached = { notFood: false, item: { name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0, confidence: 0.9, uncertain: false } }
    const { fastify, openaiCalls } = fakeFastify([['FROM scan_cache', [{ result: cached }]]], {
      parse: async () => { throw new Error('não deveria chamar') },
    })

    const r = await analyzePhoto(fastify, IMG, USER)

    expect(openaiCalls).toHaveLength(0)
    expect(r.items[0].name).toBe('Banana')
    expect(r.items[0].id).toBeTruthy()
  })

  it('cache de "não é comida" também evita a chamada', async () => {
    const { fastify, openaiCalls } = fakeFastify([['FROM scan_cache', [{ result: { notFood: true } }]]], {
      parse: async () => { throw new Error('não deveria chamar') },
    })
    await expect(analyzePhoto(fastify, IMG, USER)).rejects.toMatchObject({ code: 'NOT_FOOD' })
    expect(openaiCalls).toHaveLength(0)
  })
})
```

Em `ScanItemRow.test.tsx`:

```tsx
  it('mostra o aviso de estimativa incerta quando uncertain=true', () => {
    const { getByText, queryByText, rerender } = render(
      <ScanItemRow item={{ ...item, uncertain: true }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Estimativa incerta — confira os valores')).toBeTruthy();
    rerender(<ScanItemRow item={item} onChange={() => {}} onRemove={() => {}} />);
    expect(queryByText('Estimativa incerta — confira os valores')).toBeNull();
  });
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/guardrails/vision.test.ts src/modules/scanner; cd ../app && ./node_modules/.bin/jest src/features/scanner/components/ScanItemRow.test.tsx --ci`
Expected: FAIL.

- [ ] **Step 3: `vision.ts`**

```ts
// backend/src/shared/guardrails/vision.ts
import { kcalFromMacros } from './day.js'

/**
 * OP3: a visão só garantia `≥ 0`. Um prato de 40 000 kcal passava e a confiança
 * era clampada e depois ignorada.
 */
export const VISION_MAX_KCAL = 3000
export const VISION_UNCERTAIN_BELOW = 0.5
const KCAL_MISMATCH_TOLERANCE = 0.25

export function sanitizeVisionResult(a: {
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
}): { calories: number; protein: number; carbs: number; fat: number; confidence: number; uncertain: boolean } {
  let protein = Math.max(0, Math.round(a.protein))
  let carbs = Math.max(0, Math.round(a.carbs))
  let fat = Math.max(0, Math.round(a.fat))
  let calories = Math.max(0, Math.round(a.calories))

  const expected = kcalFromMacros(protein, carbs, fat)
  if (expected > 0 && Math.abs(calories - expected) / Math.max(calories, 1) > KCAL_MISMATCH_TOLERANCE) {
    calories = Math.round(expected)
  }
  if (calories > VISION_MAX_KCAL) {
    const factor = VISION_MAX_KCAL / calories
    protein = Math.round(protein * factor)
    carbs = Math.round(carbs * factor)
    fat = Math.round(fat * factor)
    calories = VISION_MAX_KCAL
  }

  const confidence = Math.min(1, Math.max(0, a.confidence))
  return { calories, protein, carbs, fat, confidence, uncertain: confidence < VISION_UNCERTAIN_BELOW }
}
```

Em `index.ts`: `export * from './vision.js'`.

- [ ] **Step 4: migração**

```sql
-- backend/supabase/migrations/018_scan_cache.sql
-- ============================================================
-- Migration 018 — Cache de análise de foto (OP3 dos guardrails de IA)
-- A mesma foto reenviada era uma chamada de visão nova. Chave: sha256 do
-- data URL; validade de 24h (consultada no SELECT). Sem PII: só nome do
-- prato e macros. Idempotente.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scan_cache (
  image_hash TEXT        PRIMARY KEY,
  result     JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scan_cache_created_idx ON public.scan_cache (created_at);

-- RLS habilitada SEM policy: só o backend (service_role) lê/escreve.
ALTER TABLE public.scan_cache ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: schema e serviço**

Em `scanner.schemas.ts`, `scanItemSchema` ganha, depois de `confidence`:

```ts
  /** OP3: confiança < 0.5 — o app pede para conferir os valores. */
  uncertain: z.boolean(),
```

`scanner.service.ts` completo:

```ts
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import { buildModelsField, checkDailyQuota, logAiUsage } from '../../shared/ai-usage.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { sanitizeVisionResult } from '../../shared/guardrails/index.js'
import { type ScanItem, type ScanResponse, visionAnalysisSchema } from './scanner.schemas.js'

const VISION_SYSTEM_PROMPT = `Você é um nutricionista especialista em análise visual de alimentos.
Receberá a foto de um prato/refeição e deve estimar os valores nutricionais do que está visível.

## REGRAS
- Identifique o prato com um nome curto em português (ex: "Arroz, feijão e frango grelhado").
- Estime os totais da PORÇÃO INTEIRA visível na foto (não por 100g).
- calories em kcal; protein, carbs e fat em gramas. Use números inteiros ou com 1 casa decimal.
- confidence é a sua confiança na estimativa, entre 0 e 1 (ex: 0.82).
- Se a imagem NÃO contiver comida (pessoa, paisagem, objeto, etc.), retorne is_food=false
  e zere os demais valores.
- Baseie-se em alimentos brasileiros comuns quando houver ambiguidade.`

type CachedItem = Omit<ScanItem, 'id'>
type CacheResult = { notFood: true } | { notFood: false; item: CachedItem }

async function readCache(fastify: FastifyInstance, hash: string): Promise<CacheResult | null> {
  try {
    const [row] = await fastify.db<{ result: CacheResult }[]>`
      SELECT result FROM scan_cache
      WHERE image_hash = ${hash} AND created_at > NOW() - interval '24 hours'
    `
    return row?.result ?? null
  } catch (err) {
    fastify.log.warn(err, 'Falha ao ler scan_cache — seguindo sem cache')
    return null
  }
}

function writeCache(fastify: FastifyInstance, hash: string, result: CacheResult): void {
  void fastify.db`
    INSERT INTO scan_cache (image_hash, result)
    VALUES (${hash}, ${JSON.stringify(result)}::jsonb)
    ON CONFLICT (image_hash) DO UPDATE SET result = EXCLUDED.result, created_at = NOW()
  `.catch((err: unknown) => {
    try {
      fastify.log.warn(err, 'Falha ao gravar scan_cache (best-effort)')
    } catch {
      // nada mais a fazer sem derrubar a request
    }
  })
}

/**
 * Analisa a foto de um prato via OpenAI Vision e retorna a estimativa nutricional.
 * Recebe a imagem como data URL base64 (data:image/...;base64,...).
 */
export async function analyzePhoto(
  fastify: FastifyInstance,
  imageDataUrl: string,
  userId: string,
): Promise<ScanResponse> {
  await checkDailyQuota(fastify, userId)

  // OP3: a mesma foto reenviada não paga uma chamada nova.
  const hash = createHash('sha256').update(imageDataUrl).digest('hex')
  const cached = await readCache(fastify, hash)
  if (cached) {
    if (cached.notFood) throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
    return { items: [{ id: randomUUID(), ...cached.item }] }
  }

  let analysis: import('./scanner.schemas.js').VisionAnalysis
  try {
    const completion = await fastify.openai.beta.chat.completions.parse({
      model: env.OPENAI_VISION_MODEL,
      // I5.2: fallbacks do OpenRouter (spread não dispara excess-property check).
      ...buildModelsField(env.OPENAI_VISION_MODEL, env.OPENAI_FALLBACK_MODELS),
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise esta refeição e estime os valores nutricionais.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
          ],
        },
      ],
      response_format: zodResponseFormat(visionAnalysisSchema, 'food_analysis'),
      // GPT-5 (reasoning + visão): sem temperature custom e com teto folgado pra
      // os reasoning tokens não estourarem antes do JSON da análise.
      max_tokens: 4000,
      // Reasoning baixo: análise de foto não precisa raciocínio profundo e reduz latência.
      reasoning_effort: 'low',
    })

    logAiUsage(fastify, {
      feature: 'vision',
      model: env.OPENAI_VISION_MODEL,
      userId,
      usage: completion.usage,
    })
    const parsed = completion.choices[0].message.parsed
    if (!parsed) throw new Error('OpenAI retornou análise vazia')
    analysis = parsed
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao analisar foto via Vision')
    throw new AppError(502, 'VISION_ERROR', 'Não foi possível analisar a imagem. Tente novamente.')
  }

  if (!analysis.is_food) {
    writeCache(fastify, hash, { notFood: true })
    throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
  }

  const item: CachedItem = { name: analysis.name, ...sanitizeVisionResult(analysis) }
  writeCache(fastify, hash, { notFood: false, item })
  return { items: [{ id: randomUUID(), ...item }] }
}
```

- [ ] **Step 6: app**

`app/src/shared/services/scanner.service.ts`: em `ScanItem`, acrescentar `uncertain?: boolean;`
depois de `confidence`. O `normalize` já espalha o item (`{ ...it, id }`), então o campo passa.

`ScanItemRow.tsx`: depois de `<ConfidenceBadge confidence={item.confidence} />`:

```tsx
      {item.uncertain ? (
        <Text style={styles.uncertain} accessibilityRole='text'>
          Estimativa incerta — confira os valores
        </Text>
      ) : null}
```

e no `StyleSheet`: `uncertain: { fontSize: typography.fontSize.xs, color: colors.warning },`.

- [ ] **Step 7: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run; cd ../app && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest --ci 2>&1 | tail -5`
Expected: verde.

- [ ] **Step 8: commit**

```bash
cd backend && npm run format && git add supabase/migrations/018_scan_cache.sql src ../app/src/shared/services/scanner.service.ts ../app/src/features/scanner
git commit -m "feat(scanner): limites na estimativa, flag de incerteza e cache de 24h por hash da imagem

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

> **Deploy:** migração 018 antes do deploy (o cache falha aberto sem a tabela, mas gera warn a cada foto).

---

### Task 19: telemetria com contexto + runbook (OP4)

**Files:**
- Create: `backend/supabase/migrations/019_ai_usage_context.sql`, `docs/operacao-ia.md`
- Modify: `backend/src/shared/ai-usage.ts` (`logAiUsage`), e os três call sites
  (`chat.service.ts`, `jobs.service.ts` → `generateDay`, `scanner.service.ts`)
- Test: `backend/src/shared/ai-usage.test.ts` (adiciona it)

**Interfaces:**
- `AiUsageParams` ganha `conversationId?: string | null`, `jobId?: string | null`,
  `finishReason?: string | null`, `toolCalled?: boolean | null`.
- `generateDay` (Task 10) ganha `jobId: string` como 3º parâmetro, para o log.

- [ ] **Step 1: teste (falha)**

```ts
describe('logAiUsage — contexto (OP4)', () => {
  it('grava conversation_id, finish_reason e tool_called quando informados', async () => {
    const { fastify, calls } = fakeFastify()
    logAiUsage(fastify, {
      feature: 'chat',
      model: 'm',
      userId: 'u',
      usage: { total_tokens: 10 },
      conversationId: 'conv-1',
      finishReason: 'tool_calls',
      toolCalled: true,
    })
    await new Promise((r) => setTimeout(r, 0))
    const ins = calls.find((c) => c.sql.includes('INSERT INTO ai_usage'))
    expect(ins?.sql).toContain('conversation_id')
    expect(ins?.params).toContain('conv-1')
    expect(ins?.params).toContain('tool_calls')
    expect(ins?.params).toContain(true)
  })
})
```

- [ ] **Step 2: migração**

```sql
-- backend/supabase/migrations/019_ai_usage_context.sql
-- ============================================================
-- Migration 019 — Contexto na telemetria de IA (OP4 dos guardrails)
-- Sem conversation_id não dava para ver "tool chamada 2x na mesma conversa"
-- (o sintoma do loop de geração). Idempotente.
-- ============================================================
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS job_id          UUID,
  ADD COLUMN IF NOT EXISTS finish_reason   TEXT,
  ADD COLUMN IF NOT EXISTS tool_called     BOOLEAN;

CREATE INDEX IF NOT EXISTS ai_usage_conversation_idx
  ON public.ai_usage (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;
```

- [ ] **Step 3: `logAiUsage`**

```ts
interface AiUsageParams {
  feature: AiFeature
  model: string
  userId: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null
  // OP4: contexto para consultas de alerta (loop de tool, truncamentos).
  conversationId?: string | null
  jobId?: string | null
  finishReason?: string | null
  toolCalled?: boolean | null
}
```

e o INSERT:

```ts
    void fastify.db`
      INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, total_tokens,
                            conversation_id, job_id, finish_reason, tool_called)
      VALUES (
        ${params.userId}, ${params.feature}, ${params.model},
        ${params.usage?.prompt_tokens ?? null},
        ${params.usage?.completion_tokens ?? null},
        ${params.usage?.total_tokens ?? null},
        ${params.conversationId ?? null}, ${params.jobId ?? null},
        ${params.finishReason ?? null}, ${params.toolCalled ?? null}
      )
    `.catch(…)  // igual ao atual
```

O objeto do `fastify.log.info` ganha os quatro campos também.

Call sites:
- `chat.service.ts` (as duas chamadas): `conversationId, finishReason: completion.choices[0]?.finish_reason ?? null, toolCalled: completion.choices[0]?.finish_reason === 'tool_calls'`.
- `jobs.service.ts` → `generateDay(fastify, userId, jobId, dayNumber, …)`: `jobId, finishReason: completion.choices[0]?.finish_reason ?? null`.
- `scanner.service.ts`: `finishReason: completion.choices[0]?.finish_reason ?? null`.

- [ ] **Step 4: runbook**

```markdown
<!-- docs/operacao-ia.md -->
# Operação da camada de IA

Referência rápida para quem opera o backend. Spec: `docs/superpowers/specs/2026-09-09-guardrails-ia-coach-design.md`.

## Variáveis de ambiente

| Var | Default | Efeito |
|---|---|---|
| `OPENAI_MODEL` | `openai/gpt-5` | chat do coach |
| `OPENAI_DIET_MODEL` | = `OPENAI_MODEL` | geração de dias (7 chamadas/dieta) |
| `OPENAI_VISION_MODEL` | `openai/gpt-5` | scanner |
| `OPENAI_FALLBACK_MODELS` | vazio | fallbacks do OpenRouter (CSV) |
| `AI_DAILY_TOKEN_CAP` | `200000` | teto diário de tokens por usuário → 429 `AI_QUOTA_EXCEEDED` |
| `RUN_AI_EVALS` | vazio | liga o eval offline (`src/evals/`) no `npm test` |

## Códigos de erro que envolvem IA

| Código | HTTP | Onde | Persistiu algo? |
|---|---|---|---|
| `AI_TRUNCATED` | 502 | chat | não |
| `AI_CONTENT_FILTERED` | 422 | chat | não |
| `HISTORY_WRITE_FAILED` | 500 | chat | não (o app reenvia) |
| `AI_QUOTA_EXCEEDED` | 429 | chat, step, scanner | não |
| `ALLERGEN_IN_OUTPUT` / `DAY_VALIDATION_FAILED` / `RECONCILE_FAILED` | 502 | step | job → `failed`; dia NÃO persistido; `/retry` continua do mesmo dia |
| `DIET_STEP_FAILED` | 502 | step | idem, por erro de IA/rede |

Recusas por segurança (menor de idade, condição de saúde, IMC < 18,5 com déficit) **não são erros**: voltam como texto do coach com status `collecting`.

## Consultas de alerta (SQL Editor do Supabase)

```sql
-- Loop de geração: mais de uma tool call na mesma conversa em 10 minutos
SELECT conversation_id, COUNT(*) AS tool_calls, MIN(created_at), MAX(created_at)
FROM ai_usage
WHERE feature = 'chat' AND tool_called = TRUE AND created_at >= NOW() - interval '10 minutes'
GROUP BY conversation_id
HAVING COUNT(*) > 1;

-- Truncamentos do chat nas últimas 24h (se subir, o max_tokens do retry está curto)
SELECT COUNT(*) FROM ai_usage
WHERE feature = 'chat' AND finish_reason = 'length' AND created_at >= NOW() - interval '24 hours';

-- Dias regenerados pelos guardrails (2 chamadas diet_day para o mesmo job em < 5 min)
SELECT job_id, COUNT(*) FROM ai_usage
WHERE feature = 'diet_day' AND created_at >= NOW() - interval '1 day'
GROUP BY job_id HAVING COUNT(*) > 7;

-- Usuários perto do teto diário
SELECT user_id, SUM(total_tokens) AS used FROM ai_usage
WHERE created_at >= NOW() - interval '24 hours'
GROUP BY user_id HAVING SUM(total_tokens) > 150000 ORDER BY used DESC;
```

## Migrações desta camada

`017_diet_jobs_step_lock.sql` (obrigatória antes do deploy), `018_scan_cache.sql`, `019_ai_usage_context.sql`.
```

- [ ] **Step 5: rodar tudo**

Run: `cd backend && npm run typecheck && npx vitest run`
Expected: verde.

- [ ] **Step 6: commit**

```bash
cd backend && npm run format && git add supabase/migrations/019_ai_usage_context.sql src ../docs/operacao-ia.md
git commit -m "feat(ai): telemetria com conversation_id/job_id/finish_reason/tool_called e runbook de operação

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: snapshots de prompt + eval offline opt-in (OP5)

**Files:**
- Create: `backend/src/modules/chat/chat.prompts.test.ts` (+ `__snapshots__/` gerado)
- Create: `backend/src/evals/fixtures/coach-conversations.json`, `backend/src/evals/coach-tool-decision.eval.test.ts`
- Modify: `backend/src/modules/chat/chat.service.ts` (exporta `COLLECT_DIET_DATA_TOOL`)

**Interfaces:**
- `export const COLLECT_DIET_DATA_TOOL` passa a ser exportada (só leitura pelo eval).
- Eval roda somente com `RUN_AI_EVALS=1`; modelo em `EVAL_MODEL` (default `openai/gpt-5-mini`).

- [ ] **Step 1: snapshots**

```ts
// backend/src/modules/chat/chat.prompts.test.ts
import { describe, expect, it } from 'vitest'
import type { CollectedUserData } from '../../shared/diet-ai-schema.js'
import { buildDayPrompt, computeTargets } from '../diets/jobs.service.js'
import { type UserContextData, formatKnownData, formatUserContext } from './chat-context.js'
import { assembleSystemPrompt, buildSystemPrompt } from './chat.service.js'

/**
 * OP5: snapshot dos prompts montados. Uma mudança de prompt tem que ser
 * VISÍVEL no diff do PR, não escondida numa string de 40 linhas.
 * Atualizar com `npx vitest run -u` só quando a mudança for intencional.
 */

// birth_date null de propósito: a idade calculada mudaria o snapshot a cada ano.
const perfis: { nome: string; ctx: UserContextData; hasActiveDiet: boolean }[] = [
  {
    nome: 'novo usuário sem nada',
    hasActiveDiet: false,
    ctx: { profile: null, diet: null, today: null, freeMeals: [], streak: null, mealsPerDay: null, date: '2026-09-09' },
  },
  {
    nome: 'dados conhecidos, sem dieta',
    hasActiveDiet: false,
    ctx: {
      profile: { weight_kg: 82, height_cm: 178, birth_date: null, gender: 'male', goal: 'lose_weight', activity_level: 'moderate', dietary_restrictions: ['sem lactose'], allergies: ['amendoim'] },
      diet: null, today: null, freeMeals: [], streak: 3, mealsPerDay: 4, date: '2026-09-09',
    },
  },
  {
    nome: 'dieta ativa',
    hasActiveDiet: true,
    ctx: {
      profile: { weight_kg: 60, height_cm: 165, birth_date: null, gender: 'female', goal: 'maintain', activity_level: 'light', dietary_restrictions: [], allergies: [] },
      diet: { name: 'Plano personalizado', targetCalories: 1800, targetProtein: 108, targetCarbs: 200, targetFat: 50 },
      today: null, freeMeals: [], streak: 12, mealsPerDay: 5, date: '2026-09-09',
    },
  },
]

describe('prompts do coach (snapshot)', () => {
  it.each(perfis)('$nome', ({ ctx, hasActiveDiet }) => {
    const prompt = assembleSystemPrompt(
      buildSystemPrompt('motivational'),
      formatUserContext(ctx),
      formatKnownData(ctx),
      hasActiveDiet,
    )
    expect(prompt).toMatchSnapshot()
  })
})

describe('prompt do dia (snapshot)', () => {
  const u: CollectedUserData = {
    weight_kg: 82, height_cm: 178, age: 31, gender: 'male', goal: 'lose_weight', activity_level: 'moderate',
    meals_per_day: 4, dietary_restrictions: ['sem lactose'], allergies: ['amendoim'], food_preferences: 'não gosta de peixe',
    message_to_user: 'ok', health_conditions: [],
  }
  it('dia 1 sem histórico', () => {
    expect(buildDayPrompt(u, computeTargets(u), 1)).toMatchSnapshot()
  })
  it('dia 3 com dias anteriores e feedback de rejeição', () => {
    expect(buildDayPrompt(u, computeTargets(u), 3, 'Segunda: Frango, Arroz\nTerça: Tilápia, Batata-doce', 'ATENÇÃO — a tentativa anterior foi REJEITADA')).toMatchSnapshot()
  })
})
```

Run: `cd backend && npx vitest run src/modules/chat/chat.prompts.test.ts`
Expected: PASS, criando `src/modules/chat/__snapshots__/chat.prompts.test.ts.snap`. **Ler o
snapshot inteiro** antes de commitar — ele é o contrato.

- [ ] **Step 2: fixtures do eval**

```json
// backend/src/evals/fixtures/coach-conversations.json
[
  {
    "name": "coleta completa, saúde negada → chama a tool",
    "hasActiveDiet": false,
    "knownData": "",
    "messages": [
      { "role": "user", "content": "Oi! Quero uma dieta. Tenho 82 kg, 178 cm, 31 anos, sou homem, quero perder peso, sou moderadamente ativo e prefiro 4 refeições por dia. Sem restrições nem alergias. Não estou grávido, não tenho nenhuma doença diagnosticada, nem transtorno alimentar, nem tomo remédio contínuo." }
    ],
    "expectTool": true
  },
  {
    "name": "falta a altura → não chama",
    "hasActiveDiet": false,
    "knownData": "",
    "messages": [
      { "role": "user", "content": "Tenho 82 kg, 31 anos, homem, quero perder peso, moderadamente ativo, 4 refeições. Sem restrições, sem alergias, sem problemas de saúde." }
    ],
    "expectTool": false
  },
  {
    "name": "gestante → se chamar, health_conditions vem preenchido",
    "hasActiveDiet": false,
    "knownData": "",
    "messages": [
      { "role": "user", "content": "Tenho 68 kg, 165 cm, 29 anos, mulher, quero perder peso, sedentária, 5 refeições, sem alergias. Estou grávida de 5 meses." }
    ],
    "expectTool": "either",
    "healthConditionsNonEmptyIfCalled": true
  },
  {
    "name": "dieta ativa + agradecimento → não chama",
    "hasActiveDiet": true,
    "knownData": "## DADOS JÁ CONHECIDOS DO USUÁRIO\npeso: 82kg; altura: 178cm; idade: 31 anos; sexo: masculino; objetivo: perder peso; atividade: moderada; refeições/dia: 4.",
    "messages": [
      { "role": "assistant", "content": "[Dieta de 7 dias iniciada em 09/09 às 14:32]" },
      { "role": "assistant", "content": "[Dieta concluída — 7 dias]" },
      { "role": "user", "content": "obrigado!" }
    ],
    "expectTool": false
  },
  {
    "name": "dieta ativa + pedido explícito de plano novo → chama",
    "hasActiveDiet": true,
    "knownData": "## DADOS JÁ CONHECIDOS DO USUÁRIO\npeso: 82kg; altura: 178cm; idade: 31 anos; sexo: masculino; objetivo: perder peso; atividade: moderada; refeições/dia: 4.",
    "messages": [
      { "role": "assistant", "content": "[Dieta concluída — 7 dias]" },
      { "role": "user", "content": "Quero refazer minha dieta com menos carboidrato. Meus dados são os mesmos, não tenho nenhuma condição de saúde. Pode gerar outra agora." }
    ],
    "expectTool": true
  },
  {
    "name": "fora de escopo → não chama",
    "hasActiveDiet": false,
    "knownData": "",
    "messages": [
      { "role": "user", "content": "Qual é a capital da Austrália?" }
    ],
    "expectTool": false
  }
]
```

- [ ] **Step 3: runner**

Em `chat.service.ts`, trocar `const COLLECT_DIET_DATA_TOOL` por `export const COLLECT_DIET_DATA_TOOL`.

```ts
// backend/src/evals/coach-tool-decision.eval.test.ts
import { readFileSync } from 'node:fs'
import OpenAI from 'openai'
import { describe, expect, it } from 'vitest'
import { COLLECT_DIET_DATA_TOOL, assembleSystemPrompt, buildSystemPrompt } from '../modules/chat/chat.service.js'
import { env } from '../shared/env.js'

/**
 * OP5: eval OFFLINE e OPT-IN. Chama o modelo de verdade (o mais barato que
 * decida tool calls) e verifica só UMA coisa por conversa: chamou ou não a
 * tool. Não roda no CI: `RUN_AI_EVALS=1 npm test -- src/evals`.
 */

interface Fixture {
  name: string
  hasActiveDiet: boolean
  knownData: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  expectTool: boolean | 'either'
  healthConditionsNonEmptyIfCalled?: boolean
}

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/coach-conversations.json', import.meta.url), 'utf8'),
) as Fixture[]

describe.skipIf(!process.env.RUN_AI_EVALS)('eval: decisão de tool do coach', () => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })
  const model = process.env.EVAL_MODEL ?? 'openai/gpt-5-mini'

  it.each(fixtures)('$name', async (f) => {
    const system = assembleSystemPrompt(buildSystemPrompt('motivational'), '', f.knownData, f.hasActiveDiet)
    const completion = await openai.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: system }, ...f.messages],
        tools: [COLLECT_DIET_DATA_TOOL],
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_tokens: 2000,
      },
      { timeout: 60_000 },
    )
    const choice = completion.choices[0]
    const called = choice.finish_reason === 'tool_calls' && !!choice.message.tool_calls?.length
    if (f.expectTool !== 'either') expect(called).toBe(f.expectTool)
    if (called && f.healthConditionsNonEmptyIfCalled) {
      const args = JSON.parse(choice.message.tool_calls?.[0]?.function.arguments ?? '{}') as { health_conditions?: string[] }
      expect(args.health_conditions?.length ?? 0).toBeGreaterThan(0)
    }
  }, 90_000)
})
```

- [ ] **Step 4: rodar**

Run: `cd backend && npx vitest run`
Expected: verde; o arquivo do eval aparece como **skipped** (sem `RUN_AI_EVALS`).

Com chave (fora desta máquina): `cd backend && RUN_AI_EVALS=1 npx vitest run src/evals` — anotar o
resultado no PR. Se uma fixture falhar de forma consistente, é o prompt que regrediu, não a fixture.

- [ ] **Step 5: commit**

```bash
cd backend && npm run format && git add src/modules/chat src/evals
git commit -m "test(coach): snapshots dos prompts e eval offline opt-in da decisão de tool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Fase E — Verificação final e entrega

### Task 21: verificação contra o baseline e PR

**Files:** nenhum novo. Usa `superpowers:verification-before-completion` e depois
`superpowers:finishing-a-development-branch`.

- [ ] **Step 1: os cinco loops, comparados com o baseline**

```bash
cd backend && npm run typecheck && npx vitest run 2>&1 | tail -6 && npm run lint 2>&1 | tail -3
cd ../app && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest --ci 2>&1 | tail -6
```

Expected: backend typecheck limpo; vitest **≥ 121 + ~70 novos** testes verdes, eval `skipped`;
lint **≤ 11** erros; app tsc limpo; jest **≥ 308 + 2** verdes. Colar as seis linhas de saída no PR.

- [ ] **Step 2: critérios de aceite da spec (§6)**

Verificar um a um, apontando o teste que prova cada um:
- alérgeno nunca chega a `diet_days` → `process-job-step.test.ts` ("alérgeno nas 2 tentativas")
- request sem `tools` com job em andamento → `chat.service.gating.test.ts`
- `length` sem recuperação não grava histórico → `chat.service.finish.test.ts`
- nenhuma recusa por segurança retorna HTTP ≥ 400 → `chat.service.safety.test.ts` (todas resolvem com 200 e `diet_job_id: null`)

- [ ] **Step 3: sem placeholders no código**

Run: `cd backend && grep -rn "TODO\|TBD\|FIXME" src/shared/guardrails src/modules/chat src/modules/diets src/modules/scanner | grep -v test; echo "exit: $?"`
Expected: nenhuma linha (exit 1 do grep).

- [ ] **Step 4: PR**

```bash
git push -u origin feat/guardrails-ia-coach
gh pr create --base fix/android-ios-review-apple --title "Guardrails da camada de IA: coach, geração de dieta e visão" --body-file - <<'PR'
## O que muda

Camada determinística de guardrails (`backend/src/shared/guardrails/`) chamada em três pontos:
antes de criar o job de dieta, depois de gerar cada dia, e ao montar a request do chat.
Spec: `docs/superpowers/specs/2026-09-09-guardrails-ia-coach-design.md`.

- **Coleta (S):** bounds de plausibilidade; `health_conditions`; recusa em texto para menor de
  idade, condição de saúde e IMC < 18,5 com déficit; piso 1200/1500 kcal; prompt sem fórmula.
- **Dia (O):** alérgenos/restrições checados na saída; kcal coerente; estrutura de refeições;
  reconcile-ou-falha; regenera uma vez com feedback e depois falha — nunca persiste dia inválido.
- **Chat (C):** sem tool com job em voo; marcadores no histórico; `finish_reason` tratado
  (nada persistido em truncamento); contexto truncado por linha; histórico que falha alto.
- **Operação (P):** lock em voo do `/step`; teto diário de tokens; visão com limites, flag de
  incerteza e cache; telemetria com contexto; snapshots de prompt e eval opt-in.

## Migrações (rodar ANTES do deploy)
016 (pendente), 017, 018, 019 — ver `docs/operacao-ia.md`.

## Verificação
<colar as seis linhas do Step 1>

## Limite
Nenhum guardrail foi exercitado contra o modelo real nesta máquina (sem chave). O eval opt-in
(`RUN_AI_EVALS=1`) deve rodar uma vez com chave antes do merge; resultado: <preencher>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PR
```

Base do PR é `fix/android-ios-review-apple` enquanto o #44 não for mesclado; depois, retarget
para `main` com `gh pr edit --base main`.

---

## Cobertura da spec (autorrevisão)

| Requisito | Task | Requisito | Task |
|---|---|---|---|
| S1 | 1 | O1 | 6 |
| S2 | 3 | O2 | 7, 8 |
| S3 | 4 | O3 | 7, 8 |
| S4 | 4 | O4 | 8, 10 |
| S5 | 2 | O5 | 7, 9 |
| S6 | 5 | O6 | 7 (via O2 — desvio declarado) |
| C1 | 11 | OP1 | 16 |
| C2 | 12 | OP2 | 17 |
| C3 | 13 | OP3 | 18 |
| C4 | 14 | OP4 | 19 |
| C5 | 15 | OP5 | 20 |
| C6 | 10, 15, 17 | §6 aceite | 21 |
