# D2–D7: Design System, Auth, Onboarding & Coach Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar design system com Inter, telas de auth (login + cadastro + social), onboarding conversacional com o coach (7 perguntas), e tela de chat do coach — do D2 ao D7.

**Architecture:** Design system com componentes base tipados em `src/shared/components/`. Auth stack expandida com Login e ForgotPassword. Onboarding conversacional em `ProfileSetupScreen` (chat sequencial, 7 perguntas, cards de seleção). Coach como tab dedicada com Zustand store, bubbles e input fixo.

**Tech Stack:** React Native 0.76 bare CLI, TypeScript strict, Inter (TTF manual), @testing-library/react-native, Zustand, MSW 2.x, @react-native-google-signin/google-signin, @invertase/react-native-apple-authentication, react-native-bootsplash.

**Spec de referência:** `docs/superpowers/specs/2026-05-27-caloria-d2-d7-design.md`

---

## File Map

### Design System
| Ação | Arquivo |
|---|---|
| Modify | `src/theme/typography.ts` |
| Create | `react-native.config.js` |
| Create | `assets/fonts/Inter-Regular.ttf` … `Inter-ExtraBold.ttf` |
| Create | `src/shared/components/Text.tsx` |
| Create | `src/shared/components/Text.test.tsx` |
| Create | `src/shared/components/Button.tsx` |
| Create | `src/shared/components/Button.test.tsx` |
| Create | `src/shared/components/Input.tsx` |
| Create | `src/shared/components/Input.test.tsx` |
| Create | `src/shared/components/Card.tsx` |
| Create | `src/shared/components/Avatar.tsx` |
| Create | `src/shared/components/Card.test.tsx` |
| Modify | `src/shared/components/index.ts` |

### Auth
| Ação | Arquivo |
|---|---|
| Modify | `src/navigation/types.ts` |
| Modify | `src/navigation/RootNavigator.tsx` |
| Modify | `src/features/auth/screens/WelcomeScreen.tsx` |
| Modify | `src/features/auth/screens/RegisterScreen.tsx` |
| Create | `src/features/auth/screens/LoginScreen.tsx` |
| Create | `src/features/auth/screens/ForgotPasswordScreen.tsx` |
| Create | `src/features/auth/screens/LoginScreen.test.tsx` |
| Create | `src/features/auth/screens/RegisterScreen.test.tsx` |
| Modify | `src/shared/services/auth.service.ts` |
| Modify | `mocks/handlers/auth.ts` |

### Onboarding
| Ação | Arquivo |
|---|---|
| Create | `src/features/auth/components/OnboardingChatBubble.tsx` |
| Create | `src/features/auth/components/OnboardingOptionCard.tsx` |
| Create | `src/features/auth/components/OnboardingProgressBar.tsx` |
| Create | `src/features/auth/components/OnboardingOptionCard.test.tsx` |
| Modify | `src/features/auth/screens/ProfileSetupScreen.tsx` |
| Create | `src/features/auth/screens/ProfileSetupScreen.test.tsx` |

### Coach Chat
| Ação | Arquivo |
|---|---|
| Create | `src/features/coach/components/ChatBubble.tsx` |
| Create | `src/features/coach/components/ChatInput.tsx` |
| Create | `src/features/coach/components/TypingIndicator.tsx` |
| Create | `src/features/coach/components/ChatBubble.test.tsx` |
| Create | `src/features/coach/components/ChatInput.test.tsx` |
| Create | `src/features/coach/store.ts` |
| Create | `src/features/coach/store.test.ts` |
| Modify | `src/features/coach/screens/CoachScreen.tsx` |
| Modify | `src/shared/services/coach.service.ts` |
| Modify | `mocks/handlers/coach.ts` |

### Splash
| Ação | Arquivo |
|---|---|
| Native | `android/app/src/main/res/drawable/bootsplash.xml` |
| Native | `ios/caloria/AppDelegate.swift` |

---

## Task 1: Instalar @testing-library/react-native

**Files:**
- Modify: `package.json` (via npm)
- Modify: `package.json` jest config

- [ ] **Instalar a biblioteca**

```bash
npm install -D @testing-library/react-native
```

- [ ] **Verificar instalação**

```bash
npx jest --version
```
Expected: versão do jest sem erros.

- [ ] **Adicionar ao transformIgnorePatterns no package.json**

Localizar a seção `"jest"` em `package.json` e atualizar `transformIgnorePatterns`:

```json
"transformIgnorePatterns": [
  "node_modules/(?!(react-native|@react-native|@react-navigation|react-native-safe-area-context|react-native-screens|@testing-library)/)"
]
```

- [ ] **Verificar que os testes existentes ainda passam**

```bash
npx jest --passWithNoTests
```
Expected: PASS (zero falhas).

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @testing-library/react-native"
```

---

## Task 2: Inter — Instalar fonte e atualizar typography.ts

**Files:**
- Create: `assets/fonts/` (5 arquivos .ttf)
- Create: `react-native.config.js`
- Modify: `src/theme/typography.ts`

- [ ] **Criar a pasta de fontes**

```bash
mkdir -p assets/fonts
```

- [ ] **Baixar os arquivos TTF da Inter**

Acesse https://fonts.google.com/specimen/Inter e baixe a família. Ou via curl direto do repositório:

```bash
BASE="https://github.com/rsms/inter/raw/master/docs/font-files"
curl -L "$BASE/Inter-Regular.ttf"    -o assets/fonts/Inter-Regular.ttf
curl -L "$BASE/Inter-Medium.ttf"     -o assets/fonts/Inter-Medium.ttf
curl -L "$BASE/Inter-SemiBold.ttf"   -o assets/fonts/Inter-SemiBold.ttf
curl -L "$BASE/Inter-Bold.ttf"       -o assets/fonts/Inter-Bold.ttf
curl -L "$BASE/Inter-ExtraBold.ttf"  -o assets/fonts/Inter-ExtraBold.ttf
```

- [ ] **Criar `react-native.config.js`**

```js
module.exports = {
  assets: ['./assets/fonts/'],
};
```

- [ ] **Linkar as fontes nos projetos nativos**

```bash
npm install -D react-native-asset
npx react-native-asset
```

Expected: mensagens de cópia para `android/app/src/main/assets/fonts/` e `ios/`.

- [ ] **Atualizar `src/theme/typography.ts`**

```ts
export const typography = {
  fontFamily: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semiBold: 'Inter-SemiBold',
    bold: 'Inter-Bold',
    extraBold: 'Inter-ExtraBold',
  },
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 30,
    xxxl: 36,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
    extraBold: '800' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export type Typography = typeof typography;
```

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add assets/fonts/ react-native.config.js src/theme/typography.ts package.json package-lock.json
git commit -m "feat: add Inter font and update typography tokens"
```

---

## Task 3: Componente Text

**Files:**
- Create: `src/shared/components/Text.tsx`
- Create: `src/shared/components/Text.test.tsx`

- [ ] **Escrever o teste que falha**

```tsx
// src/shared/components/Text.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from './Text';

describe('Text', () => {
  it('renderiza o conteúdo passado como children', () => {
    const { getByText } = render(<Text>Olá mundo</Text>);
    expect(getByText('Olá mundo')).toBeTruthy();
  });

  it('aplica fontSize xxxl na variante heading1', () => {
    const { getByText } = render(<Text variant="heading1">Título</Text>);
    const el = getByText('Título');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 36 })]),
    );
  });

  it('aplica fontSize sm na variante caption', () => {
    const { getByText } = render(<Text variant="caption">Legenda</Text>);
    const el = getByText('Legenda');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 13 })]),
    );
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/shared/components/Text.test.tsx
```
Expected: FAIL — "Cannot find module './Text'".

- [ ] **Implementar `src/shared/components/Text.tsx`**

```tsx
import React from 'react';
import { Text as RNText, StyleSheet, TextProps } from 'react-native';
import { colors, typography } from '@theme';

type Variant = 'heading1' | 'heading2' | 'body' | 'caption' | 'label';

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
}

export function Text({ variant = 'body', color, style, ...rest }: Props): React.JSX.Element {
  return (
    <RNText
      style={[styles[variant], color ? { color } : undefined, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  heading1: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxxl,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.xxxl * typography.lineHeight.tight,
  },
  heading2: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.xl * typography.lineHeight.tight,
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.base * typography.lineHeight.normal,
  },
  caption: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/shared/components/Text.test.tsx
```
Expected: PASS — 3 testes verdes.

- [ ] **Commit**

```bash
git add src/shared/components/Text.tsx src/shared/components/Text.test.tsx
git commit -m "feat: add Text component with variants"
```

---

## Task 4: Componente Button

**Files:**
- Create: `src/shared/components/Button.tsx`
- Create: `src/shared/components/Button.test.tsx`

- [ ] **Escrever o teste que falha**

```tsx
// src/shared/components/Button.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from './Button';

describe('Button', () => {
  it('renderiza o label corretamente', () => {
    const { getByText } = render(<Button onPress={() => {}}>Salvar</Button>);
    expect(getByText('Salvar')).toBeTruthy();
  });

  it('chama onPress ao ser pressionado', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress}>Confirmar</Button>);
    fireEvent.press(getByText('Confirmar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não chama onPress quando disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress} disabled>
        Bloqueado
      </Button>,
    );
    fireEvent.press(getByText('Bloqueado'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exibe ActivityIndicator quando loading=true', () => {
    const { getByTestId } = render(
      <Button onPress={() => {}} loading testID="btn">
        Enviando
      </Button>,
    );
    expect(getByTestId('btn-loading')).toBeTruthy();
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/shared/components/Button.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/shared/components/Button.tsx`**

```tsx
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';
import { colors, typography } from '@theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends TouchableOpacityProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: string;
  testID?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  style,
  testID,
  ...rest
}: Props): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        styles[size],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      testID={testID}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          testID={testID ? `${testID}-loading` : 'btn-loading'}
          color={variant === 'primary' ? colors.white : colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelPrimary,
            variant !== 'primary' && styles.labelSecondary,
          ]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  sm: { paddingVertical: 8, paddingHorizontal: 16 },
  md: { paddingVertical: 14, paddingHorizontal: 24 },
  lg: { paddingVertical: 18, paddingHorizontal: 32 },
  disabled: { opacity: 0.5 },
  label: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.base,
  },
  labelPrimary: { color: colors.white },
  labelSecondary: { color: colors.textPrimary },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/shared/components/Button.test.tsx
```
Expected: PASS — 4 testes verdes.

- [ ] **Commit**

```bash
git add src/shared/components/Button.tsx src/shared/components/Button.test.tsx
git commit -m "feat: add Button component with variants and loading state"
```

---

## Task 5: Componente Input

**Files:**
- Create: `src/shared/components/Input.tsx`
- Create: `src/shared/components/Input.test.tsx`

- [ ] **Escrever o teste que falha**

```tsx
// src/shared/components/Input.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Input } from './Input';

describe('Input', () => {
  it('renderiza o label', () => {
    const { getByText } = render(<Input label="E-mail" />);
    expect(getByText('E-mail')).toBeTruthy();
  });

  it('exibe mensagem de erro quando error está preenchido', () => {
    const { getByText } = render(
      <Input label="Senha" error="Senha muito curta" />,
    );
    expect(getByText('Senha muito curta')).toBeTruthy();
  });

  it('não exibe mensagem de erro quando error está vazio', () => {
    const { queryByText } = render(<Input label="Nome" />);
    expect(queryByText('Campo obrigatório')).toBeNull();
  });

  it('chama onChangeText ao digitar', () => {
    const onChange = jest.fn();
    const { getByPlaceholderText } = render(
      <Input label="Nome" placeholder="Digite seu nome" onChangeText={onChange} />,
    );
    fireEvent.changeText(getByPlaceholderText('Digite seu nome'), 'João');
    expect(onChange).toHaveBeenCalledWith('João');
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/shared/components/Input.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/shared/components/Input.tsx`**

```tsx
import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, typography } from '@theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, rightIcon, style, ...rest }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text variant="label" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.container,
          focused && styles.containerFocused,
          error ? styles.containerError : undefined,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textDisabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      {error ? (
        <Text variant="caption" color={colors.error} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { marginBottom: 6 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  containerFocused: { borderColor: colors.primary },
  containerError: { borderColor: colors.error },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  icon: { paddingLeft: 8 },
  error: { marginTop: 4 },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/shared/components/Input.test.tsx
```
Expected: PASS — 4 testes verdes.

- [ ] **Commit**

```bash
git add src/shared/components/Input.tsx src/shared/components/Input.test.tsx
git commit -m "feat: add Input component with label, error and focus states"
```

---

## Task 6: Componentes Card e Avatar + exportar index

**Files:**
- Create: `src/shared/components/Card.tsx`
- Create: `src/shared/components/Avatar.tsx`
- Create: `src/shared/components/Card.test.tsx`
- Modify: `src/shared/components/index.ts`

- [ ] **Escrever o teste que falha**

```tsx
// src/shared/components/Card.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Card } from './Card';
import { Avatar } from './Avatar';

describe('Card', () => {
  it('renderiza children', () => {
    const { getByText } = render(<Card><></><Text>Conteúdo</Text></Card>);
    // Usa Text nativo para evitar dependência circular
    const { getByText: g } = render(
      <Card>
        {/* eslint-disable-next-line react-native/no-raw-text */}
        {React.createElement(require('react-native').Text, null, 'Conteúdo')}
      </Card>,
    );
    expect(g('Conteúdo')).toBeTruthy();
  });

  it('chama onPress quando tocável', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Card onPress={onPress} testID="card">
        {React.createElement(require('react-native').Text, null, 'Item')}
      </Card>,
    );
    fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Avatar', () => {
  it('renderiza emoji passado', () => {
    const { getByText } = render(<Avatar emoji="🤖" />);
    expect(getByText('🤖')).toBeTruthy();
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/shared/components/Card.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/shared/components/Card.tsx`**

```tsx
import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';
import { colors } from '@theme';

interface Props extends ViewProps {
  onPress?: () => void;
  testID?: string;
  children: React.ReactNode;
}

export function Card({ onPress, children, style, testID, ...rest }: Props): React.JSX.Element {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.85}
        testID={testID}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.card, style]} testID={testID} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});
```

- [ ] **Implementar `src/shared/components/Avatar.tsx`**

```tsx
import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors } from '@theme';

type Size = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<Size, number> = { sm: 28, md: 36, lg: 48 };
const FONT_MAP: Record<Size, number> = { sm: 14, md: 18, lg: 24 };

interface Props {
  size?: Size;
  emoji?: string;
  backgroundColor?: string;
}

export function Avatar({ size = 'md', emoji = '🤖', backgroundColor }: Props): React.JSX.Element {
  const dim = SIZE_MAP[size];
  return (
    <View
      style={[
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2 },
        { backgroundColor: backgroundColor ?? colors.primary },
      ]}
    >
      <Text style={{ fontSize: FONT_MAP[size] }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Criar `src/shared/components/index.ts`**

```ts
export { Text } from './Text';
export { Button } from './Button';
export { Input } from './Input';
export { Card } from './Card';
export { Avatar } from './Avatar';
```

- [ ] **Rodar todos os testes de componentes**

```bash
npx jest src/shared/components/
```
Expected: PASS — todos verdes.

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/shared/components/
git commit -m "feat: add Card, Avatar components and shared/components index"
```

---

## Task 7: Atualizar navegação — adicionar Login e ForgotPassword

**Files:**
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Create: `src/features/auth/screens/ForgotPasswordScreen.tsx`

- [ ] **Atualizar `src/navigation/types.ts`**

```ts
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Register: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ProfileSetup: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  FoodLog: undefined;
  Scanner: undefined;
  Coach: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
```

- [ ] **Criar `src/features/auth/screens/ForgotPasswordScreen.tsx` (placeholder)**

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@theme';
import { Text } from '@shared/components';
import type { AuthStackScreenProps } from '@navigation/types';

export function ForgotPasswordScreen(
  _props: AuthStackScreenProps<'ForgotPassword'>,
): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text variant="heading2">Recuperar senha</Text>
      <Text variant="caption">Em breve</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
```

- [ ] **Atualizar `src/navigation/RootNavigator.tsx`**

```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '@features/auth/screens/WelcomeScreen';
import { RegisterScreen } from '@features/auth/screens/RegisterScreen';
import { LoginScreen } from '@features/auth/screens/LoginScreen';
import { ForgotPasswordScreen } from '@features/auth/screens/ForgotPasswordScreen';
import { ProfileSetupScreen } from '@features/auth/screens/ProfileSetupScreen';
import { TabNavigator } from './TabNavigator';
import { useAuthStore } from '@features/auth/store';
import type { RootStackParamList, AuthStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="App" component={TabNavigator} />
        </RootStack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
```

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/navigation/types.ts src/navigation/RootNavigator.tsx src/features/auth/screens/ForgotPasswordScreen.tsx
git commit -m "feat: add Login and ForgotPassword routes to auth stack"
```

---

## Task 8: WelcomeScreen

**Files:**
- Modify: `src/features/auth/screens/WelcomeScreen.tsx`

- [ ] **Implementar `WelcomeScreen.tsx`**

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button, Text } from '@shared/components';
import type { AuthStackScreenProps } from '@navigation/types';

export function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text variant="heading1" style={styles.logo}>
          calor<Text variant="heading1" color={colors.primary}>IA</Text>
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.tagline}>
          Seu coach de nutrição com inteligência artificial
        </Text>
      </View>

      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate('Register')} size="lg" style={styles.btn}>
          Criar conta
        </Button>
        <Button
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          size="lg"
          style={styles.btn}
        >
          Já tenho conta
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 120,
    paddingBottom: 48,
  },
  hero: { alignItems: 'center', gap: 12 },
  logo: { fontSize: 48, fontFamily: typography.fontFamily.extraBold },
  tagline: { textAlign: 'center', maxWidth: 260 },
  actions: { gap: 12 },
  btn: { width: '100%' },
});
```

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/features/auth/screens/WelcomeScreen.tsx
git commit -m "feat: implement WelcomeScreen with navigation to Register and Login"
```

---

## Task 9: Atualizar AuthStore — pendingAuth para onboarding

**Files:**
- Modify: `src/features/auth/store.ts`

O RegisterScreen não pode chamar `setToken` imediatamente após o registro (isso seta `isAuthenticated: true` e o RootNavigator pula o ProfileSetup). A solução: guardar `pendingAuth` no store, e só chamar `setToken` após o onboarding completar.

- [ ] **Atualizar `src/features/auth/store.ts`**

```ts
import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  pendingAuth: { token: string; user: User } | null;
  setToken: (token: string, user: User) => void;
  setPendingAuth: (token: string, user: User) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  pendingAuth: null,
  setToken: (token, user) =>
    set({ token, user, isAuthenticated: true, pendingAuth: null }),
  setPendingAuth: (token, user) =>
    set({ pendingAuth: { token, user } }),
  clearToken: () =>
    set({ token: null, user: null, isAuthenticated: false, pendingAuth: null }),
}));
```

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/features/auth/store.ts
git commit -m "feat: add pendingAuth to AuthStore for onboarding flow"
```

---

## Task 10: Auth service — social login e profileSetup + MSW

**Files:**
- Modify: `src/shared/services/auth.service.ts`
- Modify: `mocks/handlers/auth.ts`

- [ ] **Atualizar `src/shared/services/auth.service.ts`**

```ts
import api from './api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface ProfileSetupPayload {
  name: string;
  bodyType: 'ectomorph' | 'mesomorph' | 'endomorph' | 'unknown';
  heightCm: number;
  weightKg: number;
  goal: string;
  coachPersonality: 'motivational' | 'direct' | 'empathetic' | 'scientific';
  coachGender: 'male' | 'female' | 'neutral';
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export const authService = {
  login: (data: LoginPayload) =>
    api.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  register: (data: RegisterPayload) =>
    api.post<AuthResponse>('/auth/register', data).then((r) => r.data),

  loginWithGoogle: (idToken: string) =>
    api.post<AuthResponse>('/auth/google', { idToken }).then((r) => r.data),

  loginWithApple: (identityToken: string, fullName?: string) =>
    api.post<AuthResponse>('/auth/apple', { identityToken, fullName }).then((r) => r.data),

  profileSetup: (data: ProfileSetupPayload) =>
    api.patch('/auth/profile-setup', data).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),
};
```

- [ ] **Atualizar `mocks/handlers/auth.ts`**

```ts
import { http, HttpResponse } from 'msw';

const mockUser = (name: string, email: string) => ({
  token: 'mock-jwt-token-12345',
  user: { id: 'user-1', name, email },
});

export const authHandlers = [
  http.post('*/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'erro@teste.com') {
      return HttpResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
    }
    return HttpResponse.json(mockUser('Test User', body.email));
  }),

  http.post('*/auth/register', async ({ request }) => {
    const body = await request.json() as { name: string; email: string };
    return HttpResponse.json(mockUser(body.name, body.email), { status: 201 });
  }),

  http.post('*/auth/google', () =>
    HttpResponse.json(mockUser('Google User', 'google@user.com')),
  ),

  http.post('*/auth/apple', () =>
    HttpResponse.json(mockUser('Apple User', 'apple@user.com')),
  ),

  http.patch('*/auth/profile-setup', () =>
    HttpResponse.json({ success: true }),
  ),

  http.post('*/auth/logout', () =>
    HttpResponse.json({ success: true }),
  ),
];
```

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/shared/services/auth.service.ts mocks/handlers/auth.ts
git commit -m "feat: extend auth service with social login and profileSetup"
```

---

## Task 10: RegisterScreen

**Files:**
- Modify: `src/features/auth/screens/RegisterScreen.tsx`
- Create: `src/features/auth/screens/RegisterScreen.test.tsx`

- [ ] **Instalar dependências de social login**

```bash
npm install @react-native-google-signin/google-signin
npm install @invertase/react-native-apple-authentication
```

> **Nota nativa:** Google Sign-In requer configuração de SHA-1 no Firebase Console para Android e `GoogleService-Info.plist` no iOS. Apple Sign-In requer a capability "Sign in with Apple" ativada no Xcode. Estas configurações são por ambiente e devem ser feitas antes de testar em dispositivo real — em testes jest os módulos são mockados.

- [ ] **Criar `__mocks__/@react-native-google-signin/google-signin.js`**

```bash
mkdir -p __mocks__/@react-native-google-signin
```

```js
// __mocks__/@react-native-google-signin/google-signin.js
module.exports = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ idToken: 'mock-google-token' }),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
};
```

- [ ] **Criar `__mocks__/@invertase/react-native-apple-authentication.js`**

```bash
mkdir -p "__mocks__/@invertase"
```

```js
// __mocks__/@invertase/react-native-apple-authentication.js
module.exports = {
  appleAuth: {
    performRequest: jest.fn().mockResolvedValue({ identityToken: 'mock-apple-token' }),
    Operation: { LOGIN: 'LOGIN' },
    Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
  },
};
```

- [ ] **Escrever o teste que falha**

```tsx
// src/features/auth/screens/RegisterScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RegisterScreen } from './RegisterScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    register: jest.fn().mockResolvedValue({
      token: 'tok',
      user: { id: '1', name: 'João', email: 'joao@test.com' },
    }),
  },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: { setToken: jest.Mock }) => unknown) =>
    sel({ setToken: jest.fn() }),
}));

describe('RegisterScreen', () => {
  it('renderiza os campos de nome, email e senha', () => {
    const { getByPlaceholderText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    expect(getByPlaceholderText('Seu nome completo')).toBeTruthy();
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
  });

  it('exibe erro de validação se nome tiver menos de 2 caracteres', async () => {
    const { getByPlaceholderText, getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('Seu nome completo'), 'A');
    fireEvent(getByPlaceholderText('Seu nome completo'), 'blur');
    await waitFor(() => expect(getByText('Nome deve ter no mínimo 2 caracteres')).toBeTruthy());
  });

  it('exibe erro de validação para email inválido', async () => {
    const { getByPlaceholderText, getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'nao-e-email');
    fireEvent(getByPlaceholderText('seu@email.com'), 'blur');
    await waitFor(() => expect(getByText('E-mail inválido')).toBeTruthy());
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/features/auth/screens/RegisterScreen.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/features/auth/screens/RegisterScreen.tsx`**

```tsx
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authService } from '@shared/services/auth.service';
import { useAuthStore } from '@features/auth/store';
import { Button, Input, Text } from '@shared/components';
import { colors } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function RegisterScreen({ navigation }: AuthStackScreenProps<'Register'>): React.JSX.Element {
  const setToken = useAuthStore((s) => s.setToken);
  const setPendingAuth = useAuthStore((s) => s.setPendingAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  function validateName(v: string) {
    setNameError(v.length < 2 ? 'Nome deve ter no mínimo 2 caracteres' : '');
  }
  function validateEmail(v: string) {
    setEmailError(!isValidEmail(v) ? 'E-mail inválido' : '');
  }
  function validatePassword(v: string) {
    setPasswordError(v.length < 8 ? 'Senha deve ter no mínimo 8 caracteres' : '');
  }

  const isFormValid =
    name.length >= 2 && isValidEmail(email) && password.length >= 8;

  async function handleRegister() {
    setLoading(true);
    try {
      const res = await authService.register({ name, email, password });
      // Usa setPendingAuth em vez de setToken — evita que isAuthenticated=true
      // salte o ProfileSetup. setToken só é chamado após o onboarding completar.
      setPendingAuth(res.token, res.user);
      navigation.navigate('ProfileSetup');
    } catch {
      Alert.alert('Erro', 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const { idToken } = await GoogleSignin.signIn();
      const res = await authService.loginWithGoogle(idToken ?? '');
      setPendingAuth(res.token, res.user);
      navigation.navigate('ProfileSetup');
    } catch {
      Alert.alert('Erro', 'Login com Google falhou.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="heading2" style={styles.title}>Criar conta</Text>

      <Input
        label="Nome completo"
        placeholder="Seu nome completo"
        value={name}
        onChangeText={setName}
        onBlur={() => validateName(name)}
        error={nameError}
        autoCapitalize="words"
      />
      <Input
        label="E-mail"
        placeholder="seu@email.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => validateEmail(email)}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input
        label="Senha"
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChangeText={setPassword}
        onBlur={() => validatePassword(password)}
        error={passwordError}
        secureTextEntry
      />

      <Button
        onPress={handleRegister}
        loading={loading}
        disabled={!isFormValid}
        size="lg"
        style={styles.btn}
      >
        Criar conta
      </Button>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text variant="caption" style={styles.orText}>ou</Text>
        <View style={styles.line} />
      </View>

      <Button variant="secondary" onPress={handleGoogle} size="lg" style={styles.btn}>
        Continuar com Google
      </Button>

      {Platform.OS === 'ios' && (
        <Button variant="secondary" onPress={() => {}} size="lg" style={styles.btn}>
          Continuar com Apple
        </Button>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.footer}>
        <Text variant="caption">
          Já tem conta?{' '}
          <Text variant="caption" color={colors.primary}>
            Entrar
          </Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, backgroundColor: colors.background, flexGrow: 1 },
  title: { marginBottom: 32 },
  btn: { marginBottom: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textDisabled },
  footer: { alignItems: 'center', marginTop: 24 },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/features/auth/screens/RegisterScreen.test.tsx
```
Expected: PASS.

- [ ] **Commit**

```bash
git add src/features/auth/screens/RegisterScreen.tsx src/features/auth/screens/RegisterScreen.test.tsx __mocks__/
git commit -m "feat: implement RegisterScreen with validation and social login"
```

---

## Task 11: LoginScreen

**Files:**
- Create: `src/features/auth/screens/LoginScreen.tsx`
- Create: `src/features/auth/screens/LoginScreen.test.tsx`

- [ ] **Escrever o teste que falha**

```tsx
// src/features/auth/screens/LoginScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    login: jest.fn().mockResolvedValue({
      token: 'tok',
      user: { id: '1', name: 'João', email: 'joao@test.com' },
    }),
  },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: { setToken: jest.Mock }) => unknown) =>
    sel({ setToken: jest.fn() }),
}));

describe('LoginScreen', () => {
  it('renderiza os campos de email e senha', () => {
    const { getByPlaceholderText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Sua senha')).toBeTruthy();
  });

  it('exibe link de recuperar senha', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    expect(getByText('Esqueci minha senha')).toBeTruthy();
  });

  it('navega para ForgotPassword ao clicar no link', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    fireEvent.press(getByText('Esqueci minha senha'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/features/auth/screens/LoginScreen.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/features/auth/screens/LoginScreen.tsx`**

```tsx
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authService } from '@shared/services/auth.service';
import { useAuthStore } from '@features/auth/store';
import { Button, Input, Text } from '@shared/components';
import { colors } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LoginScreen({ navigation }: AuthStackScreenProps<'Login'>): React.JSX.Element {
  const setToken = useAuthStore((s) => s.setToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  function validateEmail(v: string) {
    setEmailError(!isValidEmail(v) ? 'E-mail inválido' : '');
  }
  function validatePassword(v: string) {
    setPasswordError(v.length < 8 ? 'Senha deve ter no mínimo 8 caracteres' : '');
  }

  const isFormValid = isValidEmail(email) && password.length >= 8;

  async function handleLogin() {
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      setToken(res.token, res.user);
    } catch {
      Alert.alert('Erro', 'Credenciais inválidas. Verifique e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const { idToken } = await GoogleSignin.signIn();
      const res = await authService.loginWithGoogle(idToken ?? '');
      setToken(res.token, res.user);
    } catch {
      Alert.alert('Erro', 'Login com Google falhou.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="heading2" style={styles.title}>Entrar</Text>

      <Input
        label="E-mail"
        placeholder="seu@email.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => validateEmail(email)}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Input
        label="Senha"
        placeholder="Sua senha"
        value={password}
        onChangeText={setPassword}
        onBlur={() => validatePassword(password)}
        error={passwordError}
        secureTextEntry
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.forgotLink}
      >
        <Text variant="caption" color={colors.primary}>Esqueci minha senha</Text>
      </TouchableOpacity>

      <Button
        onPress={handleLogin}
        loading={loading}
        disabled={!isFormValid}
        size="lg"
        style={styles.btn}
      >
        Entrar
      </Button>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text variant="caption" style={styles.orText}>ou</Text>
        <View style={styles.line} />
      </View>

      <Button variant="secondary" onPress={handleGoogle} size="lg" style={styles.btn}>
        Continuar com Google
      </Button>

      {Platform.OS === 'ios' && (
        <Button variant="secondary" onPress={() => {}} size="lg" style={styles.btn}>
          Continuar com Apple
        </Button>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.footer}>
        <Text variant="caption">
          Não tem conta?{' '}
          <Text variant="caption" color={colors.primary}>
            Criar conta
          </Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, backgroundColor: colors.background, flexGrow: 1 },
  title: { marginBottom: 32 },
  forgotLink: { alignSelf: 'flex-end', marginBottom: 24, marginTop: -8 },
  btn: { marginBottom: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textDisabled },
  footer: { alignItems: 'center', marginTop: 24 },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/features/auth/screens/LoginScreen.test.tsx
```
Expected: PASS.

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/features/auth/screens/LoginScreen.tsx src/features/auth/screens/LoginScreen.test.tsx
git commit -m "feat: implement LoginScreen with validation, social login and forgot password link"
```

---

## Task 12: Componentes de onboarding

**Files:**
- Create: `src/features/auth/components/OnboardingChatBubble.tsx`
- Create: `src/features/auth/components/OnboardingOptionCard.tsx`
- Create: `src/features/auth/components/OnboardingProgressBar.tsx`
- Create: `src/features/auth/components/OnboardingOptionCard.test.tsx`

- [ ] **Escrever o teste que falha**

```tsx
// src/features/auth/components/OnboardingOptionCard.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingOptionCard } from './OnboardingOptionCard';

describe('OnboardingOptionCard', () => {
  it('renderiza o título e a descrição', () => {
    const { getByText } = render(
      <OnboardingOptionCard
        emoji="💪"
        title="Mesomorfo"
        description="Corpo atlético"
        selected={false}
        onPress={() => {}}
      />,
    );
    expect(getByText('Mesomorfo')).toBeTruthy();
    expect(getByText('Corpo atlético')).toBeTruthy();
  });

  it('chama onPress ao ser pressionado', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <OnboardingOptionCard
        emoji="💪"
        title="Mesomorfo"
        description="Corpo atlético"
        selected={false}
        onPress={onPress}
      />,
    );
    fireEvent.press(getByText('Mesomorfo'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('aplica borda primary quando selected=true', () => {
    const { getByTestId } = render(
      <OnboardingOptionCard
        emoji="💪"
        title="Mesomorfo"
        description="Corpo atlético"
        selected={true}
        onPress={() => {}}
        testID="card"
      />,
    );
    const el = getByTestId('card');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: '#3DDC84' })]),
    );
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/features/auth/components/OnboardingOptionCard.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/features/auth/components/OnboardingOptionCard.tsx`**

```tsx
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  emoji: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

export function OnboardingOptionCard({
  emoji,
  title,
  description,
  selected,
  onPress,
  testID,
}: Props): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.selected]}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
    >
      <View style={styles.content}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.text}>
          <Text variant="body" style={styles.title}>{title}</Text>
          <Text variant="caption">{description}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    backgroundColor: colors.white,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDF4',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 22 },
  text: { flex: 1 },
  title: { fontFamily: typography.fontFamily.semiBold },
});
```

- [ ] **Implementar `src/features/auth/components/OnboardingChatBubble.tsx`**

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

interface Props {
  message: string;
  role: 'coach' | 'user';
}

export function OnboardingChatBubble({ message, role }: Props): React.JSX.Element {
  if (role === 'coach') {
    return (
      <View style={styles.coachRow}>
        <Avatar size="sm" emoji="🤖" />
        <View style={styles.coachBubble}>
          <Text variant="body">{message}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text variant="body" color={colors.white}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coachRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 12 },
  coachBubble: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 12,
    maxWidth: '80%',
  },
  userRow: { alignItems: 'flex-end', marginBottom: 12 },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
    maxWidth: '80%',
  },
});
```

- [ ] **Implementar `src/features/auth/components/OnboardingProgressBar.tsx`**

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';

interface Props {
  current: number;
  total: number;
}

export function OnboardingProgressBar({ current, total }: Props): React.JSX.Element {
  const progress = current / total;
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="caption">Configurando seu perfil</Text>
        <Text variant="caption" color={colors.primary}>{current} / {total}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
  fill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/features/auth/components/OnboardingOptionCard.test.tsx
```
Expected: PASS.

- [ ] **Commit**

```bash
git add src/features/auth/components/
git commit -m "feat: add OnboardingChatBubble, OnboardingOptionCard, OnboardingProgressBar"
```

---

## Task 13: ProfileSetupScreen — onboarding conversacional

**Files:**
- Modify: `src/features/auth/screens/ProfileSetupScreen.tsx`
- Create: `src/features/auth/screens/ProfileSetupScreen.test.tsx`

- [ ] **Escrever o teste que falha**

```tsx
// src/features/auth/screens/ProfileSetupScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileSetupScreen } from './ProfileSetupScreen';

jest.mock('@shared/services/auth.service', () => ({
  authService: { profileSetup: jest.fn().mockResolvedValue({ success: true }) },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: {
    setToken: jest.Mock;
    pendingAuth: { token: string; user: { id: string; name: string; email: string } };
    user: { id: string; name: string; email: string };
  }) => unknown) =>
    sel({
      setToken: jest.fn(),
      pendingAuth: { token: 'tok', user: { id: '1', name: 'João', email: 'j@t.com' } },
      user: { id: '1', name: 'João', email: 'j@t.com' },
    }),
}));

describe('ProfileSetupScreen', () => {
  it('exibe a primeira pergunta do coach ao montar', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText(/como você gostaria de ser chamado/i)).toBeTruthy();
  });

  it('exibe o progress bar iniciando em 1/7', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText('1 / 7')).toBeTruthy();
  });

  it('avança para a segunda pergunta após responder a primeira via input', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    const input = getByPlaceholderText('Digite aqui...');
    fireEvent.changeText(input, 'João');
    fireEvent.press(getByTestId('send-btn'));
    await waitFor(() => expect(getByText('2 / 7')).toBeTruthy());
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/features/auth/screens/ProfileSetupScreen.test.tsx
```
Expected: FAIL.

- [ ] **Implementar `src/features/auth/screens/ProfileSetupScreen.tsx`**

```tsx
import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { authService, ProfileSetupPayload } from '@shared/services/auth.service';
import { useAuthStore } from '@features/auth/store';
import { Text } from '@shared/components';
import { OnboardingChatBubble } from '../components/OnboardingChatBubble';
import { OnboardingOptionCard } from '../components/OnboardingOptionCard';
import { OnboardingProgressBar } from '../components/OnboardingProgressBar';
import { colors, typography } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

type Step = 'name' | 'bodyType' | 'height' | 'weight' | 'goal' | 'personality' | 'gender';

const STEPS: Step[] = ['name', 'bodyType', 'height', 'weight', 'goal', 'personality', 'gender'];

const QUESTIONS: Record<Step, string> = {
  name: 'Como você gostaria de ser chamado?',
  bodyType: 'Qual é o seu biotipo?',
  height: 'Qual é a sua altura? (cm)',
  weight: 'Qual é o seu peso atual? (kg)',
  goal: 'Qual é o seu objetivo principal?',
  personality: 'Como você prefere que seu coach seja?',
  gender: 'Qual o gênero do seu mentor?',
};

type OptionDef = { value: string; emoji: string; title: string; description: string };

const OPTIONS: Partial<Record<Step, OptionDef[]>> = {
  bodyType: [
    { value: 'ectomorph', emoji: '🦴', title: 'Ectomorfo', description: 'Metabolismo rápido, difícil ganhar massa' },
    { value: 'mesomorph', emoji: '💪', title: 'Mesomorfo', description: 'Corpo atlético, ganha e perde peso com facilidade' },
    { value: 'endomorph', emoji: '🏋️', title: 'Endomorfo', description: 'Tende a acumular gordura, metabolismo mais lento' },
    { value: 'unknown', emoji: '❓', title: 'Não sei', description: 'Deixe a IA identificar pelo seu perfil' },
  ],
  goal: [
    { value: 'lose_weight', emoji: '📉', title: 'Perder peso', description: 'Reduzir gordura corporal com saúde' },
    { value: 'gain_muscle', emoji: '📈', title: 'Ganhar massa', description: 'Aumentar músculo e força' },
    { value: 'maintain', emoji: '⚖️', title: 'Manter peso', description: 'Estabilizar o peso atual' },
    { value: 'health', emoji: '🌱', title: 'Melhorar saúde', description: 'Alimentação equilibrada e bem-estar' },
  ],
  personality: [
    { value: 'motivational', emoji: '🔥', title: 'Motivador', description: 'Energia e incentivo constante' },
    { value: 'direct', emoji: '🎯', title: 'Direto', description: 'Respostas objetivas sem rodeios' },
    { value: 'empathetic', emoji: '🤝', title: 'Empático', description: 'Compreensivo e acolhedor' },
    { value: 'scientific', emoji: '🔬', title: 'Científico', description: 'Baseado em evidências e dados' },
  ],
  gender: [
    { value: 'male', emoji: '👨', title: 'Masculino', description: '' },
    { value: 'female', emoji: '👩', title: 'Feminino', description: '' },
    { value: 'neutral', emoji: '🧑', title: 'Neutro', description: 'Sem gênero definido' },
  ],
};

interface ChatMessage {
  id: string;
  role: 'coach' | 'user';
  text: string;
}

export function ProfileSetupScreen({ navigation }: AuthStackScreenProps<'ProfileSetup'>): React.JSX.Element {
  const setToken = useAuthStore((s) => s.setToken);
  const pendingAuth = useAuthStore((s) => s.pendingAuth);
  const user = useAuthStore((s) => s.user);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'coach', text: QUESTIONS.name },
  ]);
  const [inputText, setInputText] = useState('');
  const [answers, setAnswers] = useState<Partial<Record<Step, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<FlatList>(null);

  const currentStep = STEPS[currentStepIndex];
  const hasOptions = !!OPTIONS[currentStep];

  function advanceWithAnswer(value: string) {
    const step = STEPS[currentStepIndex];
    const newAnswers = { ...answers, [step]: value };
    setAnswers(newAnswers);

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: `user-${step}`, role: 'user', text: value },
    ];

    if (currentStepIndex < STEPS.length - 1) {
      const nextStep = STEPS[currentStepIndex + 1];
      nextMessages.push({ id: `coach-${nextStep}`, role: 'coach', text: QUESTIONS[nextStep] });
      setMessages(nextMessages);
      setCurrentStepIndex((i) => i + 1);
      setInputText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } else {
      setMessages(nextMessages);
      submitProfile(newAnswers);
    }
  }

  async function submitProfile(finalAnswers: Partial<Record<Step, string>>) {
    setSubmitting(true);
    try {
      const payload: ProfileSetupPayload = {
        name: finalAnswers.name ?? user?.name ?? '',
        bodyType: (finalAnswers.bodyType as ProfileSetupPayload['bodyType']) ?? 'unknown',
        heightCm: Number(finalAnswers.height ?? 0),
        weightKg: Number(finalAnswers.weight ?? 0),
        goal: finalAnswers.goal ?? '',
        coachPersonality: (finalAnswers.personality as ProfileSetupPayload['coachPersonality']) ?? 'motivational',
        coachGender: (finalAnswers.gender as ProfileSetupPayload['coachGender']) ?? 'neutral',
      };
      await authService.profileSetup(payload);
      // Agora sim seta isAuthenticated=true — RootNavigator muda para App stack
      if (pendingAuth) {
        setToken(pendingAuth.token, pendingAuth.user);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSend() {
    if (!inputText.trim()) return;
    advanceWithAnswer(inputText.trim());
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <OnboardingProgressBar current={currentStepIndex + 1} total={STEPS.length} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <OnboardingChatBubble message={item.text} role={item.role} />
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {hasOptions && !submitting && (
        <View style={styles.options}>
          {OPTIONS[currentStep]!.map((opt) => (
            <OnboardingOptionCard
              key={opt.value}
              emoji={opt.emoji}
              title={opt.title}
              description={opt.description}
              selected={answers[currentStep] === opt.value}
              onPress={() => advanceWithAnswer(opt.value)}
            />
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Digite aqui..."
          placeholderTextColor={colors.textDisabled}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!submitting}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || submitting) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || submitting}
          testID="send-btn"
        >
          <Text color={colors.white}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  chatContent: { padding: 16 },
  options: { paddingHorizontal: 16, paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/features/auth/screens/ProfileSetupScreen.test.tsx
```
Expected: PASS.

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Commit**

```bash
git add src/features/auth/screens/ProfileSetupScreen.tsx src/features/auth/screens/ProfileSetupScreen.test.tsx
git commit -m "feat: implement conversational onboarding in ProfileSetupScreen"
```

---

## Task 14: Componentes do Coach Chat

**Files:**
- Create: `src/features/coach/components/ChatBubble.tsx`
- Create: `src/features/coach/components/ChatInput.tsx`
- Create: `src/features/coach/components/TypingIndicator.tsx`
- Create: `src/features/coach/components/ChatBubble.test.tsx`
- Create: `src/features/coach/components/ChatInput.test.tsx`

- [ ] **Escrever os testes que falham**

```tsx
// src/features/coach/components/ChatBubble.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('renderiza a mensagem do coach', () => {
    const { getByText } = render(
      <ChatBubble message="Olá, como posso ajudar?" role="coach" timestamp={new Date()} />,
    );
    expect(getByText('Olá, como posso ajudar?')).toBeTruthy();
  });

  it('renderiza a mensagem do usuário', () => {
    const { getByText } = render(
      <ChatBubble message="Quero emagrecer" role="user" timestamp={new Date()} />,
    );
    expect(getByText('Quero emagrecer')).toBeTruthy();
  });
});
```

```tsx
// src/features/coach/components/ChatInput.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  it('chama onSend com o texto ao pressionar enviar', () => {
    const onSend = jest.fn();
    const { getByPlaceholderText, getByTestId } = render(
      <ChatInput onSend={onSend} disabled={false} />,
    );
    fireEvent.changeText(getByPlaceholderText('Pergunte ao coach...'), 'Olá');
    fireEvent.press(getByTestId('chat-send-btn'));
    expect(onSend).toHaveBeenCalledWith('Olá');
  });

  it('não chama onSend quando o input está vazio', () => {
    const onSend = jest.fn();
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    fireEvent.press(getByTestId('chat-send-btn'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Rodar para confirmar que falham**

```bash
npx jest src/features/coach/components/
```
Expected: FAIL.

- [ ] **Implementar `src/features/coach/components/ChatBubble.tsx`**

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

interface Props {
  message: string;
  role: 'coach' | 'user';
  timestamp: Date;
}

export function ChatBubble({ message, role, timestamp }: Props): React.JSX.Element {
  const time = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (role === 'coach') {
    return (
      <View style={styles.coachRow}>
        <Avatar size="sm" emoji="🤖" />
        <View style={styles.coachWrap}>
          <View style={styles.coachBubble}>
            <Text variant="body">{message}</Text>
          </View>
          <Text variant="caption" style={styles.time}>{time}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.userRow}>
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text variant="body" color={colors.white}>{message}</Text>
        </View>
        <Text variant="caption" style={[styles.time, styles.timeRight]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coachRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 16 },
  coachWrap: { flex: 1, maxWidth: '80%' },
  coachBubble: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 12,
  },
  userRow: { alignItems: 'flex-end', marginBottom: 16 },
  userWrap: { maxWidth: '80%', alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
  },
  time: { marginTop: 4, color: colors.textDisabled },
  timeRight: { alignSelf: 'flex-end' },
});
```

- [ ] **Implementar `src/features/coach/components/ChatInput.tsx`**

```tsx
import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props): React.JSX.Element {
  const [text, setText] = useState('');

  function handleSend() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Pergunte ao coach..."
        placeholderTextColor={colors.textDisabled}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSend}
        returnKeyType="send"
        multiline
        maxLength={500}
        editable={!disabled}
      />
      <TouchableOpacity
        style={[styles.sendBtn, (!text.trim() || disabled) && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
        testID="chat-send-btn"
      >
        <Text color={colors.white}>↑</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});
```

- [ ] **Implementar `src/features/coach/components/TypingIndicator.tsx`**

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Avatar } from '@shared/components';
import { colors } from '@theme';

function Dot({ delay }: { delay: number }): React.JSX.Element {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    bounce.start();
    return () => bounce.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[styles.dot, { transform: [{ translateY: anim }] }]}
    />
  );
}

export function TypingIndicator(): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Avatar size="sm" emoji="🤖" />
      <View style={styles.bubble}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 16 },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.textDisabled,
  },
});
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/features/coach/components/
```
Expected: PASS.

- [ ] **Commit**

```bash
git add src/features/coach/components/
git commit -m "feat: add ChatBubble, ChatInput and TypingIndicator components"
```

---

## Task 15: CoachStore (Zustand)

**Files:**
- Create: `src/features/coach/store.ts`
- Create: `src/features/coach/store.test.ts`
- Modify: `src/shared/services/coach.service.ts`
- Modify: `mocks/handlers/coach.ts`

- [ ] **Atualizar `mocks/handlers/coach.ts`**

```ts
import { http, HttpResponse } from 'msw';

const mockHistory = [
  {
    id: 'msg-1',
    role: 'coach' as const,
    content: 'Olá! Sou o seu coach de nutrição. Como posso ajudar você hoje?',
    timestamp: new Date().toISOString(),
  },
];

export const coachHandlers = [
  http.get('*/coach/history', () => HttpResponse.json(mockHistory)),

  http.post('*/coach/message', async ({ request }) => {
    const body = await request.json() as { content: string };
    return HttpResponse.json({
      id: `msg-${Date.now()}`,
      role: 'coach',
      content: `Entendido! Você disse: "${body.content}". Vou analisar e te dar uma resposta personalizada.`,
      timestamp: new Date().toISOString(),
    });
  }),
];
```

- [ ] **Atualizar `src/shared/services/coach.service.ts`**

```ts
import api from './api';

export interface CoachMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
}

export const coachService = {
  getHistory: () =>
    api.get<CoachMessage[]>('/coach/history').then((r) => r.data),

  sendMessage: (content: string) =>
    api.post<CoachMessage>('/coach/message', { content }).then((r) => r.data),
};
```

- [ ] **Escrever o teste que falha**

```ts
// src/features/coach/store.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { useCoachStore } from './store';

jest.mock('@shared/services/coach.service', () => ({
  coachService: {
    getHistory: jest.fn().mockResolvedValue([
      { id: '1', role: 'coach', content: 'Olá!', timestamp: '2026-01-01T00:00:00Z' },
    ]),
    sendMessage: jest.fn().mockResolvedValue({
      id: '2', role: 'coach', content: 'Resposta do coach', timestamp: '2026-01-01T00:00:01Z',
    }),
  },
}));

describe('useCoachStore', () => {
  beforeEach(() => useCoachStore.setState({ messages: [], isLoading: false }));

  it('carrega o histórico corretamente', async () => {
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.loadHistory());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Olá!');
  });

  it('adiciona mensagem do usuário otimisticamente e depois a resposta do coach', async () => {
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Quero emagrecer'));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[1].role).toBe('coach');
  });

  it('isLoading é false após envio concluído', async () => {
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Teste'));
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Rodar para confirmar que falha**

```bash
npx jest src/features/coach/store.test.ts
```
Expected: FAIL.

- [ ] **Implementar `src/features/coach/store.ts`**

```ts
import { create } from 'zustand';
import { coachService, CoachMessage } from '@shared/services/coach.service';

interface StoreMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: Date;
}

interface CoachState {
  messages: StoreMessage[];
  isLoading: boolean;
  loadHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
}

function toStoreMessage(m: CoachMessage): StoreMessage {
  return { ...m, timestamp: new Date(m.timestamp) };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  messages: [],
  isLoading: false,

  loadHistory: async () => {
    const history = await coachService.getHistory();
    set({ messages: history.map(toStoreMessage) });
  },

  sendMessage: async (content: string) => {
    const userMsg: StoreMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    set({ messages: [...get().messages, userMsg], isLoading: true });
    try {
      const response = await coachService.sendMessage(content);
      set((s) => ({
        messages: [...s.messages, toStoreMessage(response)],
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },
}));
```

- [ ] **Rodar para confirmar que passa**

```bash
npx jest src/features/coach/store.test.ts
```
Expected: PASS — 3 testes verdes.

- [ ] **Commit**

```bash
git add src/features/coach/store.ts src/features/coach/store.test.ts src/shared/services/coach.service.ts mocks/handlers/coach.ts
git commit -m "feat: add CoachStore with loadHistory and sendMessage"
```

---

## Task 16: CoachScreen

**Files:**
- Modify: `src/features/coach/screens/CoachScreen.tsx`

- [ ] **Implementar `src/features/coach/screens/CoachScreen.tsx`**

```tsx
import React, { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useCoachStore } from '../store';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInput } from '../components/ChatInput';
import { TypingIndicator } from '../components/TypingIndicator';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';
import { useAuthStore } from '@features/auth/store';

export function CoachScreen(): React.JSX.Element {
  const { messages, isLoading, loadHistory, sendMessage } = useCoachStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar size="md" emoji="🤖" />
        <View>
          <Text variant="heading2">Coach IA</Text>
          <Text variant="caption" color={colors.primary}>● online</Text>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <ChatBubble
            message={item.content}
            role={item.role}
            timestamp={item.timestamp}
          />
        )}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
        onContentSizeChange={() => {}}
      />

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  chatContent: { padding: 16, paddingBottom: 8 },
});
```

- [ ] **Verificar tipos**

```bash
npx tsc --noEmit
```
Expected: sem erros.

- [ ] **Rodar todos os testes**

```bash
npx jest
```
Expected: PASS — todos verdes, sem regressões.

- [ ] **Commit**

```bash
git add src/features/coach/screens/CoachScreen.tsx
git commit -m "feat: implement CoachScreen with chat bubbles, typing indicator and input"
```

---

## Task 17: Splash Screen

**Files:**
- Native: iOS e Android

- [ ] **Instalar react-native-bootsplash**

```bash
npm install react-native-bootsplash
```

- [ ] **Gerar os assets de splash**

```bash
npx react-native generate-bootsplash assets/splash-logo.png \
  --background-color=#FFFFFF \
  --logo-width=120 \
  --platforms=android,ios
```

> **Pré-requisito:** criar `assets/splash-logo.png` — imagem do logo "calorIA" em fundo transparente, mínimo 300×300px.

Expected: geração de arquivos em `android/app/src/main/res/` e `ios/`.

- [ ] **Adicionar hide do splash no App.tsx**

Localizar onde o app inicializa (provavelmente `App.tsx` ou `index.js`) e adicionar:

```tsx
import RNBootSplash from 'react-native-bootsplash';
import { useEffect } from 'react';

// Dentro do componente raiz:
useEffect(() => {
  RNBootSplash.hide({ fade: true });
}, []);
```

- [ ] **iOS — linkar nativo**

```bash
cd ios && pod install && cd ..
```

- [ ] **Testar splash em iOS**

```bash
npx react-native run-ios
```
Expected: splash aparece, some com fade, app carrega normalmente.

- [ ] **Testar splash em Android**

```bash
npx react-native run-android
```
Expected: splash aparece, some com fade, app carrega normalmente.

- [ ] **Commit**

```bash
git add ios/ android/ App.tsx package.json package-lock.json
git commit -m "feat: add splash screen with react-native-bootsplash"
```

---

## Checklist Final

- [ ] `npx jest` — todos os testes passando
- [ ] `npx tsc --noEmit` — sem erros de tipo
- [ ] `npm run lint` — sem erros de linting
- [ ] Fluxo completo: splash → welcome → cadastro → onboarding (7 perguntas) → app
- [ ] Fluxo completo: welcome → login → app
- [ ] CoachScreen: histórico carrega, mensagens enviadas aparecem, typing indicator funciona
- [ ] Social login: botões visíveis, mocks retornam token corretamente
