# calorIA Frontend — Setup Design (D1–D2)

**Data:** 2026-05-26
**Escopo:** Configuração inicial do projeto React Native — ambiente, estrutura, tooling e navegação base.
**Fora do escopo:** features de produto (scanner, food log, coach, gamificação) — cada uma terá seu próprio spec.

---

## 1. Stack Tecnológica

| Categoria | Biblioteca | Versão |
|---|---|---|
| Core | `react-native` | 0.76+ |
| Linguagem | TypeScript | 5.x |
| Web | `react-native-web` + Webpack 5 | latest |
| Navegação | React Navigation 6 (native stack + bottom tabs) | 6.x |
| Estado global | Zustand | 4.x |
| HTTP client | Axios | 1.x |
| Mocks de API | MSW (Mock Service Worker) | 2.x |
| Variáveis de ambiente | `react-native-dotenv` | latest |
| Linting | ESLint + `@typescript-eslint` + `eslint-plugin-react-native` | - |
| Formatação | Prettier | 3.x |
| Pre-commit | Husky + lint-staged | - |

**Decisões-chave:**
- React Native bare CLI (sem Expo) para controle total sobre módulos nativos.
- MSW configurado desde o início para desacoplar front-end do backend — mocks são desligados sem refactor quando o backend ficar pronto.
- TypeScript com `strict: true` desde o início para evitar acúmulo de `any`.

---

## 2. Estrutura de Pastas

```
calorIA/
├── android/
├── ios/
├── web/
│   ├── index.html
│   └── webpack.config.js
├── src/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── store.ts
│   │   ├── dashboard/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── food-log/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── scanner/
│   │   │   ├── screens/
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── coach/
│   │   │   ├── screens/
│   │   │   └── components/
│   │   └── profile/
│   │       ├── screens/
│   │       └── components/
│   ├── shared/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── food-log.service.ts
│   │   │   ├── scanner.service.ts
│   │   │   └── coach.service.ts
│   │   ├── types/
│   │   └── utils/
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── TabNavigator.tsx
│   │   └── types.ts
│   └── theme/
│       ├── colors.ts
│       ├── typography.ts
│       └── index.ts
├── mocks/
│   ├── server.ts
│   └── handlers/
│       ├── auth.ts
│       ├── food-log.ts
│       ├── scanner.ts
│       └── coach.ts
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── babel.config.js
├── tsconfig.json
└── package.json
```

**Regras de ouro:**
- Features não importam umas das outras diretamente.
- Tudo compartilhado entre features vai em `shared/`.
- Navegação vive fora das features.
- Mocks espelham a estrutura das features.

---

## 3. Navegação

### RootNavigator (Stack)
Controla o fluxo Auth vs App lendo o estado de autenticação do Zustand. Não requer redirect manual — a troca de stack é automática por estado reativo.

```
RootNavigator (Stack)
├── Auth Stack (sem token)
│   ├── WelcomeScreen
│   ├── RegisterScreen
│   └── ProfileSetupScreen
└── TabNavigator (com token)
    ├── DashboardStack → DashboardScreen
    ├── FoodLogStack   → FoodLogScreen
    ├── ScannerStack   → ScannerScreen   ← tab central (ação principal)
    ├── CoachStack     → CoachScreen
    └── ProfileStack   → ProfileScreen
```

Cada tab tem seu próprio Stack Navigator para sub-telas — o design dessas sub-rotas é responsabilidade dos specs de cada feature.

### types.ts
Define os tipos de parâmetros de todas as rotas para navegação type-safe via `useNavigation` e `useRoute`.

---

## 4. Camada de API

### Instância Axios (`shared/services/api.ts`)
- `baseURL` lida de `.env` via `react-native-dotenv`
- Interceptor de request: injeta `Authorization: Bearer <token>` do store Zustand
- Interceptor de response: trata 401 com logout automático

### Services por feature
Cada service exporta funções tipadas que encapsulam as chamadas HTTP:
```ts
// Exemplo
foodLogService.addMeal(data: AddMealPayload): Promise<Meal>
scannerService.analyzePhoto(uri: string): Promise<ScanResult>
```

### MSW (mocks de dev)
- `mocks/server.ts` inicializa o MSW e registra todos os handlers
- Ativado apenas em `__DEV__` mode
- Cada `mocks/handlers/*.ts` define respostas mock para as rotas da respectiva feature
- Para desligar um mock específico quando o endpoint backend ficar pronto: remover o handler correspondente

### `.env.example`
```
API_BASE_URL=http://localhost:8000
API_TIMEOUT=10000
```

### `.gitignore`
Entradas obrigatórias além do padrão React Native:
```
.env
.superpowers/
web/dist/
```

---

## 5. Tooling

### TypeScript (`tsconfig.json`)
- `strict: true`
- Path aliases (resolução em tempo de compilação):
  - `@features/*` → `src/features/*`
  - `@shared/*` → `src/shared/*`
  - `@navigation/*` → `src/navigation/*`
  - `@theme/*` → `src/theme/*`

### Babel (`babel.config.js`)
- `babel-plugin-module-resolver` configurado com os mesmos aliases do `tsconfig.json` — necessário para resolução em runtime (o `tsconfig` sozinho não é suficiente).

### ESLint (`.eslintrc.js`)
Três camadas:
1. `@typescript-eslint/recommended`
2. `eslint-plugin-react-native`
3. `eslint-config-prettier` (desativa conflitos com Prettier)

### Prettier (`.prettierrc`)
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

### Husky + lint-staged
Pre-commit hook nos arquivos modificados:
- `eslint --fix` em `.ts/.tsx`
- `prettier --write` em `.ts/.tsx/.json`

### Webpack para Web (`web/webpack.config.js`)
- Alias `react-native` → `react-native-web`
- Suporte a assets (imagens, fontes)
- Dev server na porta 3000
- Build de produção em `web/dist/`

### Scripts (`package.json`)
```json
"scripts": {
  "start":      "react-native start",
  "android":    "react-native run-android",
  "ios":        "react-native run-ios",
  "web":        "webpack serve --config web/webpack.config.js",
  "build:web":  "webpack --config web/webpack.config.js",
  "lint":       "eslint src --ext .ts,.tsx",
  "type-check": "tsc --noEmit",
  "test":       "jest"
}
```

---

## 6. Entregáveis ao fim do D1–D2

- [ ] Projeto scaffoldado rodando em iOS, Android e browser
- [ ] Navegação base funcionando (telas placeholder em cada tab)
- [ ] Zustand com store de auth configurado
- [ ] Camada de API com MSW retornando dados mock
- [ ] ESLint, Prettier e Husky ativos e bloqueando commits ruins
- [ ] Path aliases funcionando em todos os ambientes
- [ ] `.env.example` documentado
- [ ] Scripts `ios`, `android`, `web`, `lint`, `type-check` todos operacionais
