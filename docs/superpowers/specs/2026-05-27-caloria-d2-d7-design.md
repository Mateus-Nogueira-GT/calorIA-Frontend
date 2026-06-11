# calorIA Frontend — Design System, Auth, Onboarding & Coach Chat (D2–D7)

**Data:** 2026-05-27
**Escopo:** Design system, splash, onboarding conversacional, telas de auth (cadastro + login) e componente de chat do coach.
**Fora do escopo:** Dashboard, food log, scanner, gamificação — cada um terá seu próprio spec.
**Depende de:** `2026-05-26-caloria-frontend-setup-design.md` (estrutura de pastas, navegação base, MSW, Zustand auth store)

---

## 1. Design System — D2–D3

### 1.1 Direção Visual

Estilo **Clean & Fresh**: fundo branco, cartões com elevação sutil (`box-shadow`), espaçamento generoso, dados no centro. Visual de app de saúde premium — sem ornamentos, sem gradientes pesados.

### 1.2 Cores

O arquivo `src/theme/colors.ts` já está correto e não precisa de alteração. Referência:

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#3DDC84` | CTAs, progresso, ícones ativos |
| `primaryDark` | `#2DB36A` | Estado pressed do primary |
| `secondary` | `#FF8C42` | Macros de carboidrato, destaques |
| `background` | `#FFFFFF` | Fundo de telas |
| `surface` | `#F8F9FA` | Fundo de cartões, inputs |
| `textPrimary` | `#1A1A2E` | Títulos e body text |
| `textSecondary` | `#6C757D` | Labels, subtítulos |
| `textDisabled` | `#ADB5BD` | Placeholders |
| `border` | `#E9ECEF` | Bordas de cards e inputs |
| `error` | `#DC3545` | Erros de validação |

### 1.3 Tipografia

Substituir `fontFamily: undefined` por **Inter**. Por ser um projeto bare React Native CLI (sem Expo), a abordagem correta é empacotar os arquivos `.ttf` diretamente:

1. Baixar Inter Regular, Medium, SemiBold, Bold e ExtraBold de [rsms.me/inter](https://rsms.me/inter/)
2. Colocar em `assets/fonts/`
3. Declarar em `react-native.config.js`:
   ```js
   module.exports = { assets: ['./assets/fonts/'] };
   ```
4. Rodar `npx react-native-asset` para linkar automaticamente nos projetos iOS e Android

```ts
// src/theme/typography.ts — atualização
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
```

**Configuração nativa:** declarar as fontes em `android/app/src/main/assets/fonts/` e via `Info.plist` no iOS. Registrar em `babel.config.js` se usar `expo-font` ou equivalente.

### 1.4 Componentes Base

Localização: `src/shared/components/`. Cada componente recebe props tipadas e lê direto de `@theme`.

#### `Text`
Wrapper sobre `RN.Text`. Props: `variant` (`heading1`|`heading2`|`body`|`caption`|`label`), `color` (token de `colors`), `weight`.

```ts
// Mapeamento de variantes → fontSize + fontFamily
heading1: { fontSize: xxxl, fontFamily: bold }
heading2: { fontSize: xl,  fontFamily: bold }
body:     { fontSize: base, fontFamily: regular }
caption:  { fontSize: sm,  fontFamily: regular, color: textSecondary }
label:    { fontSize: xs,  fontFamily: medium,  textTransform: 'uppercase', letterSpacing: 1 }
```

#### `Button`
Props: `variant` (`primary`|`secondary`|`ghost`), `size` (`sm`|`md`|`lg`), `onPress`, `loading`, `disabled`, `leftIcon`.

| Variant | Background | Text color | Border |
|---|---|---|---|
| `primary` | `primary` | `white` | — |
| `secondary` | `surface` | `textPrimary` | `border` |
| `ghost` | transparent | `primary` | — |

Estado `loading`: substitui label por `ActivityIndicator`. Estado `disabled`: opacidade 0.5.

#### `Input`
Props: `label`, `placeholder`, `error`, `secureTextEntry`, `leftIcon`, `rightIcon`, além de todas as props de `TextInput`.

- Fundo `surface`, borda `border` (1px), `border-radius: 12px`
- Foco: borda muda para `primary`
- Erro: borda `error` + label de erro abaixo em `caption`

#### `Card`
Props: `children`, `style`, `onPress` (opcional — torna o card tocável).

- `background: white`, `border-radius: 16px`, `shadow` leve (`elevation: 2` Android / `shadowOpacity: 0.06` iOS), padding padrão `16px`.

#### `Avatar`
Props: `size` (`sm`|`md`|`lg`), `emoji` ou `uri`, `backgroundColor`.
Usado no header do chat do coach.

### 1.5 Entregáveis do Design System

- [ ] `Inter` carregando corretamente em iOS, Android e web
- [ ] `typography.ts` atualizado com fontFamily
- [ ] `Text`, `Button`, `Input`, `Card`, `Avatar` criados em `src/shared/components/`
- [ ] Todos os componentes exportados em `src/shared/components/index.ts`

---

## 2. Splash + Onboarding — D3–D4

### 2.1 Splash Screen

Tela nativa configurada via `react-native-splash-screen` (ou equivalente da plataforma).

- Fundo: `#FFFFFF`
- Conteúdo: logo `calorIA` centralizado em `textPrimary` + `primary` para o "IA", fonte Inter ExtraBold, tamanho `xxxl`
- Duração: exibida até o JS bundle terminar de carregar — sem `setTimeout` artificial
- Ao fechar: transição para `RootNavigator` (que decide Auth vs App por estado Zustand)

### 2.2 Onboarding Conversacional

**Contexto:** ocorre uma única vez, imediatamente após o cadastro, antes de entrar no app. O `ProfileSetupScreen` existente na Auth Stack é a tela que implementa este fluxo.

**UX:** o coach faz as perguntas uma a uma no formato chat. O usuário responde via cards de seleção (múltipla escolha) ou input de texto (valores abertos). Ao responder, a pergunta seguinte aparece com animação de entrada (fade + slide up). Não é possível avançar sem responder.

#### Estrutura da tela

```
┌─────────────────────────────┐
│  Configurando seu perfil 3/7 │  ← label + barra de progresso
│  ████████░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────┤
│                             │
│  🤖  [Bolha do coach]       │  ← pergunta atual
│                             │
│      [Cards de resposta]    │  ← aparecem abaixo da bolha
│                             │
│  (histórico das anteriores) │  ← scroll para cima
│                             │
├─────────────────────────────┤
│  [ Input de texto... ]  [↑] │  ← alternativa às opções
└─────────────────────────────┘
```

#### As 7 perguntas

| # | Pergunta | Tipo de resposta |
|---|---|---|
| 1 | "Como você gostaria de ser chamado?" | Input de texto livre |
| 2 | "Qual é o seu biotipo?" | Cards (Ectomorfo / Mesomorfo / Endomorfo / Não sei) |
| 3 | "Qual é a sua altura?" | Input numérico (cm) |
| 4 | "Qual é o seu peso atual?" | Input numérico (kg) |
| 5 | "Qual é o seu objetivo principal?" | Cards (Perder peso / Ganhar massa / Manter peso / Melhorar saúde) + input livre. Se a resposta for vaga, o coach faz uma pergunta de acompanhamento antes de avançar. |
| 6 | "Como você prefere que seu coach seja?" | Cards (Motivador / Direto / Empático / Científico) |
| 7 | "Qual o gênero do seu mentor?" | Cards (Masculino / Feminino / Neutro) |

#### Cards de resposta

Cada card tem: ícone (emoji), título em `body` bold, descrição em `caption`. Borda `border` inativa → borda `primary` + fundo `#F0FDF4` quando selecionado. Toque confirma e avança automaticamente (sem botão "Próximo" separado).

#### Fluxo de objetivo vago

Se o usuário digitar algo como "quero ficar em forma" ou "emagrecer um pouco", o coach responde com uma pergunta de clarificação (ex: "Você tem uma meta de peso em mente? Ou é mais sobre saúde e bem-estar?"). Após a clarificação, avança para a pergunta 6. A lógica de detecção de resposta vaga é feita no backend — o frontend apenas exibe a resposta do coach como uma bolha normal e aguarda nova entrada.

#### Ao completar

Os dados coletados são enviados para `PATCH /auth/profile-setup` via `auth.service.ts`. Em caso de sucesso, o Zustand auth store é atualizado com o perfil do usuário e o `RootNavigator` redireciona para o `TabNavigator`.

### 2.3 Entregáveis do Splash + Onboarding

- [ ] Splash nativa configurada em iOS e Android com logo centralizado
- [ ] `ProfileSetupScreen` implementado com o fluxo conversacional de 7 perguntas
- [ ] Componente `OnboardingChatBubble` (coach + usuário) em `src/features/auth/components/`
- [ ] Componente `OnboardingOptionCard` em `src/features/auth/components/`
- [ ] Barra de progresso e label `X / 7`
- [ ] Animação de entrada nas novas perguntas (fade + slide)
- [ ] Mock MSW para `PATCH /auth/profile-setup` retornando sucesso
- [ ] Não é possível re-acessar o onboarding após completar (flag no store)

---

## 3. Telas de Auth — D4–D5

### 3.1 Fluxo de Navegação

```
Auth Stack
├── WelcomeScreen      → link para Register e Login
├── RegisterScreen     → vai para ProfileSetupScreen
├── LoginScreen        → vai para TabNavigator  ← NOVA TELA (adicionar ao AuthStackParamList)
└── ProfileSetupScreen → vai para TabNavigator
```

`WelcomeScreen` é o ponto de entrada do Auth Stack. Exibe o logo, um CTA primário "Criar conta" e um link "Já tenho conta → Entrar".

### 3.2 Tela de Cadastro (`RegisterScreen`)

**Campos:**
- Nome completo (`TextInput`, tipo `default`)
- Email (`TextInput`, tipo `email-address`, `autoCapitalize: none`)
- Senha (`TextInput`, `secureTextEntry`, com toggle de visibilidade)

**Validações (em tempo real, ao sair do campo):**
- Nome: obrigatório, mínimo 2 caracteres
- Email: formato válido
- Senha: mínimo 8 caracteres

**CTA primário:** botão `Button` variant `primary` full-width "Criar conta" — desabilitado até todos os campos válidos. Em loading enquanto aguarda resposta da API.

**Social login:**
- Botão Google: ícone + "Continuar com Google"
- Botão Apple: ícone + "Continuar com Apple" (visível apenas em iOS)
- Ambos usam variant `secondary`, dispostos abaixo do formulário com separador "ou"

**Erro de API:** toast ou banner no topo com a mensagem de erro (ex: "Este e-mail já está cadastrado").

**Rodapé:** "Já tem conta? Entrar" → navega para `LoginScreen`.

### 3.3 Tela de Login (`LoginScreen`)

**Campos:**
- Email (`TextInput`, tipo `email-address`, `autoCapitalize: none`)
- Senha (`TextInput`, `secureTextEntry`, com toggle de visibilidade)

**Validações:** mesmas do cadastro para email e senha.

**Link "Esqueci minha senha":** abaixo do campo senha, alinhado à direita. Navega para `ForgotPasswordScreen` (placeholder — fora do escopo deste spec, mas a rota deve existir em `AuthStackParamList`).

**CTA primário:** "Entrar" — desabilitado até campos válidos, loading durante chamada.

**Social login:** mesmos botões do cadastro (Google + Apple).

**Rodapé:** "Não tem conta? Criar conta" → navega para `RegisterScreen`.

### 3.4 Integração com API

```ts
// auth.service.ts — funções a implementar
authService.register(data: RegisterPayload): Promise<AuthResponse>
authService.login(data: LoginPayload): Promise<AuthResponse>
authService.loginWithGoogle(token: string): Promise<AuthResponse>
authService.loginWithApple(credential: AppleCredential): Promise<AuthResponse>
```

`AuthResponse`: `{ token: string, user: User }`. Ao receber, chamar `useAuthStore.setToken(token, user)`.

**Mocks MSW:**
- `POST /auth/register` → `201 { token, user }`
- `POST /auth/login` → `200 { token, user }` / `401 { message: 'Credenciais inválidas' }`
- `POST /auth/google` → `200 { token, user }`
- `POST /auth/apple` → `200 { token, user }`

### 3.5 Atualização do `AuthStackParamList`

```ts
export type AuthStackParamList = {
  Welcome: undefined;
  Register: undefined;
  Login: undefined;          // ← adicionar
  ProfileSetup: undefined;
  ForgotPassword: undefined; // ← adicionar (placeholder)
};
```

### 3.6 Entregáveis das Telas de Auth

- [ ] `WelcomeScreen` com logo, CTA "Criar conta" e link "Entrar"
- [ ] `RegisterScreen` com formulário completo + validação + social login
- [ ] `LoginScreen` com formulário + validação + social login + "Esqueci minha senha"
- [ ] `ForgotPasswordScreen` placeholder (apenas layout, sem funcionalidade)
- [ ] `AuthStackParamList` atualizado com `Login` e `ForgotPassword`
- [ ] `auth.service.ts` implementado com `register`, `login`, `loginWithGoogle`, `loginWithApple`
- [ ] Mocks MSW para todos os endpoints de auth
- [ ] Fluxo completo testável: cadastro → onboarding → app; login → app

---

## 4. Coach Chat — D5–D7

### 4.1 Visão Geral

O coach vive na tab **Coach** do `TabNavigator` como uma tela de chat dedicada. É a interface principal de interação com a IA após o onboarding. Reutiliza o visual definido no onboarding (bolhas, input), mas em tela cheia com histórico persistente.

### 4.2 Layout da `CoachScreen`

```
┌──────────────────────────────┐
│  [Avatar] Coach [Nome]  ●    │  ← header fixo (nome definido no onboarding)
├──────────────────────────────┤
│                              │
│  🤖  [Bolha do coach]        │
│                              │
│              [Bolha usuário] │
│                              │
│  🤖  [Bolha do coach]        │
│                              │  ← scroll infinito (histórico)
├──────────────────────────────┤
│  [ Pergunte ao coach... ] [↑]│  ← input fixo na base
└──────────────────────────────┘
```

### 4.3 Componentes

#### `ChatBubble`
Localização: `src/features/coach/components/ChatBubble.tsx`

Props: `message: string`, `role: 'coach' | 'user'`, `timestamp: Date`.

- **Coach:** fundo `surface` (`#F8F9FA`), borda-radius `4px 16px 16px 16px`, texto `textPrimary`. Avatar do coach à esquerda.
- **Usuário:** fundo `primary` (`#3DDC84`), borda-radius `16px 4px 16px 16px`, texto `white`. Sem avatar.
- Timestamp exibido abaixo da bolha em `caption`, `textDisabled`.

#### `ChatInput`
Localização: `src/features/coach/components/ChatInput.tsx`

Props: `onSend: (text: string) => void`, `disabled: boolean`.

- `TextInput` multiline (máximo 4 linhas antes de scrollar internamente)
- Botão de envio: círculo `primary` com ícone de seta. Desabilitado se input vazio ou `disabled=true`
- Durante resposta do coach: input desabilitado + indicador de digitação (3 pontos animados) na área do chat

#### `TypingIndicator`
3 pontos animados (bounce sequencial) dentro de uma bolha do coach. Exibido enquanto aguarda resposta da API.

### 4.4 Estado e Dados

Store do coach: `src/features/coach/store.ts` (Zustand)

```ts
interface Message {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: Date;
}

interface CoachState {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  loadHistory: () => Promise<void>;
}
```

`sendMessage`:
1. Adiciona a mensagem do usuário ao array `messages` imediatamente (otimista)
2. Seta `isLoading: true`
3. Chama `coach.service.ts → POST /coach/message`
4. Adiciona resposta do coach ao array
5. Seta `isLoading: false`

Histórico: carregado via `GET /coach/history` no mount da `CoachScreen`.

### 4.5 Mocks MSW

```ts
// mocks/handlers/coach.ts
POST /coach/message → { id, role: 'coach', content: '...', timestamp }
GET  /coach/history → { messages: Message[] }
```

A resposta mock do coach deve ser contextual (ex: responder sobre calorias, dar dicas). Usar respostas hardcoded variadas para simular conversa real durante desenvolvimento.

### 4.6 Entregáveis do Coach Chat

- [ ] `CoachScreen` com header, lista de mensagens scrollável e input fixo
- [ ] `ChatBubble` com estilos para `coach` e `user`
- [ ] `ChatInput` com multiline e botão de envio
- [ ] `TypingIndicator` animado
- [ ] `src/features/coach/store.ts` com Zustand
- [ ] `coach.service.ts` com `sendMessage` e `loadHistory`
- [ ] Mocks MSW para `/coach/message` e `/coach/history`
- [ ] Histórico persiste durante a sessão (limpa ao reiniciar app — persistência entre sessões é fora do escopo)

---

## 5. Resumo de Entregáveis por Dia

| Dia | Entregável |
|---|---|
| D2 | Inter instalada e carregando; `typography.ts` atualizado |
| D2–D3 | Componentes base: `Text`, `Button`, `Input`, `Card`, `Avatar` |
| D3 | Splash nativa configurada em iOS e Android |
| D3–D4 | `ProfileSetupScreen` com fluxo conversacional completo (7 perguntas) |
| D4 | `WelcomeScreen` finalizada; `RegisterScreen` com formulário + social login |
| D5 | `LoginScreen` com formulário + social login; `AuthStackParamList` atualizado |
| D5–D6 | `CoachScreen` com `ChatBubble`, `ChatInput`, `TypingIndicator` |
| D6–D7 | `CoachStore`, `coach.service.ts`, mocks MSW do coach |

## 6. Dependências entre Itens

```
Design System
    └── Auth Screens (usa Button, Input, Text)
    └── Onboarding (usa OnboardingOptionCard, bolhas de chat)
    └── Coach Chat (usa ChatBubble, ChatInput, Avatar)

Auth Screens (Register)
    └── Onboarding (ocorre após cadastro)

Onboarding
    └── Coach Chat (reutiliza visual de bolhas, nomeado pelo onboarding)
```
