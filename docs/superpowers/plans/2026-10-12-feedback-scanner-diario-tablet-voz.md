# Feedbacks scanner/diário/tablet/voz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir texto cortado no tablet, rótulos de uma letra no scanner e a resposta do coach descartada após áudio (PR A, só app/OTA); adicionar fibra e edição de refeições no scanner, no diário e no painel (PR B, migration + API + app).

**Architecture:** PR A mexe só em componentes/hooks do app (`Text`, `ScanItemRow`, `useVoiceMessage`). PR B adiciona `fiber` de ponta a ponta (Vision → `ScanItem` → `meal_items.fiber_g`/`meals.total_fiber` → `Meal.fiber` → telas), tolerante a migration ausente via checagem de `information_schema` (mesmo padrão de `diets/fiber-columns.ts`), e uma rota `PATCH /food-log/:id` que substitui o item único da refeição.

**Tech Stack:** App: React Native 0.77 + Expo, TypeScript, Zustand, Jest + @testing-library/react-native. API: Fastify 5 + fastify-type-provider-zod, postgres.js, Vitest, Biome. Banco: Supabase (migrations rodadas à mão no SQL Editor).

**Spec:** `docs/superpowers/specs/2026-10-12-feedback-scanner-diario-tablet-voz.md`

## Global Constraints

- Nada nativo muda: nenhuma lib nova, nenhum arquivo em `app/android` ou `app/ios` (o OTA depende do mesmo fingerprint).
- Rótulos por extenso, em pt-BR: `Calorias (kcal)`, `Proteína (g)`, `Carboidratos (g)`, `Gordura (g)`, `Fibra (g)`; na linha do diário e nos resumos: `Fibras`.
- Fibra ausente é `null` ("sem dado"), nunca `0`. Colunas novas `NUMERIC(8,2)` nullable, sem default.
- Backend tem que funcionar **antes** da migration 022 rodar (deploy da Vercel pode chegar primeiro).
- Comandos: app `cd app && npx jest <arquivo>` / `npx tsc --noEmit`; API `cd backend && npx vitest run <arquivo>` / `npm run typecheck` / `npx biome check <arquivos>`.
- O lint do app (`eslint`) já falha na `main` por regras antigas (`no-raw-text` em `Button`, `split-platform-components`); não introduzir erros **novos** em arquivos tocados além desse padrão existente.
- Comentários e mensagens de commit seguem o estilo do repo (pt-BR nos comentários; commits convencionais).

## Review Focus

1. **Texto com `lineHeight` explícito menor que a fonte** — quem já definiu `lineHeight` à mão (ex.: logo da Welcome, 38/46) tem que continuar exatamente igual. Teste em Task 1.
2. **Áudio enviado e app volta do background antes da resposta** — o usuário espera ver pergunta e resposta; nada de bolha sumindo. Teste em Task 3.
3. **Cache do scanner gravado antes da fibra** — `scan_cache.result.item` sem `fiber` não pode quebrar a serialização do Zod (campo obrigatório na resposta). Teste em Task 5.
4. **Editar refeição com fibra apagada (campo vazio)** — o usuário limpa "Fibra (g)": deve gravar `null` ("sem dado"), não `0`. Teste em Task 9.
5. **PATCH antes da migration 022** — editar continua funcionando sem a coluna `fiber_g` (fibra ignorada). Teste em Task 6.

---

# PR A — `fix/feedback-tablet-voz-rotulos` (só app, OTA)

Criar a branch a partir da `main` atualizada:

```bash
git checkout main && git pull --ff-only && git checkout -b fix/feedback-tablet-voz-rotulos
```

### Task 1: `Text` ajusta a altura da linha quando a fonte cresce

**Files:**
- Modify: `app/src/shared/components/Text.tsx`
- Test: `app/src/shared/components/Text.test.tsx`

**Interfaces:**
- Consumes: `typography.lineHeight.tight` (= 1.2) de `@theme`.
- Produces: comportamento novo do `Text` (nenhuma assinatura muda).

- [ ] **Step 1: Write the failing tests** — acrescentar ao fim do `describe('Text', ...)` em `Text.test.tsx`:

```tsx
  describe('altura de linha acompanha a fonte (texto cortado no tablet)', () => {
    const flat = (el: { props: { style: unknown } }) =>
      StyleSheet.flatten(el.props.style as never) as { lineHeight?: number };

    it('fonte maior que a linha herdada ganha lineHeight proporcional', () => {
      const { getByText } = render(<Text style={{ fontSize: 48 }}>1234</Text>);
      // body herda 24; 48 × 1,2 = 57,6 → 58
      expect(flat(getByText('1234')).lineHeight).toBe(58);
    });

    it('fonte que já cabe na linha herdada não muda o layout', () => {
      const { getByText } = render(<Text style={{ fontSize: 12 }}>pequeno</Text>);
      expect(flat(getByText('pequeno')).lineHeight).toBe(24);
    });

    it('lineHeight explícito sempre vence', () => {
      const { getByText } = render(
        <Text variant="heading1" style={{ fontSize: 38, lineHeight: 46 }}>
          logo
        </Text>,
      );
      expect(flat(getByText('logo')).lineHeight).toBe(46);
    });

    it('estilo em array também é considerado', () => {
      const { getByText } = render(<Text style={[{ fontSize: 30 }, { color: 'red' }]}>oi</Text>);
      expect(flat(getByText('oi')).lineHeight).toBe(36);
    });

    it('variante sem lineHeight (label) não recebe um', () => {
      const { getByText } = render(
        <Text variant="label" style={{ fontSize: 40 }}>
          rótulo
        </Text>,
      );
      expect(flat(getByText('rótulo')).lineHeight).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest src/shared/components/Text.test.tsx`
Expected: FAIL — `expected 58, received 24` (e 36 vs 24).

- [ ] **Step 3: Write minimal implementation** — em `Text.tsx`, substituir a função `Text`:

```tsx
export function Text({ variant = 'body', color, style, ...rest }: Props): React.JSX.Element {
  const base = styles[variant];
  return (
    <RNText
      style={[base, color ? { color } : undefined, style, autoLineHeight(base.lineHeight, style)]}
      {...rest}
    />
  );
}

/**
 * Texto cortado no tablet: a variante body impõe lineHeight 24, e um `style`
 * com fontSize 48 (total de calorias do Dashboard) renderizava o glifo numa
 * linha de 24 px — corte em cima e embaixo. Só age quando a fonte não cabe na
 * linha herdada; quem já cabe não muda de layout e lineHeight explícito vence.
 */
function autoLineHeight(
  inherited: number | undefined,
  style: TextProps['style'],
): { lineHeight: number } | undefined {
  const flat = StyleSheet.flatten(style);
  const fontSize = flat?.fontSize;
  if (inherited == null || fontSize == null || flat?.lineHeight != null) return undefined;
  const needed = fontSize * typography.lineHeight.tight;
  return needed > inherited ? { lineHeight: Math.ceil(needed) } : undefined;
}
```

(`StyleSheet` e `TextProps` já estão importados de `react-native`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest src/shared/components/Text.test.tsx && npx tsc --noEmit`
Expected: PASS; tsc sem erros.

- [ ] **Step 5: Run the full app suite** (o `Text` é usado em todas as telas; snapshots ou asserções de estilo podem depender dele)

Run: `cd app && npx jest`
Expected: PASS. Se alguma asserção antiga comparar o `style` inteiro de um `Text` com fonte > linha herdada, atualizar a expectativa para incluir o `lineHeight` calculado — é a correção pedida, não regressão.

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/components/Text.tsx app/src/shared/components/Text.test.tsx
git commit -m "fix(app): Text ajusta lineHeight quando a fonte não cabe na linha herdada"
```

### Task 2: Rótulos por extenso no scanner

**Files:**
- Modify: `app/src/features/scanner/components/ScanItemRow.tsx:13-18` e estilos `macrosRow`/`macroField`
- Test: `app/src/features/scanner/components/ScanItemRow.test.tsx`

**Interfaces:**
- Produces: constante `NUM_FIELDS` com rótulos por extenso (Task 8 acrescenta `fiber`).

- [ ] **Step 1: Write the failing test** — acrescentar em `ScanItemRow.test.tsx`:

```tsx
  it('rótulos por extenso, sem abreviação de uma letra', () => {
    const { getByText, queryByText } = render(
      <ScanItemRow item={item} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Calorias (kcal)')).toBeTruthy();
    expect(getByText('Proteína (g)')).toBeTruthy();
    expect(getByText('Carboidratos (g)')).toBeTruthy();
    expect(getByText('Gordura (g)')).toBeTruthy();
    expect(queryByText('P')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest src/features/scanner/components/ScanItemRow.test.tsx`
Expected: FAIL — `Unable to find an element with text: Calorias (kcal)`.

- [ ] **Step 3: Write minimal implementation** — em `ScanItemRow.tsx`:

```tsx
const NUM_FIELDS: { key: keyof ScanItem; label: string }[] = [
  { key: 'calories', label: 'Calorias (kcal)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'fat', label: 'Gordura (g)' },
];
```

e nos estilos (os rótulos longos não cabem em 4 colunas no telefone):

```tsx
  macrosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  macroField: { flexGrow: 1, flexBasis: '45%' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest src/features/scanner && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/scanner/components/ScanItemRow.tsx app/src/features/scanner/components/ScanItemRow.test.tsx
git commit -m "fix(scanner): rótulos dos macros por extenso"
```

### Task 3: Resposta do coach a um áudio sobrevive a foco/background

**Files:**
- Modify: `app/src/features/coach/hooks/useVoiceMessage.ts` (função `stop`, `useEffect` de assinatura do auth, novo helper e ref)
- Test: `app/src/features/coach/hooks/useVoiceMessage.test.ts`

**Interfaces:**
- Consumes: `VoiceRequestContext { signal: AbortSignal; isValid: () => boolean }` de `@shared/services/coach.service` (inalterado); `useCoachStore.sendMessage(content, voice?)` (inalterado — já descarta a resposta quando `voice.isValid()` é falso e remove a bolha no `abort`).
- Produces: o contexto entregue ao `onSend` passa a depender **só da sessão**.

- [ ] **Step 1: Write the failing tests** — no topo do arquivo de teste, junto dos imports:

```ts
import type { VoiceRequestContext } from '@shared/services/coach.service';
```

e, dentro do `describe('useVoiceMessage', ...)`, **depois** da função `deferred` (linha ~303):

```ts
  describe('envio ao coach depois da transcrição (R3)', () => {
    const onSendCtx = jest.fn<(text: string, voice?: VoiceRequestContext) => Promise<boolean>>();
    let ctx: VoiceRequestContext | undefined;
    let pendingSend: ReturnType<typeof deferred<boolean>>;

    beforeEach(() => {
      ctx = undefined;
      pendingSend = deferred<boolean>();
      onSendCtx.mockReset();
      onSendCtx.mockImplementation((_text, voice) => {
        ctx = voice;
        return pendingSend.promise;
      });
    });

    function setupFocusable() {
      return renderHook(
        ({ isFocused }: { isFocused: boolean }) =>
          useVoiceMessage({ onSend: onSendCtx, disabled: false, isFocused }),
        { initialProps: { isFocused: true } },
      );
    }

    async function sendVoice(result: { current: ReturnType<typeof useVoiceMessage> }) {
      await startAndSpeak(result);
      let stopping: Promise<void> = Promise.resolve();
      await act(async () => {
        stopping = result.current.stop();
      });
      return stopping;
    }

    it('microfone volta ao idle assim que o texto vai para o coach', async () => {
      const { result } = setupFocusable();
      const stopping = await sendVoice(result);
      expect(onSendCtx).toHaveBeenCalledWith('quanto de proteína hoje?', expect.anything());
      expect(result.current.status).toBe('idle');
      await act(async () => {
        pendingSend.resolve(true);
        await stopping;
      });
    });

    it('perder o foco enquanto o coach responde NÃO descarta o envio', async () => {
      const { result, rerender } = setupFocusable();
      const stopping = await sendVoice(result);
      await act(async () => {
        rerender({ isFocused: false });
      });
      expect(ctx?.signal.aborted).toBe(false);
      expect(ctx?.isValid()).toBe(true);
      await act(async () => {
        pendingSend.resolve(true);
        await stopping;
      });
    });

    it('background enquanto o coach responde NÃO descarta o envio', async () => {
      let change: (state: AppStateStatus) => void = () => {};
      const listener = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_event, callback) => {
          change = callback;
          return { remove: jest.fn() };
        });
      try {
        const { result } = setupFocusable();
        const stopping = await sendVoice(result);
        await act(async () => {
          change('background');
        });
        expect(ctx?.signal.aborted).toBe(false);
        expect(ctx?.isValid()).toBe(true);
        await act(async () => {
          pendingSend.resolve(true);
          await stopping;
        });
      } finally {
        listener.mockRestore();
      }
    });

    it('logout enquanto o coach responde aborta o envio', async () => {
      const { result } = setupFocusable();
      const stopping = await sendVoice(result);
      await act(async () => {
        useAuthStore.getState().clearToken();
      });
      expect(ctx?.signal.aborted).toBe(true);
      expect(ctx?.isValid()).toBe(false);
      await act(async () => {
        pendingSend.resolve(false);
        await stopping;
      });
    });

    it('troca de conta enquanto o coach responde aborta o envio', async () => {
      const { result } = setupFocusable();
      const stopping = await sendVoice(result);
      await act(async () => {
        useAuthStore
          .getState()
          .setToken('other', { id: 'other', name: 'Outra', email: 'o@test.com' });
      });
      expect(ctx?.signal.aborted).toBe(true);
      await act(async () => {
        pendingSend.resolve(false);
        await stopping;
      });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest src/features/coach/hooks/useVoiceMessage.test.ts`
Expected: FAIL — "microfone volta ao idle" recebe `'transcribing'`; "perder o foco" e "background" recebem `aborted === true`.

- [ ] **Step 3: Write minimal implementation** — em `useVoiceMessage.ts`:

(a) Depois da interface `VoiceOperation`, acrescentar:

```ts
/**
 * R3 (2026-10-12): depois da transcrição o áudio virou uma mensagem como outra
 * qualquer. O envio ao coach leva 10–30 s; amarrá-lo ao foco/app ativo fazia a
 * pergunta e a resposta sumirem em silêncio se a pessoa trocasse de aba ou a
 * tela apagasse. Só troca de sessão (logout/outra conta) cancela daqui em diante.
 */
interface PendingSend {
  controller: AbortController;
  userId: string;
  sessionGeneration: number;
}

function isSameSession(owner: { userId: string; sessionGeneration: number }): boolean {
  const auth = useAuthStore.getState();
  return (
    auth.isAuthenticated &&
    auth.user?.id === owner.userId &&
    auth.sessionGeneration === owner.sessionGeneration
  );
}
```

(b) Junto dos outros refs no hook:

```ts
  const sendRef = useRef<PendingSend | null>(null);
```

(c) Na assinatura do auth (dentro do `useEffect` que chama `useAuthStore.subscribe`), no início do callback:

```ts
      const send = sendRef.current;
      if (send && !isSameSession(send)) {
        sendRef.current = null;
        send.controller.abort();
      }
```

(d) Em `stop`, substituir todo o bloco a partir de `if (!isValid(operation) || appStateRef.current !== 'active') return;` que vem **depois** de `audio = await runNative(...)` até o fim do `try/catch/finally` da transcrição por:

```ts
    if (!isValid(operation) || appStateRef.current !== 'active') return;
    let text: string;
    try {
      text = await coachService.transcribe(audio, VOICE_MIME_TYPE, operation.controller.signal);
    } catch (e) {
      if (isValid(operation)) {
        operationRef.current = null;
        setStatus('idle');
        if (!axios.isCancel(e)) showTranscribeError(e);
      }
      return;
    }
    if (!isValid(operation) || appStateRef.current !== 'active') return;

    // A operação de voz termina aqui; o envio fica preso só à sessão (R3).
    operationRef.current = null;
    setStatus('idle');
    const send: PendingSend = {
      controller: new AbortController(),
      userId: operation.userId,
      sessionGeneration: operation.sessionGeneration,
    };
    sendRef.current = send;
    try {
      await onSendRef.current(text, {
        signal: send.controller.signal,
        isValid: () => !send.controller.signal.aborted && isSameSession(send),
      });
    } finally {
      if (sendRef.current === send) sendRef.current = null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest src/features/coach && npx tsc --noEmit`
Expected: PASS — inclusive os testes antigos de cancelamento **durante gravação/transcrição** ("background cancela gravação…", "não envia transcrição concluída depois de desmontar", "logout/troca de conta/cancelar invalida uma transcrição…") e `store.test.ts` ("envio de voz vinculado à operação").

- [ ] **Step 5: Commit**

```bash
git add app/src/features/coach/hooks/useVoiceMessage.ts app/src/features/coach/hooks/useVoiceMessage.test.ts
git commit -m "fix(coach): resposta a um áudio não some ao trocar de aba ou apagar a tela"
```

### Fechamento do PR A

- [ ] `cd app && npx jest && npx tsc --noEmit` — tudo verde.
- [ ] Revisão visual no web (`npm run web -- --host 127.0.0.1`, `?preview=app`): Dashboard com o total de calorias inteiro; scanner com rótulos por extenso.
- [ ] Push e PR "fix: texto cortado no tablet, rótulos do scanner e resposta do coach a áudio". Merge → OTA automático (`ota-update.yml`).

---

# PR B — `feat/fibra-e-edicao-refeicoes` (migration + API + app)

Criar a branch a partir da `main` **depois** do merge do PR A (a Task 8 parte do `ScanItemRow` da Task 2):

```bash
git checkout main && git pull --ff-only && git checkout -b feat/fibra-e-edicao-refeicoes
```

### Task 4: Migration 022 e detecção das colunas de fibra das refeições

**Files:**
- Create: `backend/supabase/migrations/022_meal_fiber.sql`
- Create: `backend/src/modules/food-log/meal-fiber-columns.ts`
- Test: `backend/src/modules/food-log/meal-fiber-columns.test.ts`

**Interfaces:**
- Produces: `hasMealFiberColumns(fastify: FastifyInstance): Promise<boolean>` e `__resetMealFiberColumnsCache(): void`.

- [ ] **Step 1: Write the migration**

```sql
-- Fibra nas refeições do diário (feedback 2026-10-12). Nullable de propósito:
-- refeição registrada antes desta migration não tem o dado — "sem informação",
-- não "0 g". O backend detecta as colunas (meal-fiber-columns.ts) e funciona
-- antes e depois desta migration.
ALTER TABLE public.meal_items ADD COLUMN IF NOT EXISTS fiber_g     NUMERIC(8,2);
ALTER TABLE public.meals      ADD COLUMN IF NOT EXISTS total_fiber NUMERIC(8,2);

-- Mesmo trigger da 003, agora somando a fibra. SUM de nulos = NULL: refeição
-- sem nenhum item com fibra continua "sem dado".
CREATE OR REPLACE FUNCTION public.recalculate_meal_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_meal_id UUID;
BEGIN
  v_meal_id := COALESCE(NEW.meal_id, OLD.meal_id);

  UPDATE public.meals
  SET
    total_calories = COALESCE((SELECT SUM(calories) FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_protein  = COALESCE((SELECT SUM(protein_g) FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_carbs    = COALESCE((SELECT SUM(carbs_g)   FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_fat      = COALESCE((SELECT SUM(fat_g)     FROM public.meal_items WHERE meal_id = v_meal_id), 0),
    total_fiber    = (SELECT SUM(fiber_g) FROM public.meal_items WHERE meal_id = v_meal_id),
    updated_at     = NOW()
  WHERE id = v_meal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
```

- [ ] **Step 2: Write the failing test** — `meal-fiber-columns.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { __resetMealFiberColumnsCache, hasMealFiberColumns } from './meal-fiber-columns.js'

const Q = 'information_schema.columns'

describe('hasMealFiberColumns (tolerância à migration 022)', () => {
  beforeEach(() => __resetMealFiberColumnsCache())

  it('as 2 colunas existem → true', async () => {
    const { fastify } = fakeFastify([[Q, [{ n: 2 }]]])
    expect(await hasMealFiberColumns(fastify)).toBe(true)
  })

  it('migration ausente ou pela metade → false', async () => {
    expect(await hasMealFiberColumns(fakeFastify([[Q, [{ n: 0 }]]]).fastify)).toBe(false)
    expect(await hasMealFiberColumns(fakeFastify([[Q, [{ n: 1 }]]]).fastify)).toBe(false)
  })

  it('depois de true, não consulta de novo', async () => {
    const { fastify, calls } = fakeFastify([[Q, [{ n: 2 }]]])
    await hasMealFiberColumns(fastify)
    await hasMealFiberColumns(fastify)
    expect(calls.filter((c) => c.sql.includes(Q))).toHaveLength(1)
  })

  it('depois de false, consulta de novo (a migration pode ter rodado no meio)', async () => {
    const { fastify, calls } = fakeFastify([[Q, [{ n: 0 }]]])
    await hasMealFiberColumns(fastify)
    await hasMealFiberColumns(fastify)
    expect(calls.filter((c) => c.sql.includes(Q))).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run src/modules/food-log/meal-fiber-columns.test.ts`
Expected: FAIL — cannot find module `./meal-fiber-columns.js`.

- [ ] **Step 4: Write minimal implementation** — `meal-fiber-columns.ts`:

```ts
import type { FastifyInstance } from 'fastify'

/**
 * Mesmo padrão de diets/fiber-columns.ts: as migrations rodam à mão no SQL
 * Editor do Supabase e o deploy pode chegar antes da 022. Sem as colunas, o
 * diário grava como antes (sem fibra). Só o "sim" fica em cache.
 */
let known = false

export async function hasMealFiberColumns(fastify: FastifyInstance): Promise<boolean> {
  if (known) return true
  const rows = await fastify.db<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'meal_items' AND column_name = 'fiber_g')
        OR (table_name = 'meals' AND column_name = 'total_fiber'))
  `
  known = (rows[0]?.n ?? 0) === 2
  return known
}

/** Só para testes. */
export function __resetMealFiberColumnsCache(): void {
  known = false
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/modules/food-log/meal-fiber-columns.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/supabase/migrations/022_meal_fiber.sql backend/src/modules/food-log/meal-fiber-columns.ts backend/src/modules/food-log/meal-fiber-columns.test.ts
git commit -m "feat(food-log): migration 022 de fibra nas refeições e detecção das colunas"
```

### Task 5: Fibra na análise da foto

**Files:**
- Modify: `backend/src/modules/scanner/scanner.schemas.ts` (`scanItemSchema`, `visionAnalysisSchema`)
- Modify: `backend/src/modules/scanner/scanner.service.ts` (prompt, leitura do cache)
- Modify: `backend/src/shared/guardrails/vision.ts`
- Test: `backend/src/shared/guardrails/vision.test.ts`, `backend/src/modules/scanner/scanner.service.test.ts`

**Interfaces:**
- Produces: `ScanItem.fiber: number | null` na resposta de `/scanner/analyze` e `/scanner/analyze-guest`; `sanitizeVisionResult(a: { …; fiber?: number })` retorna também `fiber: number | null`.

- [ ] **Step 1: Write the failing tests**

Em `vision.test.ts`, no primeiro teste ("prato comum passa intacto…"), a expectativa passa a incluir `fiber: null`:

```ts
    expect(r).toEqual({
      calories: 650,
      protein: 40,
      carbs: 70,
      fat: 18,
      fiber: null,
      confidence: 0.82,
      uncertain: false,
    })
```

e acrescentar ao `describe`:

```ts
  it('fibra: arredonda, negativa vira 0 e não entra nas kcal', () => {
    const r = sanitizeVisionResult({
      calories: 650, protein: 40, carbs: 70, fat: 18, fiber: 6.4, confidence: 0.82,
    })
    expect(r.fiber).toBe(6)
    expect(r.calories).toBe(650)
    expect(
      sanitizeVisionResult({ calories: 100, protein: 5, carbs: 15, fat: 2, fiber: -3, confidence: 1 })
        .fiber,
    ).toBe(0)
  })

  it('acima de 3000 kcal: fibra escala junto com os macros', () => {
    const r = sanitizeVisionResult({
      calories: 40000, protein: 2000, carbs: 5000, fat: 1333, fiber: 400, confidence: 0.9,
    })
    expect(r.fiber).toBe(30)
  })
```

Em `scanner.service.test.ts`, no objeto `analysis` do topo acrescentar `fiber: 7,` e adicionar ao `describe`:

```ts
  it('devolve a fibra estimada pela IA', async () => {
    const { fastify } = fakeFastify([], {
      parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }),
    })
    const r = await analyzePhoto(fastify, IMG, USER)
    expect(r.items[0].fiber).toBe(7)
  })

  it('cache gravado antes da fibra devolve fiber: null', async () => {
    const cached = {
      notFood: false,
      item: { name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0, confidence: 0.9, uncertain: false },
    }
    const { fastify } = fakeFastify([['FROM scan_cache', [{ result: cached }]]])
    const r = await analyzePhoto(fastify, IMG, USER)
    expect(r.items[0].fiber).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/shared/guardrails/vision.test.ts src/modules/scanner`
Expected: FAIL — `fiber` ausente (`undefined`).

- [ ] **Step 3: Write minimal implementation**

`scanner.schemas.ts` — em `scanItemSchema`, depois de `fat`:

```ts
  /** Fibra (g). null = sem dado (resultado em cache anterior à fibra). */
  fiber: z.number().nullable(),
```

e em `visionAnalysisSchema`, depois de `fat`:

```ts
  fiber: z.number(),
```

`vision.ts` — a assinatura recebe `fiber?: number` e devolve `fiber: number | null`:

```ts
export function sanitizeVisionResult(a: {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  confidence: number
}): {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
  confidence: number
  uncertain: boolean
} {
  let protein = Math.max(0, Math.round(a.protein))
  let carbs = Math.max(0, Math.round(a.carbs))
  let fat = Math.max(0, Math.round(a.fat))
  let fiber = a.fiber == null ? null : Math.max(0, Math.round(a.fiber))
  let calories = Math.max(0, Math.round(a.calories))
```

e, dentro do `if (calories > VISION_MAX_KCAL)`, depois de `fat = Math.round(fat * factor)`:

```ts
    if (fiber != null) fiber = Math.round(fiber * factor)
```

e no `return`, depois de `fat,`: `fiber,`.

`scanner.service.ts`:
- no `VISION_SYSTEM_PROMPT`, trocar a linha das unidades por:
  `- calories em kcal; protein, carbs, fat e fiber (fibra alimentar) em gramas. Use números inteiros ou com 1 casa decimal.`
- na leitura do cache, trocar `return { items: [{ id: randomUUID(), ...cached.item }] }` por:

```ts
    // Cache anterior à fibra não tem o campo — "sem dado", não 0 g.
    return { items: [{ id: randomUUID(), fiber: null, ...cached.item }] }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run && npm run typecheck && npx biome check src/modules/scanner src/shared/guardrails`
Expected: PASS (incluindo `scanner.routes.test.ts`, cujo `analysis` não tem `fiber` → resposta com `fiber: null`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/scanner backend/src/shared/guardrails
git commit -m "feat(scanner): IA estima fibra da porção"
```

### Task 6: API do diário — fibra e `PATCH /food-log/:id`

**Files:**
- Modify: `backend/src/modules/food-log/food-log.schemas.ts`
- Modify: `backend/src/modules/food-log/food-log.service.ts`
- Modify: `backend/src/modules/food-log/food-log.routes.ts`
- Test: `backend/src/modules/food-log/food-log.service.test.ts` (novo)

**Interfaces:**
- Consumes: `hasMealFiberColumns` (Task 4).
- Produces: `Meal.fiber: number | null`; `AddMealBody.fiber?: number | null`; `UpdateMealBody`; `updateMeal(fastify, userId, mealId, data): Promise<Meal>`; rota `PATCH /food-log/:id` → 200 `Meal` | 404 `MEAL_NOT_FOUND`.

- [ ] **Step 1: Write the failing test** — `food-log.service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { addMeal, listMeals, updateMeal } from './food-log.service.js'
import { __resetMealFiberColumnsCache } from './meal-fiber-columns.js'

const USER = '11111111-1111-1111-1111-111111111111'
const MEAL = '22222222-2222-2222-2222-222222222222'
const COLS = 'information_schema.columns'
const body = { name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, mealType: 'lunch' as const }

beforeEach(() => __resetMealFiberColumnsCache())

describe('listMeals — fibra', () => {
  it('devolve total_fiber como número, e null quando não há dado', async () => {
    const row = {
      id: MEAL, name: 'Arroz', meal_type: 'lunch', total_calories: '200', total_protein: '4',
      total_carbs: '44', total_fat: '1', logged_at: '2026-10-12 12:00:00+00',
    }
    const { fastify } = fakeFastify([
      ['FROM meals', [{ ...row, total_fiber: '3.50' }, { ...row, id: 'x', total_fiber: null }]],
    ])
    const meals = await listMeals(fastify, USER, '2026-10-12')
    expect(meals[0].fiber).toBe(3.5)
    expect(meals[1].fiber).toBeNull()
  })
})

describe('addMeal — fibra', () => {
  it('com a migration 022: grava fiber_g', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['INSERT INTO meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00' }]],
    ])
    const meal = await addMeal(fastify, USER, { ...body, fiber: 5 })
    expect(meal.fiber).toBe(5)
    const item = calls.find((c) => c.sql.includes('INSERT INTO meal_items'))
    expect(item?.sql).toContain('fiber_g')
    expect(item?.params).toContain(5)
  })

  it('sem a migration 022: grava como antes e devolve fiber null', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 0 }]],
      ['INSERT INTO meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00' }]],
    ])
    const meal = await addMeal(fastify, USER, { ...body, fiber: 5 })
    expect(meal.fiber).toBeNull()
    const item = calls.find((c) => c.sql.includes('INSERT INTO meal_items'))
    expect(item?.sql).not.toContain('fiber_g')
  })
})

describe('updateMeal', () => {
  it('atualiza nome/tipo e troca o item da refeição pelos novos valores', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['UPDATE meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00', meal_type: 'dinner' }]],
    ])
    const meal = await updateMeal(fastify, USER, MEAL, { ...body, mealType: 'dinner', fiber: null })
    expect(meal).toMatchObject({ id: MEAL, name: 'Arroz', calories: 200, fiber: null, mealType: 'dinner' })
    const update = calls.find((c) => c.sql.includes('UPDATE meals'))
    expect(update?.params).toEqual(expect.arrayContaining([MEAL, USER]))
    expect(calls.some((c) => c.sql.includes('DELETE FROM meal_items'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO meal_items'))).toBe(true)
  })

  it('refeição inexistente ou de outro usuário → 404 MEAL_NOT_FOUND', async () => {
    const { fastify } = fakeFastify([[COLS, [{ n: 2 }]], ['UPDATE meals', []]])
    await expect(updateMeal(fastify, USER, MEAL, body)).rejects.toMatchObject({
      statusCode: 404,
      code: 'MEAL_NOT_FOUND',
    })
  })

  it('sem a migration 022: edita sem tocar em fiber_g', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 0 }]],
      ['UPDATE meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00', meal_type: 'lunch' }]],
    ])
    const meal = await updateMeal(fastify, USER, MEAL, { ...body, fiber: 4 })
    expect(meal.fiber).toBeNull()
    expect(calls.some((c) => c.sql.includes('fiber_g'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/modules/food-log/food-log.service.test.ts`
Expected: FAIL — `updateMeal` não exportado; `fiber` undefined.

- [ ] **Step 3: Write minimal implementation**

`food-log.schemas.ts`:
- em `mealSchema`, depois de `fat`: `fiber: z.number().nullable(),`
- em `addMealBodySchema`, depois de `fat`:

```ts
  /** Fibra (g). Ausente/null = sem dado. */
  fiber: z.number().min(0).nullable().optional(),
```

- novo schema e tipo:

```ts
/** PATCH: mesmo corpo do POST, sem a data (a refeição não muda de dia). */
export const updateMealBodySchema = addMealBodySchema.omit({ date: true })
export type UpdateMealBody = z.infer<typeof updateMealBodySchema>
```

`food-log.service.ts`:
- import: `import { hasMealFiberColumns } from './meal-fiber-columns.js'` e `UpdateMealBody` no import de tipos.
- em `listMeals`, acrescentar `total_fiber: string | null` ao tipo da linha; no `SELECT` trocar `FROM meals` por `FROM meals m` e acrescentar a coluna (funciona com ou sem a migration, como `getTodayPlan` da dieta):

```sql
      to_jsonb(m)->>'total_fiber' AS total_fiber,
```

  e no `map`: `fiber: row.total_fiber == null ? null : Number(row.total_fiber),`
- helper para gravar o item (usado por `addMeal` e `updateMeal`):

```ts
type MealValues = Pick<AddMealBody, 'name' | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>

/** Item único da refeição do diário livre; fibra só se a coluna existir. */
async function insertMealItem(
  sql: FastifyInstance['db'],
  mealId: string,
  data: MealValues,
  withFiber: boolean,
): Promise<void> {
  if (withFiber) {
    await sql`
      INSERT INTO meal_items (meal_id, food_name, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g, source)
      VALUES (${mealId}, ${data.name}, 100, ${data.calories}, ${data.protein}, ${data.carbs}, ${data.fat}, ${data.fiber ?? null}, 'manual')
    `
    return
  }
  await sql`
    INSERT INTO meal_items (meal_id, food_name, quantity_g, calories, protein_g, carbs_g, fat_g, source)
    VALUES (${mealId}, ${data.name}, 100, ${data.calories}, ${data.protein}, ${data.carbs}, ${data.fat}, 'manual')
  `
}
```

- em `addMeal`: antes do `fastify.db.begin`, `const withFiber = await hasMealFiberColumns(fastify)`; substituir o `INSERT INTO meal_items` por `await insertMealItem(sql, meal.id, data, withFiber)`; no objeto devolvido acrescentar `fiber: withFiber ? (data.fiber ?? null) : null,`.
- nova função:

```ts
export async function updateMeal(
  fastify: FastifyInstance,
  userId: string,
  mealId: string,
  data: UpdateMealBody,
): Promise<Meal> {
  const withFiber = await hasMealFiberColumns(fastify)
  return fastify.db.begin(async (sql) => {
    const [meal] = await sql<{ id: string; logged_at: string; meal_type: string }[]>`
      UPDATE meals
      SET name = ${data.name}, meal_type = ${toDbMealType(data.mealType)}, updated_at = NOW()
      WHERE id = ${mealId} AND user_id = ${userId}
      RETURNING id, logged_at::TEXT AS logged_at, meal_type
    `
    if (!meal) throw new AppError(404, 'MEAL_NOT_FOUND', 'Refeição não encontrada')

    // Mesmo modelo do POST: um item com os valores informados; o trigger
    // recalcula os totais da refeição.
    await sql`DELETE FROM meal_items WHERE meal_id = ${mealId}`
    await insertMealItem(sql, mealId, data, withFiber)

    return {
      id: meal.id,
      name: data.name,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      fiber: withFiber ? (data.fiber ?? null) : null,
      loggedAt: meal.logged_at,
      mealType: toApiMealType(meal.meal_type),
    }
  })
}
```

`food-log.routes.ts` — importar `updateMealBodySchema` e `updateMeal`; acrescentar antes do DELETE:

```ts
  /**
   * PATCH /food-log/:id
   * Corrige uma refeição do diário livre (ex.: a IA errou a estimativa).
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['FoodLog'],
        summary: 'Editar refeição do diário livre',
        security: [{ bearerAuth: [] }],
        params: mealParamsSchema,
        body: updateMealBodySchema,
        response: { 200: mealSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await updateMeal(fastify, userId, request.params.id, request.body))
    },
  )
```

Se `fakeFastify` não expuser `db.begin` com o mesmo `db` (ele expõe: `(db as any).begin = (fn) => fn(db)`), os testes acima funcionam sem mudança.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run && npm run typecheck && npx biome check src/modules/food-log`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/food-log
git commit -m "feat(food-log): fibra nas refeições e PATCH /food-log/:id"
```

### Task 7: App — tipos, serviço, store e totais com fibra

**Files:**
- Modify: `app/src/shared/services/scanner.service.ts` (`ScanItem`, `normalize`)
- Modify: `app/src/shared/services/food-log.service.ts` (`Meal`, `AddMealPayload`, `updateMeal`)
- Modify: `app/src/features/food-log/store.ts` (`updateMeal`)
- Modify: `app/src/features/food-log/hooks/useFoodLog.ts` (`handleUpdateMeal`)
- Modify: `app/src/shared/utils/calories.ts` (`DayTotals.fiber`, `getDailyFiberGoal`)
- Modify: `app/src/features/scanner/store.ts` (`addManualItem`, `confirm` envia `fiber`)
- Test: `app/src/shared/utils/calories.test.ts`, `app/src/features/food-log/store.test.ts`, `app/src/shared/services/food-log.service.test.ts` (criar se não existir), `app/src/features/scanner/store.test.ts`

**Interfaces:**
- Consumes: API das Tasks 5–6.
- Produces:
  - `ScanItem.fiber?: number | null`
  - `Meal.fiber?: number | null`; `AddMealPayload.fiber?: number | null`
  - `foodLogService.updateMeal(id: string, data: Omit<AddMealPayload, 'date'>): Promise<Meal>`
  - `useFoodLogStore.getState().updateMeal(date: string, meal: Meal): void`
  - `useFoodLog().handleUpdateMeal(id: string, data: Omit<AddMealPayload, 'date'>): Promise<void>`
  - `DayTotals.fiber: number`; `getDailyFiberGoal(plan: DietPlan | null | undefined): number | null`

- [ ] **Step 1: Write the failing tests**

`calories.test.ts` — os dois `toEqual` existentes de `getDayTotals` (linhas ~63 e ~67) comparam o objeto inteiro: acrescentar `fiber: 0` neles. Depois acrescentar (ajustar o import para incluir `getDailyFiberGoal`):

```ts
describe('fibra nos totais do dia', () => {
  it('soma a fibra conhecida do plano concluído e do diário; ausente conta 0', () => {
    const totals = getDayTotals({
      planMeals: [
        { completedToday: true, calories: 100, protein: 1, carbs: 1, fat: 1, fiber: 4 },
        { completedToday: false, calories: 100, protein: 1, carbs: 1, fat: 1, fiber: 9 },
      ],
      freeMeals: [
        { calories: 50, protein: 1, carbs: 1, fat: 1, fiber: 2.5 },
        { calories: 50, protein: 1, carbs: 1, fat: 1, fiber: null },
        { calories: 50, protein: 1, carbs: 1, fat: 1 },
      ],
    });
    expect(totals.fiber).toBe(6.5);
  });

  it('meta de fibra: soma do plano quando alguma refeição tem o dado; senão null', () => {
    const meal = { fiber: 5 } as never;
    expect(getDailyFiberGoal({ meals: [meal, { fiber: 3 } as never] } as never)).toBe(8);
    expect(getDailyFiberGoal({ meals: [{ fiber: null } as never] } as never)).toBeNull();
    expect(getDailyFiberGoal(null)).toBeNull();
  });
});
```

`food-log/store.test.ts` (acrescentar):

```ts
  it('updateMeal troca a refeição pelo id no dia', () => {
    const meal = { id: 'm1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, loggedAt: 'x', mealType: 'lunch' as const };
    useFoodLogStore.getState().setMeals('2026-10-12', [meal]);
    useFoodLogStore.getState().updateMeal('2026-10-12', { ...meal, calories: 150, fiber: 3 });
    expect(useFoodLogStore.getState().mealsByDate['2026-10-12']).toEqual([
      { ...meal, calories: 150, fiber: 3 },
    ]);
  });
```

`food-log.service.test.ts` (criar se não existir; se existir, acrescentar o `it`):

```ts
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('./api', () => ({ __esModule: true, default: { patch: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { foodLogService } = require('./food-log.service');

describe('foodLogService.updateMeal', () => {
  it('faz PATCH em /food-log/:id e devolve a refeição', async () => {
    api.patch.mockResolvedValue({ data: { id: 'm1' } });
    const data = { name: 'Arroz', calories: 150, protein: 4, carbs: 30, fat: 1, fiber: null, mealType: 'lunch' };
    await expect(foodLogService.updateMeal('m1', data)).resolves.toEqual({ id: 'm1' });
    expect(api.patch).toHaveBeenCalledWith('/food-log/m1', data);
  });
});
```

`scanner/store.test.ts` (acrescentar):

```ts
  it('confirm envia a fibra do item ao diário', async () => {
    foodLogService.addMeal.mockResolvedValue({ id: 'meal' });
    useScannerStore.setState({ items: [{ ...item('1'), fiber: 6 }] });
    await useScannerStore.getState().confirm();
    expect(foodLogService.addMeal).toHaveBeenCalledWith(expect.objectContaining({ fiber: 6 }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest src/shared/utils/calories.test.ts src/features/food-log/store.test.ts src/shared/services/food-log.service.test.ts src/features/scanner/store.test.ts`
Expected: FAIL — `getDailyFiberGoal`/`updateMeal` inexistentes; `fiber` ausente no payload.

- [ ] **Step 3: Write minimal implementation**

`scanner.service.ts` — em `ScanItem`, depois de `fat`:

```ts
  /** Fibra (g). null/ausente = sem dado. */
  fiber?: number | null;
```

e no ramo legado de `normalize`, depois de `fat: d.fat ?? 0,`: `fiber: d.fiber ?? null,`.

`food-log.service.ts` — em `Meal` e em `AddMealPayload`, depois de `fat`:

```ts
  /** Fibra (g). null/ausente = sem dado. */
  fiber?: number | null;
```

e no objeto `foodLogService`:

```ts
  /** Corrige uma refeição (ex.: a IA errou). A data não muda. */
  updateMeal: (id: string, data: Omit<AddMealPayload, 'date'>) =>
    api.patch<Meal>(`/food-log/${id}`, data).then((r) => r.data),
```

`food-log/store.ts` — na interface: `updateMeal: (date: string, meal: Meal) => void;` e na implementação (depois de `removeMeal`):

```ts
  updateMeal: (date, meal) =>
    set((s) => ({
      mealsByDate: {
        ...s.mealsByDate,
        [date]: (s.mealsByDate[date] ?? []).map((m) => (m.id === meal.id ? meal : m)),
      },
    })),
```

`useFoodLog.ts` — depois de `handleDeleteMeal`:

```ts
  const handleUpdateMeal = useCallback(
    async (id: string, data: Omit<AddMealPayload, 'date'>): Promise<void> => {
      // Erro sobe para o modal, que já mostra "Não foi possível salvar".
      const meal = await foodLogService.updateMeal(id, data);
      store.updateMeal(store.selectedDate, meal);
    },
    [store.selectedDate],
  );
```

e devolver `handleUpdateMeal` no objeto de retorno.

`calories.ts`:

```ts
export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Soma da fibra conhecida (registro sem dado conta 0). */
  fiber: number;
}

type MacroSource = Pick<DayTotals, 'calories' | 'protein' | 'carbs' | 'fat'> & {
  fiber?: number | null;
};

function sumMacros(items: MacroSource[]): DayTotals {
  return items.reduce<DayTotals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      fiber: acc.fiber + (m.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}
```

Em `getDayTotals`, o tipo de `planMeals` passa a ser `MacroSource & { completedToday: boolean }`, e o retorno acrescenta `fiber: planned.fiber + free.fiber,`. Nova função (importar o tipo `DietPlan` de `@shared/services/diet.service` se ainda não estiver importado):

```ts
/** Meta de fibra = soma do plano de hoje; null se nenhuma refeição tiver o dado (dieta antiga). */
export function getDailyFiberGoal(plan: DietPlan | null | undefined): number | null {
  const known = (plan?.meals ?? []).filter((m) => m.fiber != null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((acc, m) => acc + (m.fiber ?? 0), 0));
}
```

`scanner/store.ts` — em `addManualItem` acrescentar `fiber: null,`; em `confirm`, no objeto passado a `foodLogService.addMeal`, depois de `fat: i.fat,`: `fiber: i.fiber ?? null,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest && npx tsc --noEmit`
Expected: PASS. Se o `tsc` acusar algum outro chamador de `getDayTotals`/`DayTotals` que monta o objeto à mão, acrescentar `fiber` nele.

- [ ] **Step 5: Commit**

```bash
git add app/src/shared/services app/src/shared/utils app/src/features/food-log/store.ts app/src/features/food-log/store.test.ts app/src/features/food-log/hooks/useFoodLog.ts app/src/features/scanner/store.ts app/src/features/scanner/store.test.ts
git commit -m "feat(app): fibra e edição de refeição nos serviços, store e totais"
```

### Task 8: Scanner — botão "Editar" e campo de fibra

**Files:**
- Modify: `app/src/features/scanner/components/ScanItemRow.tsx`
- Test: `app/src/features/scanner/components/ScanItemRow.test.tsx`, `app/src/features/scanner/screens/ScanResultScreen.test.tsx`

**Interfaces:**
- Consumes: `ScanItem.fiber` (Task 7); `NUM_FIELDS` (Task 2).
- Produces: `ScanItemRow` com modo leitura/edição (props inalteradas).

- [ ] **Step 1: Update/write the failing tests** — `ScanItemRow.test.tsx`:
  - Os testes que editam (`'edita o nome via onChange'`, `'editar campo macro para "1.5"…'`, `'limpar campo macro…'`, `'rótulos por extenso…'`) passam a tocar em **Editar** antes: logo após o `render(...)`, acrescentar `fireEvent.press(getByText('Editar'));` (desestruturar `getByText` do `render`).
  - Novos testes:

```tsx
  it('começa em modo leitura, com os valores por extenso e o botão Editar', () => {
    const { getByText, queryByTestId } = render(
      <ScanItemRow item={{ ...item, fiber: 3 }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Arroz')).toBeTruthy();
    expect(getByText('200 kcal')).toBeTruthy();
    expect(getByText('Proteína 4g · Carboidratos 44g · Gordura 1g · Fibra 3g')).toBeTruthy();
    expect(getByText('Editar')).toBeTruthy();
    expect(queryByTestId('scan-item-name')).toBeNull();
  });

  it('sem fibra, a linha de leitura omite a fibra', () => {
    const { getByText } = render(
      <ScanItemRow item={{ ...item, fiber: null }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Proteína 4g · Carboidratos 44g · Gordura 1g')).toBeTruthy();
  });

  it('Editar abre o formulário com Fibra (g) e Concluir volta à leitura', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId, queryByTestId } = render(
      <ScanItemRow item={{ ...item, fiber: 3 }} onChange={onChange} onRemove={() => {}} />,
    );
    fireEvent.press(getByText('Editar'));
    expect(getByText('Fibra (g)')).toBeTruthy();
    fireEvent.changeText(getByTestId('scan-item-fiber'), '5');
    expect(onChange).toHaveBeenCalledWith('1', { fiber: 5 });
    fireEvent.press(getByText('Concluir'));
    expect(queryByTestId('scan-item-name')).toBeNull();
  });

  it('fibra apagada vira null (sem dado), não 0', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId } = render(
      <ScanItemRow item={{ ...item, fiber: 3 }} onChange={onChange} onRemove={() => {}} />,
    );
    fireEvent.press(getByText('Editar'));
    fireEvent.changeText(getByTestId('scan-item-fiber'), '');
    expect(onChange).toHaveBeenCalledWith('1', { fiber: null });
  });

  it('item manual (sem nome) já abre em edição', () => {
    const { getByTestId } = render(
      <ScanItemRow item={{ ...item, name: '' }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByTestId('scan-item-name')).toBeTruthy();
  });
```

  - `ScanResultScreen.test.tsx`: em `'renderiza os itens detectados'` trocar `getByDisplayValue('Arroz')` por `getByText('Arroz')` (desestruturando `getByText`); no teste de convidado, idem.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest src/features/scanner`
Expected: FAIL — "Editar" não existe.

- [ ] **Step 3: Write minimal implementation** — `ScanItemRow.tsx`:
  - `NUM_FIELDS` ganha a fibra:

```tsx
const NUM_FIELDS: { key: keyof ScanItem; label: string }[] = [
  { key: 'calories', label: 'Calorias (kcal)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'fat', label: 'Gordura (g)' },
  { key: 'fiber', label: 'Fibra (g)' },
];

/** Linha de leitura: macros por extenso; fibra só quando existe o dado. */
export function macroSummary(item: ScanItem): string {
  const parts = [
    `Proteína ${item.protein}g`,
    `Carboidratos ${item.carbs}g`,
    `Gordura ${item.fat}g`,
  ];
  if (item.fiber != null) parts.push(`Fibra ${item.fiber}g`);
  return parts.join(' · ');
}
```

  - estado de edição e drafts (o draft da fibra parte de `''` quando não há dado):

```tsx
  // Item manual (sem nome) já nasce em edição; o resto abre pelo botão Editar.
  const [editing, setEditing] = useState(item.name.trim() === '');
  const [drafts, setDrafts] = useState<DraftState>(() =>
    Object.fromEntries(
      NUM_FIELDS.map((f) => [f.key, item[f.key] == null ? '' : String(item[f.key])]),
    ),
  );
```

  - no `onChangeText` dos campos numéricos, fibra vazia vira `null`:

```tsx
                onChangeText={(v) => {
                  setDrafts((prev) => ({ ...prev, [f.key]: v }));
                  const parsed = parseFloat(v.replace(',', '.'));
                  const value = isNaN(parsed) ? (f.key === 'fiber' ? null : 0) : parsed;
                  onChange(item.id, { [f.key]: value } as Partial<ScanItem>);
                }}
```

  - render: o `TextInput` do nome e o bloco `macrosRow` só aparecem com `editing`; em modo leitura:

```tsx
      {editing ? null : (
        <View style={styles.readRow}>
          <View style={styles.readInfo}>
            <Text style={styles.readName}>{item.name}</Text>
            <Text style={styles.readMacros}>{macroSummary(item)}</Text>
          </View>
          <Text style={styles.readKcal}>{`${item.calories} kcal`}</Text>
        </View>
      )}
```

    e, antes do `ConfidenceBadge`, o botão que alterna:

```tsx
      <Pressable
        onPress={() => setEditing((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={editing ? 'Concluir edição' : `Editar ${item.name || 'item'}`}
        style={styles.editBtn}
        hitSlop={8}
      >
        <Text style={styles.editLabel}>{editing ? 'Concluir' : 'Editar'}</Text>
      </Pressable>
```

    O cabeçalho atual (`headerRow` com o `TextInput` do nome + ✕) passa a renderizar o `TextInput` só em `editing`; o botão ✕ continua sempre visível (no modo leitura, fica à direita do `readRow` — mover o `Pressable` de remover para depois do bloco de leitura/edição dentro de um `View` com `flexDirection: 'row'`).
  - estilos novos:

```tsx
  readRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  readInfo: { flex: 1 },
  readName: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor },
  readMacros: { fontSize: typography.fontSize.xs, color: colors.brandText, marginTop: 4 },
  readKcal: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold, color: colors.brandPrimary },
  editBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brandMutedSurface },
  editLabel: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest src/features/scanner && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/scanner
git commit -m "feat(scanner): botão Editar e campo de fibra no resultado"
```

### Task 9: Diário e painel — editar refeição e mostrar fibra

**Files:**
- Modify: `app/src/features/food-log/components/AddMealModal.tsx` (modo edição + campo fibra)
- Modify: `app/src/features/food-log/components/FoodLogItem.tsx` (botão Editar + fibra na linha)
- Modify: `app/src/features/food-log/components/MealSection.tsx` (repassa `onEdit`)
- Modify: `app/src/features/food-log/screens/FoodLogScreen.tsx` (estado da refeição em edição)
- Modify: `app/src/features/food-log/components/DayMacroSummary.tsx` (Fibras)
- Modify: `app/src/features/dashboard/screens/DashboardScreen.tsx` (card Fibras)
- Test: `AddMealModal.test.tsx`, `FoodLogItem.test.tsx`, `FoodLogScreen.test.tsx` (acrescentar), `DashboardScreen` (se houver teste; senão coberto por `calories.test.ts`)

**Interfaces:**
- Consumes: `handleUpdateMeal` (Task 7); `Meal.fiber`; `getDailyFiberGoal`; `DayTotals.fiber`.
- Produces:
  - `AddMealModal` props: `{ visible; onClose; onSubmit: (data: AddMealPayload) => Promise<void>; initialMeal?: Meal }`
  - `FoodLogItem` props: `{ meal; onDelete; onEdit?: (meal: Meal) => void; hideBorder? }`
  - `MealSection` props: `{ title; meals; onDelete; onEdit?: (meal: Meal) => void }`

- [ ] **Step 1: Write the failing tests**

`AddMealModal.test.tsx` (acrescentar):

```tsx
  const existing = {
    id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, fiber: 4,
    loggedAt: '2026-10-12 12:00:00+00', mealType: 'dinner' as const,
  };

  it('modo edição: abre preenchido e envia os novos valores', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = render(
      <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} initialMeal={existing} />,
    );
    expect(getByText('Editar refeição')).toBeTruthy();
    expect(getByTestId('meal-name-input').props.value).toBe('Frango');
    expect(getByTestId('meal-fiber-input').props.value).toBe('4');
    fireEvent.changeText(getByTestId('meal-calories-input'), '400');
    fireEvent.press(getByText('Salvar alterações'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Frango', calories: 400, fiber: 4, mealType: 'dinner' }),
      ),
    );
  });

  it('fibra vazia é enviada como null (sem dado)', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = render(
      <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} initialMeal={existing} />,
    );
    fireEvent.changeText(getByTestId('meal-fiber-input'), '');
    fireEvent.press(getByText('Salvar alterações'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fiber: null })),
    );
  });
```

`FoodLogItem.test.tsx` (acrescentar):

```tsx
  it('mostra fibra quando houver e chama onEdit com a refeição', () => {
    const onEdit = jest.fn();
    const { getByText, getByTestId } = render(
      <FoodLogItem meal={{ ...meal, fiber: 4 }} onDelete={() => {}} onEdit={onEdit} />,
    );
    expect(getByText('Proteínas 38g · Carboidratos 52g · Gorduras 8g · Fibras 4g')).toBeTruthy();
    fireEvent.press(getByTestId('edit-m1'));
    expect(onEdit).toHaveBeenCalledWith({ ...meal, fiber: 4 });
  });
```

`FoodLogScreen.test.tsx` — ler o arquivo para reaproveitar o mock existente de `useFoodLog`/serviço e acrescentar um teste: com uma refeição `m1` na lista, `fireEvent.press(getByTestId('edit-m1'))` abre o modal com `getByText('Editar refeição')`; ao salvar, `handleUpdateMeal` (ou `foodLogService.updateMeal`, conforme o mock do arquivo) é chamado com `'m1'` e os valores do formulário.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest src/features/food-log`
Expected: FAIL — `initialMeal`, `meal-fiber-input`, `edit-m1` inexistentes.

- [ ] **Step 3: Write minimal implementation**

`AddMealModal.tsx`:
- props: acrescentar `initialMeal?: Meal` (importar `Meal` de `@shared/services/food-log.service`).
- `parseMacro` ganha a variante da fibra:

```tsx
/** Fibra: campo vazio = sem dado (null), diferente dos macros (vazio = 0). */
function parseFiber(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined = inválido
}
```

- estado inicial a partir de `initialMeal`, e ressincronização quando o modal abre para outra refeição:

```tsx
  const toField = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [name, setName] = useState(initialMeal?.name ?? '');
  const [mealType, setMealType] = useState<AppMealType>(
    initialMeal && initialMeal.mealType !== 'other' ? initialMeal.mealType : 'lunch',
  );
  const [calories, setCalories] = useState(toField(initialMeal?.calories));
  const [protein, setProtein] = useState(toField(initialMeal?.protein));
  const [carbs, setCarbs] = useState(toField(initialMeal?.carbs));
  const [fat, setFat] = useState(toField(initialMeal?.fat));
  const [fiber, setFiber] = useState(toField(initialMeal?.fiber));

  useEffect(() => {
    if (!visible) return;
    setName(initialMeal?.name ?? '');
    setMealType(initialMeal && initialMeal.mealType !== 'other' ? initialMeal.mealType : 'lunch');
    setCalories(toField(initialMeal?.calories));
    setProtein(toField(initialMeal?.protein));
    setCarbs(toField(initialMeal?.carbs));
    setFat(toField(initialMeal?.fat));
    setFiber(toField(initialMeal?.fiber));
    setFieldError('');
  }, [visible, initialMeal]);
```

  (importar `useEffect`; `toField` fica fora do componente para não entrar nas dependências.)
- validação: `const parsedFiber = parseFiber(fiber);` e `hasInvalidNumber = Object.values(parsed).some((v) => v === null) || parsedFiber === undefined;`
- no `onSubmit`, acrescentar `fiber: parsedFiber ?? null,`; o reset pós-sucesso também zera `setFiber('')`.
- título e botão:

```tsx
const saveMealLabel = 'Salvar refeição';
const saveChangesLabel = 'Salvar alterações';
...
<Text style={styles.headerTitle}>{initialMeal ? 'Editar refeição' : 'Registrar refeição'}</Text>
...
{initialMeal ? saveChangesLabel : saveMealLabel}
```

- novo campo depois de "Gordura (g)":

```tsx
            <Input
              label="Fibra (g)"
              placeholder="Fibra (g) — opcional"
              placeholderTextColor={colors.textDisabled}
              keyboardType="numeric"
              value={fiber}
              onChangeText={setFiber}
              testID="meal-fiber-input"
            />
```

`FoodLogItem.tsx`:
- props: `onEdit?: (meal: Meal) => void`.
- linha de macros:

```tsx
        <Text style={styles.macros}>
          {`Proteínas ${meal.protein}g · Carboidratos ${meal.carbs}g · Gorduras ${meal.fat}g`}
          {meal.fiber != null ? ` · Fibras ${meal.fiber}g` : ''}
        </Text>
```

  (o teste busca o texto inteiro; se o `getByText` não casar com filhos concatenados, montar a string numa variável `const macros = …` e renderizar `{macros}`.)
- no bloco `right`, antes do botão de excluir:

```tsx
        {onEdit ? (
          <TouchableOpacity
            onPress={() => onEdit(meal)}
            style={styles.editBtn}
            testID={`edit-${meal.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Editar ${meal.name}`}
          >
            <Text style={styles.editLabel}>Editar</Text>
          </TouchableOpacity>
        ) : null}
```

  e envolver os dois botões num `View` com `flexDirection: 'row', gap: spacing.sm`. Estilos:

```tsx
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editBtn: { height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandMutedSurface },
  editLabel: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor },
```

`MealSection.tsx` — props `onEdit?: (meal: Meal) => void`, repassado: `<FoodLogItem … onEdit={onEdit} />`.

`FoodLogScreen.tsx`:

```tsx
  const { …, handleAddMeal, handleDeleteMeal, handleUpdateMeal } = useFoodLog();
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  ...
  <MealSection … onDelete={handleDeleteMeal} onEdit={setEditingMeal} />
  ...
  <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleAddMeal} />
  <AddMealModal
    visible={editingMeal !== null}
    initialMeal={editingMeal ?? undefined}
    onClose={() => setEditingMeal(null)}
    onSubmit={(data) => {
      const { date: _date, ...rest } = data;
      return handleUpdateMeal(editingMeal!.id, rest);
    }}
  />
```

  (importar `Meal` de `@shared/services/food-log.service`. Se o lint reclamar de `_date` não usado, usar `const rest = { ...data }; delete rest.date;`.)

`DayMacroSummary.tsx` — somar fibra e mostrar o 5º item:

```tsx
      fiber: acc.fiber + (meal.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
```

```tsx
    { label: 'Fibras', value: String(totals.fiber), suffix: 'g', color: colors.brandAnchor },
```

(o `index > 1 && styles.statBottom` continua válido; conferir no web que o grid quebra em 2 colunas com o 5º item.)

`DashboardScreen.tsx` — importar `getDailyFiberGoal` de `@shared/utils/calories`; depois de `fatGoal`: `const fiberGoal = getDailyFiberGoal(plan);` e no `macroGrid`, depois do card de Gordura:

```tsx
          <MacroCard
            label="Fibras"
            current={totals.fiber}
            goal={fiberGoal}
            color={colors.brandAnchor}
          />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/food-log app/src/features/dashboard
git commit -m "feat(diário): editar refeição e mostrar fibras no diário e no painel"
```

### Fechamento do PR B

- [ ] `cd backend && npx vitest run && npm run typecheck`; `cd app && npx jest && npx tsc --noEmit` — tudo verde.
- [ ] Revisão visual no web (`?preview=app`): scanner (Editar/Concluir, Fibra), diário (Editar abre preenchido; Fibras na linha e no resumo), Dashboard (card Fibras; 4 cards quebram bem em telefone e tablet).
- [ ] PR com a ordem de deploy na descrição:
  1. Rodar `backend/supabase/migrations/022_meal_fiber.sql` no SQL Editor do Supabase (pode ser antes ou depois do merge — o backend tolera os dois).
  2. Merge → Vercel publica a API; o OTA publica o app.
  3. Conferir em produção: `PATCH /api/food-log/<id-inexistente>` com token → 404; foto de prato → resposta com `fiber`.
