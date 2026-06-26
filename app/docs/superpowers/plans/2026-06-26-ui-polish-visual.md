# UI Polish — Visual & Micro-interações — Implementation Plan (Plano 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar a UI: criar tokens de espaçamento/raio e migrar literais, impor tokens de tipografia/cor, criar primitivas compartilhadas (`Skeleton`, `EmptyState`, `ErrorState`, `usePressScale`), padronizar transições e cobrir loading/empty/erro em todas as telas async.

**Architecture:** Novas primitivas em `app/src/theme` e `app/src/shared/{components,hooks}`; migração incremental por feature substituindo valores literais por tokens e empties duplicados pelos componentes compartilhados. Sem dependência nova (Animated API + opções do React Navigation).

**Tech Stack:** React Native 0.76, TypeScript, React Navigation, Jest + @testing-library/react-native, Animated API.

## Global Constraints

- **Diretório:** todo o trabalho em `app/` (frontend do monorepo). Rodar comandos de dentro de `app/`.
- **Cores:** só tokens de `app/src/theme/colors.ts`. **Espaçamento:** tokens de `spacing` (Task 1). **Tipografia:** `typography.fontSize/fontFamily/...`. Nenhum literal novo de cor/fontSize/spacing.
- **Escala de spacing:** `{ xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32 }`. **radius:** `{ sm:8, md:12, lg:16, pill:999 }`.
- **Escala de fontSize (existente):** `{ xs:11, sm:13, base:15, md:17, lg:20, xl:24, xxl:30, xxxl:36 }` — migrar literais para o token mais próximo (distância absoluta; empate → o maior).
- **Migração:** só troca de valor literal por token equivalente; **não** redesenhar telas. Mudanças sub-pixel são aceitáveis.
- **Gate:** `npx jest <path>` (de `app/`). NÃO rodar `tsc` completo. Saída de teste **pristine** — animações drenadas com `jest.useFakeTimers()` + `act(() => jest.runAllTimers())`.
- **Idioma:** copy em PT-BR. **Imports type-only** com `import type`.
- **Commits:** seguir a política da sessão (o controlador decide commitar/agrupar; se o husky travar, `--no-verify`).

---

### Task 1: Tokens de espaçamento e raio

**Files:**
- Create: `app/src/theme/spacing.ts`
- Modify: `app/src/theme/index.ts`
- Test: `app/src/theme/spacing.test.ts`

**Interfaces:**
- Produces: `spacing` (`{ xs,sm,md,lg,xl,xxl,xxxl }`), `radius` (`{ sm,md,lg,pill }`), reexportados por `@theme`.

- [ ] **Step 1: Write the failing test**

Create `app/src/theme/spacing.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { spacing, radius } from './spacing';

describe('spacing tokens', () => {
  it('expõe a escala 4-based', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 });
  });
  it('expõe a escala de raio', () => {
    expect(radius).toEqual({ sm: 8, md: 12, lg: 16, pill: 999 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/theme/spacing.test.ts`
Expected: FAIL — cannot find module `./spacing`.

- [ ] **Step 3: Implement**

Create `app/src/theme/spacing.ts`:

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
```

- [ ] **Step 4: Export via `@theme`**

In `app/src/theme/index.ts`, add (mirroring the existing colors/typography re-exports):

```ts
export { spacing, radius } from './spacing';
```

- [ ] **Step 5: Run test → PASS**

Run: `npx jest src/theme/spacing.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/theme/spacing.ts app/src/theme/index.ts app/src/theme/spacing.test.ts
git commit -m "feat(theme): tokens de spacing e radius"
```

---

### Task 2: Primitiva `Skeleton`

**Files:**
- Create: `app/src/shared/components/Skeleton.tsx`
- Test: `app/src/shared/components/Skeleton.test.tsx`

**Interfaces:**
- Produces: `Skeleton({ width?, height?, radius?, style? })` — bloco pulsante (Animated opacity loop), honra reduce motion.

- [ ] **Step 1: Write the failing test**

Create `app/src/shared/components/Skeleton.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renderiza com testID e dimensões', () => {
    const { getByTestId } = render(<Skeleton width={100} height={12} testID='sk' />);
    const node = getByTestId('sk');
    const flat = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style.flat()) : node.props.style;
    expect(flat.width).toBe(100);
    expect(flat.height).toBe(12);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx jest src/shared/components/Skeleton.test.tsx`).

- [ ] **Step 3: Implement**

Create `app/src/shared/components/Skeleton.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius as radiusTokens } from '@theme';

interface Props {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
  testID?: string;
}

export function Skeleton({ width = '100%', height = 12, radius = radiusTokens.pill, style, testID }: Props): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.72)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.72, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reduceMotion]);

  return (
    <Animated.View
      testID={testID}
      style={[styles.base, { width, height, borderRadius: radius, opacity: anim }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.brandTrack },
});
```

- [ ] **Step 4: Run → PASS** and commit.

```bash
git add app/src/shared/components/Skeleton.tsx app/src/shared/components/Skeleton.test.tsx
git commit -m "feat(shared): primitiva Skeleton"
```

> Migração de `PostCardSkeleton`/`MealCardSkeleton` para compor `Skeleton` é feita na Task 7 (consolidação), para não inflar esta task.

---

### Task 3: `EmptyState` e `ErrorState` compartilhados

**Files:**
- Create: `app/src/shared/components/EmptyState.tsx`
- Create: `app/src/shared/components/ErrorState.tsx`
- Test: `app/src/shared/components/EmptyState.test.tsx`
- Test: `app/src/shared/components/ErrorState.test.tsx`

**Interfaces:**
- Produces:
  - `EmptyState({ emoji?, title, subtitle?, actionLabel?, onAction? })`
  - `ErrorState({ title?, subtitle?, onRetry })`

- [ ] **Step 1: Write the failing tests**

Create `app/src/shared/components/EmptyState.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('mostra título e subtítulo', () => {
    const { getByText } = render(<EmptyState title='Nada aqui' subtitle='Adicione algo' />);
    expect(getByText('Nada aqui')).toBeTruthy();
    expect(getByText('Adicione algo')).toBeTruthy();
  });
  it('renderiza CTA e dispara onAction', () => {
    const onAction = jest.fn();
    const { getByText } = render(<EmptyState title='Vazio' actionLabel='Criar' onAction={onAction} />);
    fireEvent.press(getByText('Criar'));
    expect(onAction).toHaveBeenCalled();
  });
  it('sem actionLabel não renderiza CTA', () => {
    const { queryByText } = render(<EmptyState title='Vazio' />);
    expect(queryByText('Criar')).toBeNull();
  });
});
```

Create `app/src/shared/components/ErrorState.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('usa título padrão e dispara onRetry', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorState onRetry={onRetry} />);
    expect(getByText('Algo deu errado')).toBeTruthy();
    fireEvent.press(getByText('Tentar de novo'));
    expect(onRetry).toHaveBeenCalled();
  });
  it('aceita título customizado', () => {
    const { getByText } = render(<ErrorState title='Falha ao carregar' onRetry={() => {}} />);
    expect(getByText('Falha ao carregar')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx jest src/shared/components/EmptyState.test.tsx src/shared/components/ErrorState.test.tsx`).

- [ ] **Step 3: Implement `EmptyState`**

Create `app/src/shared/components/EmptyState.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@theme';
import { Button } from './Button';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji = '🌱', title, subtitle, actionLabel, onAction }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? <Button onPress={onAction}>{actionLabel}</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl * 2, paddingHorizontal: spacing.xxxl, gap: spacing.sm },
  emoji: { fontSize: typography.fontSize.xxl },
  title: { fontSize: typography.fontSize.md, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, textAlign: 'center' },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, textAlign: 'center', marginBottom: spacing.sm },
});
```

- [ ] **Step 4: Implement `ErrorState`**

Create `app/src/shared/components/ErrorState.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@theme';
import { Button } from './Button';

interface Props {
  title?: string;
  subtitle?: string;
  onRetry: () => void;
}

export function ErrorState({ title = 'Algo deu errado', subtitle = 'Verifique sua conexão e tente novamente.', onRetry }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>😕</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Button onPress={onRetry}>Tentar de novo</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl * 2, paddingHorizontal: spacing.xxxl, gap: spacing.sm },
  emoji: { fontSize: typography.fontSize.xxl },
  title: { fontSize: typography.fontSize.md, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, textAlign: 'center' },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, textAlign: 'center', marginBottom: spacing.sm },
});
```

> Confirme a API do `Button` (`children: string`, `variant`, etc.). Ajuste se diferente.

- [ ] **Step 5: Run → PASS** and commit.

```bash
git add app/src/shared/components/EmptyState.tsx app/src/shared/components/EmptyState.test.tsx app/src/shared/components/ErrorState.tsx app/src/shared/components/ErrorState.test.tsx
git commit -m "feat(shared): EmptyState e ErrorState compartilhados"
```

---

### Task 4: Hook `usePressScale` (micro-interação de toque)

**Files:**
- Create: `app/src/shared/hooks/usePressScale.ts`
- Test: `app/src/shared/hooks/usePressScale.test.ts`

**Interfaces:**
- Produces: `usePressScale()` → `{ scale: Animated.Value, onPressIn, onPressOut }`.

- [ ] **Step 1: Write the failing test**

Create `app/src/shared/hooks/usePressScale.test.ts`:

```ts
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import { usePressScale } from './usePressScale';

afterEach(() => jest.useRealTimers());

describe('usePressScale', () => {
  it('expõe scale e handlers e anima sem warning', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => usePressScale());
    expect(result.current.scale).toBeTruthy();
    act(() => {
      result.current.onPressIn();
      jest.runAllTimers();
    });
    act(() => {
      result.current.onPressOut();
      jest.runAllTimers();
    });
    expect(typeof result.current.onPressIn).toBe('function');
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement**

Create `app/src/shared/hooks/usePressScale.ts`:

```ts
import { useRef } from 'react';
import { Animated } from 'react-native';

export function usePressScale(pressedScale = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 0 }).start();

  return {
    scale,
    onPressIn: () => animateTo(pressedScale),
    onPressOut: () => animateTo(1),
  };
}
```

- [ ] **Step 4: Run → PASS** and commit.

```bash
git add app/src/shared/hooks/usePressScale.ts app/src/shared/hooks/usePressScale.test.ts
git commit -m "feat(shared): hook usePressScale"
```

---

### Task 5: Padronizar transições de tela

**Files:**
- Modify: `app/src/navigation/RootNavigator.tsx`
- Modify: `app/src/navigation/CommunityNavigator.tsx`
- Modify (se presente): `app/src/navigation/ScannerNavigator.tsx`

**Interfaces:** consome os navigators existentes; sem novos símbolos.

- [ ] **Step 1: Ler os navigators** e identificar `screenOptions` atuais.

- [ ] **Step 2: Aplicar transição consistente**

Em cada `createNativeStackNavigator`, garantir no `screenOptions` base:
```ts
animation: 'slide_from_right',
```
Manter `presentation: 'modal'` nas telas que já são modais (CreatePost, CreateChallenge, Scanner). Não alterar headers/títulos.

- [ ] **Step 3: Verificar**

Run (de `app/`): `npx jest src/features` → suíte permanece verde (mudança é só de opção de navegação; não deve afetar testes).

- [ ] **Step 4: Commit**

```bash
git add app/src/navigation
git commit -m "polish(nav): transições de tela consistentes (slide_from_right)"
```

---

### Task 6: Auditoria + migração de tokens (spacing/fontSize/cor)

**Files:**
- Modify: vários `app/src/**/*.tsx` (por feature; lista fechada na auditoria)

**Interfaces:** usa `spacing`/`radius` (Task 1), `typography.fontSize.*`, `colors.*`.

- [ ] **Step 1: Rodar a auditoria (gera o checklist)**

De `app/`, rodar e salvar a saída:
```bash
echo "== fontSize literais ==";   grep -rnE "fontSize: [0-9]" src --include=*.tsx | grep -v ".test." | wc -l
echo "== padding/margin/gap literais =="; grep -rnE "(padding|margin|gap|borderRadius)[A-Za-z]*: [0-9]" src --include=*.tsx | grep -v ".test." | wc -l
echo "== hex/rgb fora de theme =="; grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" src --include=*.tsx | grep -v "src/theme" | grep -v ".test." | wc -l
```
Listar os arquivos (sem `| wc -l`) para montar o **checklist por arquivo**. Excluir `src/theme/*` e testes.

- [ ] **Step 2: Migrar por feature (uma feature por vez)**

Para cada feature (`dashboard`, `food-log`, `coach`, `diet`, `profile`, `scanner`, `evolution`, `feed`, `challenges`, `notifications`, `auth`, `shared/components`):
1. Substituir `fontSize: N` → `typography.fontSize.<token>` (token mais próximo: 10/11→xs, 13→sm, 14/15→base, 16/17→md, 20→lg, 24→xl, 30→xxl, 36→xxxl).
2. Substituir `padding*/margin*/gap/borderRadius: N` → `spacing.<token>`/`radius.<token>` mais próximo (4→xs, 8→sm, 12→md, 16→lg, 20→xl, 24→xxl, 32→xxxl; raios 8→radius.sm, 12→md, 16→lg, 999→pill). Valores sem token próximo (ex: 2, 6, 74) que são detalhes finos de ícone/medida específica **podem permanecer** — anotar no checklist (não forçar token onde não há semântica).
3. Garantir `import` de `spacing`/`radius`/`typography` de `@theme` no arquivo.
4. Rodar a suíte da feature: `npx jest src/features/<feature>` → verde, pristine.

**Exemplo (food-log CalorieProgressBar):** `fontSize: 16` → `typography.fontSize.md`; `padding: 16` → `spacing.lg`; `borderRadius: 16` → `radius.lg`; `gap: 10` → `spacing.sm` (mais próximo) e anotar; `marginBottom: 12` → `spacing.md`.

- [ ] **Step 3: Cor**

Substituir qualquer `#...`/`rgba(...)` fora de `theme/` pelo token de cor equivalente em `colors.*`. Se não houver token equivalente, **adicionar o token** em `colors.ts` (com nome semântico) em vez de manter literal.

- [ ] **Step 4: Verificação final da migração**

Run (de `app/`): `npx jest src/features src/shared` → tudo verde, pristine. Re-rodar os greps do Step 1 e confirmar que as contagens caíram (resíduos justificados anotados).

- [ ] **Step 5: Commit (por feature ou agrupado conforme política da sessão)**

```bash
git add app/src
git commit -m "polish(ui): migra espaçamento/tipografia/cor para tokens"
```

> Esta task é **iterativa por feature**. Em execução por subagentes, pode ser quebrada em uma sub-task por feature; o checklist do Step 1 define o conjunto fechado.

---

### Task 7: Consolidar loading/empty/erro nas telas async

**Files:**
- Modify: skeletons por-feature (`PostCardSkeleton`, `MealCardSkeleton`, etc.) → compor `Skeleton`
- Modify: empties por-feature (`EmptyFeedState`, `EmptyDietState`, `EmptyChallengesState`, empties de food-log/evolution/scanner) → usar `EmptyState`
- Modify: telas de lista/async → adicionar `ErrorState` onde faltar

**Interfaces:** consome `Skeleton`, `EmptyState`, `ErrorState` (Tasks 2–3).

- [ ] **Step 1: Skeletons** — refatorar cada `*Skeleton` para compor a primitiva `Skeleton` (blocos via `<Skeleton width height radius />`). Rodar os testes da feature → verde.

- [ ] **Step 2: Empties** — para cada empty por-feature, substituir o layout interno por `<EmptyState .../>` (preservando a copy específica via props) ou trocar o uso direto na tela. Manter os testes de tela verdes (ajustar queries se necessário).

- [ ] **Step 3: Cobertura de erro** — auditar cada tela de lista/async (Feed, Dashboard, Diário, Coach, Dieta, Desafios, Leaderboard, Notificações, Evolução, ScanResult) e garantir o estado de **erro** com `ErrorState` (retry). Onde a tela hoje só trata loading/empty, adicionar o caminho de erro (capturar falha do load num `useState` e renderizar `ErrorState onRetry={reload}`).

- [ ] **Step 4: Verificação** — `npx jest src/features` → verde, pristine; checklist manual dos 3 estados por tela.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "polish(ui): Skeleton/EmptyState/ErrorState consolidados nas telas async"
```

---

### Task 8: Fechamento

- [ ] **Step 1:** `npx jest` (de `app/`) → suítes do módulo verdes, pristine (falhas pré-existentes de `@env` são tratadas no Spec 2/Hardening, não aqui).
- [ ] **Step 2:** Smoke (web): `npm run web` — verificar espaçamentos consistentes, transições suaves, skeletons no load, e empty/erro acionáveis nas telas.
- [ ] **Step 3:** Commit final (se houver ajustes do smoke).

## Self-Review (cobertura vs spec)

- Tokens de espaçamento + migração (D36–D37): Tasks 1, 6. ✅
- fontSize/cor consistentes (D36–D37): Task 6. ✅
- Transições de tela (D39–D40): Task 5. ✅
- Loading states / skeletons (D39–D40): Tasks 2, 7. ✅
- Micro-interações (D39–D40): Task 4 (+ aplicação em cards/CTAs na Task 7/6 conforme tocar). ✅
- Empty states + telas de erro amigáveis (D40–D41): Tasks 3, 7. ✅
- Fora de escopo: bugs/responsividade (Spec 2); dark mode; ESLint enforcement de tokens (follow-up).
