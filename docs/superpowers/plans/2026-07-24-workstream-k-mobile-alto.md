# Workstream K — Mobile Alto: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Datas Hermes-safe em todo o app, deep links `caloria://` registrados nas 2 plataformas, ErrorBoundary global e social login desarmado (configure + docs de ops).

**Architecture:** Um util puro de parse de data (espelho do normalizador do backend) consumido pelos 3 pontos de formatação; edições de manifest/plist; um componente classe de boundary; configure lazy no serviço do Google.

**Tech Stack:** React Native 0.76, Hermes, react-navigation linking, jest.

## Global Constraints

- Branch: `fix/mobile-alto` empilhada sobre `fix/mobile-critico` (Workstream J).
- Baseline de testes: 6 suítes pré-existentes falhando — nada novo pode falhar.
- Comandos do app em `app/`.

---

### Task K1: `parseDbDate` + datas Hermes-safe

**Files:**
- Create: `app/src/shared/utils/parse-db-date.ts`
- Modify: `app/src/shared/utils/date.ts` (`timeAgo`, `getMealGroup`)
- Modify: `app/src/features/food-log/components/FoodLogItem.tsx`
- Test: `app/src/shared/utils/parse-db-date.test.ts` (novo), `app/src/shared/utils/date.test.ts`

**Interfaces:**
- Produces: `parseDbDate(value: string): Date` (Date inválido apenas se irrecuperável).

- [ ] **Step 1: Teste que falha**

```ts
// app/src/shared/utils/parse-db-date.test.ts
import { parseDbDate } from './parse-db-date';

describe('parseDbDate (formato Postgres → Hermes-safe)', () => {
  it('formato Postgres com milissegundos e offset +00', () => {
    const d = parseDbDate('2026-07-24 15:32:10.123+00');
    expect(d.toISOString()).toBe('2026-07-24T15:32:10.123Z');
  });

  it('sem milissegundos e offset negativo -03', () => {
    const d = parseDbDate('2026-07-24 15:32:10-03');
    expect(d.toISOString()).toBe('2026-07-24T18:32:10.000Z');
  });

  it('ISO puro passa direto', () => {
    expect(parseDbDate('2026-07-24T12:00:00.000Z').toISOString()).toBe(
      '2026-07-24T12:00:00.000Z',
    );
  });

  it('date-only continua válido', () => {
    expect(Number.isNaN(parseDbDate('2026-07-24').getTime())).toBe(false);
  });

  it('lixo → Date inválido (sem throw)', () => {
    expect(Number.isNaN(parseDbDate('nunca').getTime())).toBe(true);
  });
});
```

Run: `npx jest src/shared/utils/parse-db-date.test.ts` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar (espelho do normalizador do backend `local-date.ts`)**

```ts
// app/src/shared/utils/parse-db-date.ts
/**
 * O Postgres serializa timestamptz como "2026-07-24 15:32:10.123+00" — sem o
 * 'T' e com offset de 2 dígitos. V8 (web) aceita; Hermes/JSC (mobile) retornam
 * Invalid Date, quebrando feed ("há NaN"), horários e agrupamento do diário.
 * Mesmo normalizador do backend (shared/local-date.ts).
 */
export function parseDbDate(value: string): Date {
  const normalized = (value.includes('T') ? value : value.replace(' ', 'T')).replace(
    /([+-]\d{2})$/,
    '$1:00',
  );
  return new Date(normalized);
}
```

Run: `npx jest src/shared/utils/parse-db-date.test.ts` → PASS.

- [ ] **Step 3: Testes de regressão em date.test.ts (falham antes do fix)**

Adicionar em `app/src/shared/utils/date.test.ts`:

```ts
describe('datas no formato Postgres (Hermes-safe)', () => {
  it('timeAgo aceita o formato do banco', () => {
    const now = new Date('2026-07-24T16:00:00Z');
    expect(timeAgo('2026-07-24 15:30:00.000+00', now)).toBe('há 30min');
  });

  it('timeAgo com data inválida retorna vazio (não "há NaN")', () => {
    expect(timeAgo('lixo')).toBe('');
  });

  it('getMealGroup aceita o formato do banco', () => {
    expect(getMealGroup('2026-07-24 08:30:00+00')).toBeDefined();
  });
});
```

- [ ] **Step 4: Aplicar parseDbDate em date.ts**

Em `app/src/shared/utils/date.ts`:

```ts
import { parseDbDate } from './parse-db-date';

export function getMealGroup(loggedAt: string): MealGroup {
  const hour = parseDbDate(loggedAt).getHours();
  if (hour >= 5 && hour < 11) return 'Café da manhã';
  if (hour >= 11 && hour < 15) return 'Almoço';
  if (hour >= 15 && hour < 18) return 'Lanche';
  return 'Jantar';
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = parseDbDate(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now.getTime() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
```

- [ ] **Step 5: FoodLogItem com guarda**

Em `app/src/features/food-log/components/FoodLogItem.tsx`, trocar o formatador (linha ~9-12) por:

```tsx
import { parseDbDate } from '@shared/utils/parse-db-date';

function formatTime(loggedAt: string): string {
  const date = parseDbDate(loggedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
```

(ajustar o call-site conforme o nome atual da função no arquivo).

- [ ] **Step 6: Rodar suíte de utils + componentes tocados**

Run: `npx jest src/shared/utils src/features/food-log/components/FoodLogItem.test.tsx 2>&1 | grep "Tests:"` → PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/shared/utils app/src/features/food-log/components/FoodLogItem.tsx
git commit -m "fix(mobile): parseDbDate — timestamps do Postgres viravam Invalid Date no Hermes (feed 'há NaN', diário sem hora)"
```

---

### Task K2: Deep links `caloria://` nativos + convite

**Files:**
- Modify: `app/ios/calorIA/Info.plist`
- Modify: `app/android/app/src/main/AndroidManifest.xml`
- Modify: `app/src/features/challenges/components/InviteButton.tsx`
- Modify: `app/.env.example`, `app/src/shared/types/env.d.ts`, `app/__mocks__/@env.js`

- [ ] **Step 1: iOS — CFBundleURLTypes**

Em `app/ios/calorIA/Info.plist`, dentro do `<dict>` raiz (após `<key>CFBundleVersion</key>...`):

```xml
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>app.caloria</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>caloria</string>
			</array>
		</dict>
	</array>
```

- [ ] **Step 2: Android — intent-filter**

Em `app/android/app/src/main/AndroidManifest.xml`, dentro de `<activity android:name=".MainActivity" ...>` (após o intent-filter MAIN/LAUNCHER):

```xml
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="caloria" />
        </intent-filter>
```

- [ ] **Step 3: InviteButton com APP_WEB_URL + deep link**

```tsx
// app/src/features/challenges/components/InviteButton.tsx
import React from 'react';
import { Share } from 'react-native';
import { APP_WEB_URL } from '@env';
import { Button } from '@shared/components/Button';

interface Props {
  inviteCode: string;
  title: string;
}

export function InviteButton({ inviteCode, title }: Props): React.JSX.Element {
  const onPress = async () => {
    // https para quem NÃO tem o app (abre o web); caloria:// para quem tem.
    const webUrl = `${APP_WEB_URL || 'https://caloria.app'}/challenge/${inviteCode}`;
    try {
      await Share.share({
        message: `Bora pro desafio "${title}" no CalorIA? Entre por aqui: ${webUrl}\nJá tem o app? caloria://challenge/${inviteCode}`,
        url: webUrl,
      });
    } catch {
      /* usuário cancelou o share */
    }
  };

  return (
    <Button variant='secondary' onPress={onPress}>
      Convidar amigos
    </Button>
  );
}
```

- [ ] **Step 4: Declarar APP_WEB_URL**

`app/src/shared/types/env.d.ts` (adicionar ao module '@env'): `export const APP_WEB_URL: string;`
`app/__mocks__/@env.js`: adicionar `APP_WEB_URL: 'https://caloria.app',`
`app/.env.example`: adicionar

```bash
# URL pública do web app (fallback dos convites p/ quem não tem o app).
# Ajuste para o domínio real do deploy (ex.: https://caloria.vercel.app).
APP_WEB_URL=https://caloria.app
```

- [ ] **Step 5: Verificar em simulador/emulador (manual, documentado no PR)**

Run (iOS): `xcrun simctl openurl booted "caloria://challenge/ABC123"`
Run (Android): `adb shell am start -a android.intent.action.VIEW -d "caloria://challenge/ABC123"`
Expected: app abre na tela de ranking do desafio (rota `challenge/:code` do linking).

- [ ] **Step 6: Jest/tsc na baseline + commit**

```bash
npx jest src/features/challenges 2>&1 | grep "Tests:"
git add app/ios/calorIA/Info.plist app/android/app/src/main/AndroidManifest.xml app/src/features/challenges/components/InviteButton.tsx app/.env.example app/src/shared/types/env.d.ts app/__mocks__/@env.js
git commit -m "feat(mobile): registra o scheme caloria:// (iOS+Android) e convite com web URL configurável + deep link"
```

---

### Task K3: ErrorBoundary global

**Files:**
- Create: `app/src/shared/components/AppErrorBoundary.tsx`
- Modify: `app/App.tsx`, `app/src/shared/components/index.ts`
- Test: `app/src/shared/components/AppErrorBoundary.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
// app/src/shared/components/AppErrorBoundary.test.tsx
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AppErrorBoundary } from './AppErrorBoundary';

function Bomb({ defused }: { defused: boolean }): React.JSX.Element {
  if (!defused) throw new Error('boom');
  return <Text>app ok</Text>;
}

describe('AppErrorBoundary', () => {
  it('filho que lança → tela de recuperação (não crash)', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <AppErrorBoundary>
        <Bomb defused={false} />
      </AppErrorBoundary>,
    );
    expect(getByText('Algo deu errado')).toBeTruthy();
  });

  it('botão tenta de novo re-renderiza o filho', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    let defused = false;
    const { getByText } = render(
      <AppErrorBoundary>
        <Bomb defused={defused} />
      </AppErrorBoundary>,
    );
    defused = true;
    fireEvent.press(getByText('Tentar novamente'));
    expect(getByText('app ok')).toBeTruthy();
  });
});
```

Run: `npx jest src/shared/components/AppErrorBoundary.test.tsx` → FAIL.

- [ ] **Step 2: Implementar**

```tsx
// app/src/shared/components/AppErrorBoundary.tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '@theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Boundary raiz: sem ele, qualquer exceção de render em produção FECHA o app
 * (mobile) sem feedback. Aqui viram uma tela de recuperação com retry.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    // Ponto único para plugar crash reporting (Sentry) no futuro.
    console.error('[AppErrorBoundary]', error, info);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>😵</Text>
        <Text style={styles.title}>Algo deu errado</Text>
        <Text style={styles.body}>
          Encontramos um erro inesperado. Seus dados estão seguros.
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={this.reset} style={styles.btn}>
          <Text style={styles.btnLabel}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.brandBackground,
    gap: spacing.md,
  },
  emoji: { fontSize: 48 },
  title: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  body: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
  },
  btnLabel: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
});
```

Exportar em `app/src/shared/components/index.ts`: `export { AppErrorBoundary } from './AppErrorBoundary';`

- [ ] **Step 3: Envolver o app**

```tsx
// app/App.tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@navigation/RootNavigator';
import { AppErrorBoundary } from '@shared/components';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider style={styles.container}>
      <AppErrorBoundary>
        <RootNavigator />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

export default App;
```

- [ ] **Step 4: Rodar testes + commit**

```bash
npx jest src/shared/components/AppErrorBoundary.test.tsx   # PASS
git add app/src/shared/components app/App.tsx
git commit -m "feat(mobile): ErrorBoundary global — crash de render vira tela de recuperação em vez de fechar o app"
```

---

### Task K4: Social login desarmado (configure + docs)

**Files:**
- Modify: `app/src/shared/services/google-signin.service.ts`
- Modify: `app/.env.example`, `app/src/shared/types/env.d.ts`, `app/__mocks__/@env.js`
- Create: `docs/mobile-social-login.md`

- [ ] **Step 1: configure() lazy no serviço**

Em `app/src/shared/services/google-signin.service.ts`, o tipo do módulo ganha `configure` e `getGoogleIdToken` passa a configurar uma única vez:

```ts
import { GOOGLE_WEB_CLIENT_ID } from '@env';

type GoogleSignInModule = {
  GoogleSignin: {
    configure: (options: { webClientId: string }) => void;
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<{ idToken?: string | null }>;
  };
};

let configured = false;

export async function getGoogleIdToken(): Promise<string> {
  const googleSignInModule = loadGoogleSignInModule();

  if (!googleSignInModule) {
    throw new Error('Google Sign-In native dependency is not installed.');
  }
  // Sem configure() a lib lança um erro interno críptico na 1ª chamada.
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('GOOGLE_WEB_CLIENT_ID ausente no .env — ver docs/mobile-social-login.md');
  }
  const { GoogleSignin } = googleSignInModule;
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }
  await GoogleSignin.hasPlayServices();
  const { idToken } = await GoogleSignin.signIn();

  if (!idToken) {
    throw new Error('Google Sign-In did not return an id token.');
  }

  return idToken;
}
```

(demais funções do arquivo permanecem; atualizar o mock `app/__mocks__/@react-native-google-signin/google-signin.js` que já possui `configure`).

- [ ] **Step 2: Declarar env**

`env.d.ts`: `export const GOOGLE_WEB_CLIENT_ID: string;` · `__mocks__/@env.js`: `GOOGLE_WEB_CLIENT_ID: ''` · `.env.example`:

```bash
# Social login (ver docs/mobile-social-login.md). Vazio = botões ocultos.
GOOGLE_WEB_CLIENT_ID=
```

- [ ] **Step 3: docs/mobile-social-login.md (checklist de ops)**

```markdown
# Social login no mobile — checklist de ativação

Hoje as libs NÃO estão instaladas: os guards escondem os botões (comportamento
correto). Para ativar:

1. `npm i @react-native-google-signin/google-signin @invertase/react-native-apple-authentication`
2. iOS: `cd ios && bundle exec pod install`
3. Google Cloud/Firebase: criar OAuth client → copiar o **Web client ID** para
   `GOOGLE_WEB_CLIENT_ID` no `.env`; baixar `google-services.json` (android/app/)
   e `GoogleService-Info.plist` (ios/calorIA/) se usar Firebase.
4. iOS: adicionar o REVERSED_CLIENT_ID como URL scheme no Info.plist.
5. Apple: habilitar a capability **Sign in with Apple** no Xcode + App ID.
6. ⚠️ App Store guideline 4.8: com login Google, o Sign in with Apple é
   OBRIGATÓRIO para aprovação.
7. Backend já pronto: POST /auth/google e /auth/apple (com ensureUsername).
```

- [ ] **Step 4: Testes + commit**

```bash
npx jest src/features/auth 2>&1 | grep "Tests:"   # baseline
git add app/src/shared/services/google-signin.service.ts app/.env.example app/src/shared/types/env.d.ts app/__mocks__/@env.js docs/mobile-social-login.md
git commit -m "feat(mobile): GoogleSignin.configure lazy com env + checklist de ativação do social login"
```

---

### Task K5: Verificação final e push

- [ ] `npx jest 2>&1 | grep "Test Suites:"` → baseline (6 pré-existentes).
- [ ] `npx tsc --noEmit` → sem erros novos.
- [ ] `npm run build:web 2>&1 | tail -1` → sucesso.
- [ ] `git push -u origin fix/mobile-alto` + PR empilhado sobre `fix/mobile-critico`.
