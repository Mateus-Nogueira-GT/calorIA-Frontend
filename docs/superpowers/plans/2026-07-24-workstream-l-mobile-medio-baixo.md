# Workstream L — Mobile Médio+Baixo: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preferências persistindo no mobile, anel com progresso real no nativo, leaderboard sem crash, polling pausado em background, teclado sem cobrir o modal, tab bar com 6 abas, tipo do Scanner corrigido, alerts visíveis no web e dívidas documentadas.

**Architecture:** Refactor do auth store (prefs no estado persistido), donut de duas metades em Views puras, guards de params/AppState, wrapper de KeyboardAvoidingView, realocação da tela Evolução, util `showAlert` e um doc de hardening.

**Tech Stack:** React Native 0.76, zustand/persist (kvStorage já existente), react-navigation, jest.

## Global Constraints

- Branch: `fix/mobile-polimento` empilhada sobre `fix/mobile-alto` (Workstream K).
- Baseline de testes: 6 suítes pré-existentes falhando; ao fim do L7.1 a baseline de **tsc** cai 1 erro (o de `navigate('Scanner')`) — registrar a nova contagem no PR.
- Comandos do app em `app/`.

---

### Task L1: Preferências no estado persistido (morre o localStorage)

**Files:**
- Modify: `app/src/features/auth/store.ts`
- Test: `app/src/features/auth/store.test.ts`

**Interfaces:**
- Produces: estado `preferencesByUser: Record<string, ProfilePreferences>` persistido via partialize; API pública do store inalterada (`profilePreferences`, `setProfilePreferences`).

- [ ] **Step 1: Teste que falha (persistência por usuário sem localStorage)**

Adicionar em `app/src/features/auth/store.test.ts`:

```ts
describe('preferências por usuário (sem localStorage — L1)', () => {
  const userA = { id: 'a', name: 'A', email: 'a@a.com' };
  const userB = { id: 'b', name: 'B', email: 'b@b.com' };

  it('prefs sobrevivem a logout + novo login do mesmo usuário', () => {
    useAuthStore.getState().setToken('t', userA, 'r');
    useAuthStore.getState().setProfilePreferences({ goal: 'lose_weight' });
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('t2', userA, 'r2');
    expect(useAuthStore.getState().profilePreferences.goal).toBe('lose_weight');
  });

  it('prefs não vazam entre usuários', () => {
    useAuthStore.getState().setToken('t', userA, 'r');
    useAuthStore.getState().setProfilePreferences({ goal: 'gain_muscle' });
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('t', userB, 'r');
    expect(useAuthStore.getState().profilePreferences.goal).toBeNull();
  });
});
```

Run: `npx jest src/features/auth/store.test.ts` → o 1º caso FALHA no RN puro (localStorage inexistente; no jsdom pode passar — validar que o novo código passa em ambos).

- [ ] **Step 2: Refatorar o store**

Em `app/src/features/auth/store.ts`:

1. Remover: `PROFILE_PREFERENCES_STORAGE_KEY`, `canUseLocalStorage`, `readStoredPreferencesByUser`, `writeStoredPreferencesByUser`, `getStoredPreferencesForUser`, `persistPreferencesForUser`.
2. Estado novo + helpers internos:

```ts
interface AuthState {
  // ...campos existentes...
  /** Prefs por usuário — persistidas via kvStorage (o localStorage era morto no RN). */
  preferencesByUser: Record<string, ProfilePreferences>;
}
```

3. `mergeProfilePreferences(user, stored)` recebe as stored como argumento:

```ts
function mergeProfilePreferences(
  user: User,
  stored: ProfilePreferences | undefined,
): ProfilePreferences {
  const fromUser = getProfilePreferencesFromUser(user);
  return {
    goal: fromUser.goal ?? stored?.goal ?? null,
    coachPersonality: fromUser.coachPersonality ?? stored?.coachPersonality ?? null,
  };
}
```

4. `setToken`/`setPendingAuth`:

```ts
setToken: (token, user, refreshToken) =>
  set((state) => {
    const profilePreferences = mergeProfilePreferences(user, state.preferencesByUser[user.id]);
    return {
      token,
      refreshToken: refreshToken ?? state.pendingAuth?.refreshToken ?? state.refreshToken,
      user,
      isAuthenticated: true,
      pendingAuth: null,
      profilePreferences,
      preferencesByUser: { ...state.preferencesByUser, [user.id]: profilePreferences },
    };
  }),
```

(análogo em `setPendingAuth`.)

5. `setProfilePreferences` grava no mapa quando há usuário:

```ts
setProfilePreferences: (preferences) =>
  set((state) => {
    const nextPreferences = { ...state.profilePreferences, ...preferences };
    const uid = state.user?.id ?? state.pendingAuth?.user.id;
    return {
      profilePreferences: nextPreferences,
      ...(uid
        ? { preferencesByUser: { ...state.preferencesByUser, [uid]: nextPreferences } }
        : {}),
    };
  }),
```

6. `clearToken` NÃO limpa `preferencesByUser` (é o que permite sobreviver ao logout); zera só `profilePreferences` corrente.
7. `partialize` inclui `preferencesByUser`.
8. Migração única do legado (web): em `onRehydrateStorage`, se `typeof window !== 'undefined' && window.localStorage`, ler `caloria:profile-preferences`, mesclar em `preferencesByUser` e remover a chave.

- [ ] **Step 3: Rodar testes**

Run: `npx jest src/features/auth/store.test.ts` → PASS (novos + existentes; ajustar os existentes que mockavam localStorage, se houver).

- [ ] **Step 4: Commit**

```bash
git add app/src/features/auth/store.ts app/src/features/auth/store.test.ts
git commit -m "fix(mobile): preferências de perfil persistem via kvStorage — localStorage era morto no RN e as prefs sumiam a cada restart"
```

---

### Task L2: CalorieRing com arco real no nativo

**Files:**
- Modify: `app/src/features/dashboard/components/CalorieRing.tsx`
- Test: `app/src/features/dashboard/components/CalorieRing.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
// adicionar em CalorieRing.test.tsx
it('nativo: renderiza as metades do arco conforme o percentual', () => {
  const { queryByTestId, rerender } = render(<CalorieRing current={30} goal={100} />);
  expect(queryByTestId('ring-half-right')).toBeTruthy();
  expect(queryByTestId('ring-half-left-full')).toBeNull();
  rerender(<CalorieRing current={80} goal={100} />);
  expect(queryByTestId('ring-half-left-full')).toBeTruthy();
});
```

Run: `npx jest src/features/dashboard/components/CalorieRing.test.tsx` → FAIL.

- [ ] **Step 2: Implementar a técnica das duas metades (Views puras, sem SVG)**

Substituir o `<View style={[styles.outer, ...]} />` nativo por:

```tsx
function NativeArc({ percent, size, strokeWidth }: { percent: number; size: number; strokeWidth: number }): React.JSX.Element {
  // Donut sem SVG: um container circular com overflow hidden por metade;
  // cada metade tem um semicírculo colorido rotacionado por percent.
  const halfStyle = {
    width: size / 2,
    height: size,
    overflow: 'hidden' as const,
  };
  const arcCommon = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: strokeWidth,
    borderColor: colors.brandPrimary,
    position: 'absolute' as const,
  };
  // 0–50%: só a metade direita gira de -180° até 0°.
  // 50–100%: direita cheia + esquerda gira de -180° até 0°.
  const rightAngle = Math.min(percent, 0.5) * 360 - 180;
  const leftAngle = Math.max(percent - 0.5, 0) * 360 - 180;
  return (
    <View style={[StyleSheet.absoluteFillObject, styles.arcRow]}>
      <View style={halfStyle}>
        {percent > 0.5 ? (
          <View testID="ring-half-left-full" style={[arcCommon, { left: 0, transform: [{ rotate: `${leftAngle}deg` }] }]} />
        ) : null}
      </View>
      <View style={halfStyle}>
        <View
          testID="ring-half-right"
          style={[arcCommon, { right: 0, transform: [{ rotate: `${rightAngle}deg` }] }]}
        />
      </View>
    </View>
  );
}
```

No componente principal, o ramo nativo vira: track (borda cinza, como hoje) + `<NativeArc percent={percent} size={size} strokeWidth={strokeWidth} />` por cima; web mantém o `conic-gradient`. Adicionar `arcRow: { flexDirection: 'row' }` aos styles.

> Nota de execução: validar visualmente no simulador com 25/50/75/100%; se a técnica de rotação não ficar precisa nesta versão do RN, fallback aceitável: barra de progresso circularizada simples — mas registrar a decisão no PR.

- [ ] **Step 3: Testes + commit**

```bash
npx jest src/features/dashboard/components/CalorieRing.test.tsx   # PASS
git add app/src/features/dashboard/components/CalorieRing.tsx app/src/features/dashboard/components/CalorieRing.test.tsx
git commit -m "fix(mobile): CalorieRing com arco real no nativo (conic-gradient era só web — anel ficava sempre cinza)"
```

---

### Task L3: Leaderboard sem crash + L4: polling em background

**Files:**
- Modify: `app/src/features/challenges/screens/ChallengeLeaderboardScreen.tsx`
- Modify: `app/src/features/notifications/hooks/useNotificationPolling.ts`
- Test: `app/src/features/notifications/hooks/useNotificationPolling.test.ts`

- [ ] **Step 1: Guard de params no leaderboard**

Trocar `const { challengeId, code } = route.params;` por:

```tsx
const { challengeId, code } = route.params ?? {};
```

E antes do retorno principal:

```tsx
if (!challengeId && !code) {
  return (
    <SafeAreaView style={styles.safe}>
      <ErrorState
        title="Desafio não encontrado"
        subtitle="Abra o desafio pela lista ou por um convite válido."
        onRetry={() => {}}
      />
    </SafeAreaView>
  );
}
```

(ajustar props do `ErrorState` ao contrato real do componente.)

- [ ] **Step 2: Teste que falha (polling em background)**

Adicionar em `useNotificationPolling.test.ts` um caso: simular `AppState` mudando para `'background'` (mock do listener já usado nos testes existentes) + `jest.advanceTimersByTime(90_000)` → `load` NÃO é chamado; voltar a `'active'` → `load` chamado 1x imediatamente e o timer volta.

- [ ] **Step 3: Implementar**

```ts
// app/src/features/notifications/hooks/useNotificationPolling.ts
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNotificationsStore } from '../store';
import { useAuthStore } from '@features/auth/store';

const POLL_INTERVAL_MS = 45_000;

export function useNotificationPolling(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchNow = () => {
      useNotificationsStore.getState().load().catch(() => {});
    };
    const start = () => {
      if (intervalRef.current) return;
      fetchNow();
      intervalRef.current = setInterval(fetchNow, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    start();
    // Em background o timer seguia rodando (bateria/dados no Android até o SO
    // matar o processo). Agora: para ao sair de 'active', religa ao voltar.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [isAuthenticated]);
}
```

- [ ] **Step 4: Testes + commit**

```bash
npx jest src/features/notifications/hooks src/features/challenges 2>&1 | grep "Tests:"
git add app/src/features/challenges/screens/ChallengeLeaderboardScreen.tsx app/src/features/notifications/hooks
git commit -m "fix(mobile): leaderboard sem crash com params ausentes + polling de notificações pausa em background"
```

---

### Task L5: Teclado no AddMealModal

**Files:**
- Modify: `app/src/features/food-log/components/AddMealModal.tsx`

- [ ] **Step 1: Envolver o sheet**

No JSX do modal, trocar `<View style={styles.overlay}>` por:

```tsx
<KeyboardAvoidingView
  style={styles.overlay}
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
>
  {/* ...sheet existente... */}
</KeyboardAvoidingView>
```

(adicionar `KeyboardAvoidingView, Platform` ao import de react-native.)

- [ ] **Step 2: Testes do modal + commit**

```bash
npx jest src/features/food-log/components/AddMealModal.test.tsx 2>&1 | grep "Tests:"
git add app/src/features/food-log/components/AddMealModal.tsx
git commit -m "fix(mobile): teclado não cobre mais o formulário do AddMealModal (iOS)"
```

---

### Task L6: Tab bar com 6 abas (Evolução → Perfil)

**Files:**
- Modify: `app/src/navigation/types.ts`, `app/src/navigation/BrandTabNavigator.tsx`, `app/src/navigation/RootNavigator.tsx`
- Modify: `app/src/features/profile/screens/ProfileScreen.tsx`

- [ ] **Step 1: Tipos** — em `types.ts`: remover `Evolution: undefined;` de `TabParamList`; adicionar `Evolution: undefined;` a `RootStackParamList`.
- [ ] **Step 2: BrandTabNavigator** — remover `<Tab.Screen name='Evolution' ... />` e o import de `EvolutionScreen`; remover o ícone correspondente do `TabIcon` se for switch por rota.
- [ ] **Step 3: RootNavigator** — adicionar:

```tsx
<RootStack.Screen
  name='Evolution'
  component={EvolutionScreen}
  options={{ headerShown: true, title: 'Evolução' }}
/>
```

(+ import `EvolutionScreen`).
- [ ] **Step 4: ProfileScreen** — adicionar `ProfileMenuItem` "Evolução" (mesmo padrão dos itens existentes) navegando `navigation.navigate('Evolution')`.
- [ ] **Step 5: Ajustar testes de navegação/tela afetados; rodar `npx jest src/features/profile src/features/evolution src/navigation 2>&1 | grep "Tests:"`.
- [ ] **Step 6: Commit**

```bash
git add app/src/navigation app/src/features/profile
git commit -m "refactor(mobile): Evolução sai da tab bar (7→6 abas) e vira rota acessada pelo Perfil"
```

---

### Task L7: Baixos — tipo do Scanner, showAlert, hardening doc

**Files:**
- Modify: `app/src/navigation/types.ts`
- Create: `app/src/shared/utils/show-alert.ts`
- Modify: usos de `Alert.alert` em `app/src/features/{diet,scanner,challenges,friends}/**` e `app/src/features/food-log/components/AddMealModal.tsx`
- Create: `docs/mobile-hardening.md`

- [ ] **Step 1: Tipo do Scanner (remove o erro TS pré-existente)**

Em `types.ts`:

```ts
Scanner: NavigatorScreenParams<ScannerStackParamList> | undefined;
```

Run: `npx tsc --noEmit 2>&1 | grep BrandTabNavigator` → o erro da linha ~150 desaparece.

- [ ] **Step 2: showAlert util**

```ts
// app/src/shared/utils/show-alert.ts
import { Alert, Platform } from 'react-native';

/**
 * Alert.alert é NO-OP no react-native-web — erros ficavam silenciosos no
 * navegador. No nativo continua o Alert do sistema.
 */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
```

- [ ] **Step 3: Substituir os usos de erro** — nos arquivos: `features/diet/store.ts`, `features/scanner/store.ts`, `features/challenges/store.ts`, `features/friends/screens/FriendsScreen.tsx` (alerts informativos de erro; o `Alert.alert` com botões de confirmação — remover amizade — PERMANECE `Alert.alert`, pois `window.confirm` mudaria o contrato; anotar como limitação web), `features/food-log/components/AddMealModal.tsx`. Trocar `Alert.alert(x, y)` → `showAlert(x, y)` e limpar imports não usados.
- [ ] **Step 4: docs/mobile-hardening.md**

```markdown
# Hardening mobile — dívidas documentadas

## Tokens no Keychain/Keystore (pendente)
Access/refresh tokens hoje ficam em AsyncStorage (texto puro). Migrar para
`react-native-keychain` (lib nativa + pod install) mapeando o kvStorage do
zustand/persist para o keychain apenas na chave `caloria:auth`. Exige migração
de sessão (ler do AsyncStorage uma vez e regravar).

## Crash reporting (pendente)
Nenhum Sentry/Crashlytics: crashes de produção são invisíveis. Plugar
`@sentry/react-native` e reportar no `componentDidCatch` do AppErrorBoundary
(ponto único já preparado).

## Pods iOS
Após instalar qualquer dependência nativa (AsyncStorage incluído):
`cd app/ios && bundle install && bundle exec pod install`.

## Limitação conhecida (web)
Diálogos de CONFIRMAÇÃO (ex.: remover amizade) usam Alert.alert nativo e não
têm equivalente no web (no-op) — cobertos apenas no mobile por ora.
```

- [ ] **Step 5: Verificação total + commit**

```bash
npx jest 2>&1 | grep -E "Test Suites:|Tests:"    # baseline
npx tsc --noEmit 2>&1 | grep -cE "^src"          # baseline − 1 (Scanner corrigido)
npm run build:web 2>&1 | tail -1                 # sucesso
git add app/src docs/mobile-hardening.md
git commit -m "fix(mobile): tipo do Scanner, showAlert visível no web e doc de hardening (keychain/sentry/pods)"
```

---

### Task L8: Push e PR

- [ ] `git push -u origin fix/mobile-polimento` + PR empilhado sobre `fix/mobile-alto`, listando L1–L7 e as novas baselines (jest inalterada; tsc com 1 erro a menos).
