# Hardening — Bugs Acumulados & Responsividade Web — Implementation Plan (Plano 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditar e corrigir os bugs acumulados das fases anteriores (cada um com teste de regressão) e tornar o app responsivo no web (container com largura máxima + layouts fluidos).

**Architecture:** Fase de auditoria gera a lista de bugs (suíte de testes + ledgers + smoke); correções pontuais por arquivo. Responsividade via um `ScreenContainer` compartilhado (maxWidth condicional a web) e `useWindowDimensions`. Sem dependência nova.

**Tech Stack:** React Native 0.76 (+ react-native-web), TypeScript, Jest + @testing-library/react-native.

## Global Constraints

- **Diretório:** `app/`. Rodar comandos de dentro de `app/`.
- **Critério de bug:** falha de teste, comportamento incorreto/frágil, ou achado Important/Minor registrado nos ledgers (`.superpowers/sdd/progress.md` e relatórios).
- **Cada correção** com **teste de regressão** quando o comportamento for testável.
- **Responsividade:** apenas **web**. O `maxWidth` deve ser **condicional a `Platform.OS === 'web'`** e não alterar o layout nativo.
- **Breakpoints de validação:** ~375 (mobile), ~768 (tablet), ~1280 (desktop).
- **Gate:** `npx jest <path>` (de `app/`). NÃO rodar `tsc` completo. Saída **pristine**.
- **Idioma:** PT-BR. **Imports type-only** com `import type`.
- **Commits:** política da sessão (controlador decide; `--no-verify` se o husky travar).

---

### Task 1: Auditoria (descoberta) — produzir a lista de bugs

**Files:**
- Create: `app/docs/superpowers/plans/HARDENING-AUDIT.md` (checklist vivo da auditoria)

**Interfaces:** Produces: lista priorizada de bugs (id, arquivo, sintoma, severidade, estratégia de fix + teste).

- [ ] **Step 1: Rodar a suíte e catalogar falhas**

De `app/`:
```bash
npx jest 2>&1 | tee /tmp/jest-audit.txt | tail -30
grep -E "^(FAIL|  ●)" /tmp/jest-audit.txt
```
Classificar cada falha: (a) bug de produto, (b) infra de teste (ex: `@env`), (c) pré-existente não relacionada.

- [ ] **Step 2: Varrer ledgers e relatórios**

```bash
sed -n '1,400p' .superpowers/sdd/progress.md
ls .superpowers/sdd/*-report.md 2>/dev/null
```
Extrair os achados Important/Minor anotados (ver lista pré-catalogada abaixo) e qualquer "follow-up".

- [ ] **Step 3: Smoke manual (web)**

`npm run web`; percorrer auth → dashboard → diário → scanner → coach → comunidade → perfil → evolução; anotar quebras.

- [ ] **Step 4: Escrever o checklist**

Create `app/docs/superpowers/plans/HARDENING-AUDIT.md` com uma tabela: `id | área | sintoma | severidade | fix | teste`. **Sementes já conhecidas** (incorporar):

- `@env`/jest: suítes que importam `api.ts` falham se faltar `moduleNameMapper` + `__mocks__/@env.js`. Confirmar estado na `main` (veio com Comunidade). Garantir que `npx jest` carrega tudo.
- Tab bar densa (Dashboard/Diário/[câmera]/Coach/Comunidade/Perfil/Evolução): avaliar enxugar/compactar.
- Feed `onEndReached` sem guarda de `isLoadingMore`/`hasMore` → chamadas redundantes de `loadMore`.
- `PostCard` botão de comentários sem `accessibilityLabel`; ícones-só sem rótulo.
- `PostCardSkeleton` usando `colors.white` em vez de token de superfície.
- Scanner store `manualSeq` não reseta entre testes (determinismo).
- `CameraAction` (tab) navegável programaticamente sem `tabPress` preventDefault.
- `ScannerStackScreenProps` sem `CompositeScreenProps` (getParent não tipado).
- Falta teste de caminho de erro em stores (`analyze`/`confirm` do scanner; `addComment` rollback do feed; `markAllRead`/`markRead` do notifications).

- [ ] **Step 5: Commit do checklist**

```bash
git add app/docs/superpowers/plans/HARDENING-AUDIT.md
git commit -m "docs(hardening): checklist da auditoria de bugs"
```

> As tasks seguintes implementam as correções. As sementes abaixo (Tasks 2–6) são as conhecidas; bugs novos da auditoria viram tasks adicionais no mesmo padrão (fix + teste de regressão).

---

### Task 2: Infra de teste `@env` (destravar a suíte)

**Files:**
- Verify/Modify: `app/package.json` (jest `moduleNameMapper`), `app/__mocks__/@env.js`

**Interfaces:** após esta task, `npx jest` carrega todas as suítes (sem `Cannot find module '@env'`).

- [ ] **Step 1: Confirmar o estado atual**

De `app/`:
```bash
grep -n "@env" package.json || echo "sem mapper @env"
ls __mocks__/@env.js 2>/dev/null || echo "sem mock @env"
npx jest __tests__/App.test.tsx 2>&1 | grep -iE "Cannot find module '@env'|Tests:" | head
```

- [ ] **Step 2: Se faltar, adicionar o mock e o mapper**

Create `app/__mocks__/@env.js` (se ausente):
```js
module.exports = { API_BASE_URL: 'http://localhost:8000', API_TIMEOUT: '10000' };
```
In `app/package.json` jest config, adicionar ao `moduleNameMapper`:
```json
"^@env$": "<rootDir>/__mocks__/@env.js"
```

- [ ] **Step 3: Verificar**

Run (de `app/`): `npx jest __tests__/App.test.tsx` → carrega (sem erro de `@env`). Catalogar quaisquer falhas REAIS que aparecerem (entram na auditoria/Task seguinte).

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/__mocks__/@env.js
git commit -m "fix(test): mapeia @env no jest para destravar as suítes"
```

> Se já estiver presente na `main` (via Comunidade), esta task vira um no-op confirmado; anotar e seguir.

---

### Task 3: Guarda do `onEndReached` no Feed

**Files:**
- Modify: `app/src/features/feed/screens/FeedScreen.tsx`
- Test: `app/src/features/feed/screens/FeedScreen.test.tsx`

**Interfaces:** consome o `useFeed`/store existentes (`isLoadingMore`, `hasMore`, `loadMore`).

- [ ] **Step 1: Escrever o teste de regressão**

Adicionar em `FeedScreen.test.tsx` um caso: com `nextCursor === null` (fim do feed), disparar `onEndReached` da `FlatList` não chama `feedService.getFeed` de novo. (Mockar `feedService`; obter o callback via `props` da `FlatList` pelo testID ou disparar `onEndReached` programaticamente.)

```tsx
it('não pagina quando não há próxima página', async () => {
  feedService.getFeed.mockResolvedValue({ posts: [post], nextCursor: null });
  const { getByTestId } = render(<FeedScreen navigation={navigation} route={{ key: 'k', name: 'Feed' } as never} />);
  await waitFor(() => expect(feedService.getFeed).toHaveBeenCalledTimes(1));
  fireEvent(getByTestId('feed-list'), 'endReached');
  expect(feedService.getFeed).toHaveBeenCalledTimes(1);
});
```
(Adicionar `testID='feed-list'` à `FlatList`.)

- [ ] **Step 2: Run → FAIL** (hoje `loadMore` é chamado sem guarda).

- [ ] **Step 3: Implementar a guarda**

No `FeedScreen`, trocar `onEndReached={() => loadMore()}` por:
```tsx
onEndReached={() => { if (hasMore && !isLoadingMore) loadMore(); }}
```
(garantir `hasMore`/`isLoadingMore` vindos do `useFeed`). O store já é idempotente, mas a guarda evita chamadas redundantes.

- [ ] **Step 4: Run → PASS** and commit.

```bash
git add app/src/features/feed/screens/FeedScreen.tsx app/src/features/feed/screens/FeedScreen.test.tsx
git commit -m "fix(feed): guarda onEndReached contra paginação redundante"
```

---

### Task 4: Acessibilidade — rótulos em botões/ícones-só

**Files:**
- Modify: `app/src/features/feed/components/PostCard.tsx` (botão de comentários)
- Modify: outros ícones-só sem rótulo identificados na auditoria
- Test: `app/src/features/feed/components/PostCard.test.tsx`

- [ ] **Step 1: Teste de regressão**

Em `PostCard.test.tsx`, asserir que o botão de comentários tem rótulo acessível:
```tsx
it('botão de comentários é acessível por rótulo', () => {
  const { getByLabelText } = render(<PostCard post={basePost} onPressComments={() => {}} onToggleLike={() => {}} />);
  expect(getByLabelText(/coment/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implementar** — no `PostCard`, adicionar ao `Pressable` de comentários:
```tsx
accessibilityRole='button'
accessibilityLabel={`${post.commentCount} comentários`}
```
Repetir o padrão (rótulo claro) nos demais ícones-só listados na auditoria.

- [ ] **Step 4: Run → PASS** and commit.

```bash
git add app/src/features/feed/components/PostCard.tsx app/src/features/feed/components/PostCard.test.tsx
git commit -m "fix(a11y): accessibilityLabel em botões de ícone"
```

---

### Task 5: Robustez de stores — determinismo e cobertura de erro

**Files:**
- Modify: `app/src/features/scanner/store.ts` (`manualSeq` determinístico)
- Test: stores com caminho de erro faltando (`scanner`, `feed`, `notifications`)

- [ ] **Step 1: `manualSeq` determinístico**

No scanner store, mover `manualSeq` para dentro do estado OU resetá-lo em `reset`/`clear` (ex: derivar id de `Date.now()`-free incremental que zera no `clear`). Implementação mínima: usar um contador no closure do `create` e zerá-lo no `reset`/`clear`.

- [ ] **Step 2: Testes de caminho de erro**

Adicionar, onde faltar, testes de rejeição:
- `scanner/store.test.ts`: `analyze` em erro seta `error` e `isAnalyzing=false`; `confirm` em erro relança e mantém items.
- `feed/store.test.ts`: `addComment` em erro remove o otimista e reverte `commentCount` (se ainda não coberto).
- `notifications/store.test.ts`: `markAllRead`/`markRead` revertem em erro (se ainda não coberto).

Cada teste no padrão `mockRejectedValue` + asserção do estado revertido.

- [ ] **Step 3: Run → GREEN** (`npx jest src/features/scanner src/features/feed src/features/notifications`).

- [ ] **Step 4: Commit**

```bash
git add app/src/features/scanner/store.ts app/src/features/scanner/store.test.ts app/src/features/feed/store.test.ts app/src/features/notifications/store.test.ts
git commit -m "fix(stores): manualSeq determinístico + cobertura de erro"
```

---

### Task 6: Navegação — tab bar e tipos

**Files:**
- Modify: `app/src/navigation/BrandTabNavigator.tsx` (densidade + `CameraAction` tabPress guard)
- Modify: `app/src/navigation/types.ts` (`ScannerStackScreenProps` composite — se aplicável)

- [ ] **Step 1: `CameraAction` não-navegável**

Na `Tab.Screen name='CameraAction'`, adicionar `listeners` para impedir navegação programática acidental:
```tsx
listeners={{ tabPress: (e) => e.preventDefault() }}
```
(O botão central já chama `navigate('Scanner')`; o `tabPress` guard evita foco na rota placeholder.)

- [ ] **Step 2: Densidade da tab bar (decisão de UX)**

Avaliar a contagem de abas. Mínimo desta task: garantir que os labels/ícones cabem em ~375px (compactar `tabLabel`/`tabItem` se necessário). Se for decidido mover Coach/Comunidade para um menu "Mais", tratar como mudança explícita (fora do mínimo; anotar no checklist se adiado).

- [ ] **Step 3: `ScannerStackScreenProps` composite (type-safety)**

Se presente, tornar:
```ts
export type ScannerStackScreenProps<T extends keyof ScannerStackParamList> =
  CompositeScreenProps<NativeStackScreenProps<ScannerStackParamList, T>, RootStackScreenProps<keyof RootStackParamList>>;
```
(para tipar `getParent()`). Ajuste de tipo apenas; sem mudança de runtime.

- [ ] **Step 4: Verificar e commitar**

Run (de `app/`): `npx jest src/features/scanner src/features/feed` → verde.
```bash
git add app/src/navigation
git commit -m "fix(nav): guarda do CameraAction + tipos/densidade da tab bar"
```

---

### Task 7: `ScreenContainer` (responsividade web)

**Files:**
- Create: `app/src/shared/components/ScreenContainer.tsx`
- Test: `app/src/shared/components/ScreenContainer.test.tsx`

**Interfaces:** Produces: `ScreenContainer({ children, maxWidth?, style? })` — centraliza com `maxWidth` apenas no web; passthrough no nativo.

- [ ] **Step 1: Escrever o teste**

Create `app/src/shared/components/ScreenContainer.test.tsx`:

```tsx
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ScreenContainer } from './ScreenContainer';

describe('ScreenContainer', () => {
  it('renderiza os filhos', () => {
    const { getByText } = render(<ScreenContainer><Text>oi</Text></ScreenContainer>);
    expect(getByText('oi')).toBeTruthy();
  });
  it('no web aplica maxWidth e centraliza', () => {
    const original = Platform.OS;
    // @ts-expect-error override para teste
    Platform.OS = 'web';
    const { getByTestId } = render(<ScreenContainer maxWidth={600}><Text>x</Text></ScreenContainer>);
    const flat = Object.assign({}, ...[].concat(getByTestId('screen-container').props.style));
    expect(flat.maxWidth).toBe(600);
    expect(flat.alignSelf).toBe('center');
    expect(flat.width).toBe('100%');
    // @ts-expect-error restore
    Platform.OS = original;
  });
  it('no nativo não aplica maxWidth', () => {
    const original = Platform.OS;
    // @ts-expect-error override
    Platform.OS = 'ios';
    const { getByTestId } = render(<ScreenContainer><Text>x</Text></ScreenContainer>);
    const flat = Object.assign({}, ...[].concat(getByTestId('screen-container').props.style ?? {}));
    expect(flat.maxWidth).toBeUndefined();
    // @ts-expect-error restore
    Platform.OS = original;
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implementar**

Create `app/src/shared/components/ScreenContainer.tsx`:

```tsx
import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  maxWidth?: number;
  style?: ViewStyle;
}

export function ScreenContainer({ children, maxWidth = 600, style }: Props): React.JSX.Element {
  const webStyle: ViewStyle | undefined =
    Platform.OS === 'web' ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined;
  return (
    <View testID='screen-container' style={[styles.base, webStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1 },
});
```

- [ ] **Step 4: Run → PASS** and commit.

```bash
git add app/src/shared/components/ScreenContainer.tsx app/src/shared/components/ScreenContainer.test.tsx
git commit -m "feat(shared): ScreenContainer (maxWidth no web)"
```

---

### Task 8: Aplicar responsividade nas telas

**Files:**
- Modify: telas principais (`DashboardScreen`, `FoodLogScreen`, `CoachScreen`, `FeedScreen`, `ChallengesScreen`, `ProfileScreen`, `EvolutionScreen`, `ScanResultScreen`, etc.)

**Interfaces:** consome `ScreenContainer` (Task 7) e `useWindowDimensions`.

- [ ] **Step 1: Envolver o conteúdo** das telas de conteúdo com `ScreenContainer` (logo dentro do `SafeAreaView`, em volta do `ScrollView`/`FlatList` ou do bloco principal). Não afeta o nativo (passthrough).

- [ ] **Step 2: Larguras reativas** onde houver elementos que esticam — usar `useWindowDimensions()` para dimensionar gráficos (`WeeklyCalorieChart`, `WeightLineChart`) e evitar overflow; inputs/cards com `width: '100%'` dentro do container.

- [ ] **Step 3: Verificar** — `npx jest src/features` → verde (mudança é estrutural de layout; ajustar testes de tela se a árvore mudou, mantendo pristine).

- [ ] **Step 4: Smoke web nos breakpoints** — `npm run web`, redimensionar para ~375/~768/~1280 e confirmar: sem overflow horizontal; conteúdo centralizado com `maxWidth` no desktop; nada quebra no mobile estreito.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "polish(web): conteúdo responsivo com ScreenContainer + larguras reativas"
```

---

### Task 9: Fechamento

- [ ] **Step 1:** `npx jest` (de `app/`) → suíte carrega inteira; suítes de feature verdes e pristine; falhas restantes catalogadas no `HARDENING-AUDIT.md` com justificativa.
- [ ] **Step 2:** Conferir o `HARDENING-AUDIT.md`: todos os itens Critical/Important marcados como resolvidos ou explicitamente adiados (follow-up).
- [ ] **Step 3:** Smoke web final nos 3 breakpoints.
- [ ] **Step 4:** Commit final.

## Self-Review (cobertura vs spec)

- Auditoria → lista de bugs (D37–D39): Task 1. ✅
- Correções de bugs com teste de regressão (D37–D39): Tasks 2–6 (sementes conhecidas) + tasks adicionais da auditoria. ✅
- Responsividade web (D43): Tasks 7–8 (`ScreenContainer` + aplicação + breakpoints). ✅
- Fora de escopo: consistência visual/animações/empty-states (Plano 1); responsividade nativa; performance/bundle.
