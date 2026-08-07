# Spec — Workstream L: Mobile Médio + Baixo (polimento e higiene)

**Data:** 2026-07-24
**Origem:** Debug mobile (iOS/Android) — achados 🟡 #8–#13 e 🔵 #14–#17.
**Pré-requisito:** Workstreams J e K.
**Plano de implementação:** `docs/superpowers/plans/2026-07-24-workstream-l-mobile-medio-baixo.md`

## 1. Objetivo

Fechar as degradações de lógica/UX que restam no mobile: preferências que somem, anel sem progresso, crash evitável, bateria, teclado, tab bar e as dívidas menores.

## 2. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DL1 | Persistência das preferências | Migrar `profilePreferences` do `window.localStorage` (morto no RN) para **dentro do estado persistido do zustand** (`preferencesByUser: Record<userId, prefs>` no `partialize` do auth store, via `kvStorage`) — some o acesso direto a localStorage |
| DL2 | Anel de progresso nativo | Técnica de **duas metades rotacionadas** (Views puras, sem react-native-svg): ≤50% roda a metade direita; >50% mostra a esquerda cheia + direita rodada. Mantém `conic-gradient` no web |
| DL3 | Leaderboard sem params | `route.params ?? {}` + estado vazio com `ErrorState` quando não há `challengeId` nem `code` |
| DL4 | Polling em background | `useNotificationPolling` limpa o interval quando `AppState != 'active'` e o recria ao voltar (hoje o timer roda para sempre) |
| DL5 | Teclado no AddMealModal | `KeyboardAvoidingView` (behavior `padding` no iOS) envolvendo o sheet |
| DL6 | Tab bar com 7 abas | **Remover a aba Evolução**; a tela vira rota do RootStack acessada por item de menu no Perfil (menor risco, sem redesign) |
| DL7 | Tipo do `navigate('Scanner')` | `Scanner: NavigatorScreenParams<ScannerStackParamList> | undefined` em `RootStackParamList` (corrige o erro TS pré-existente sem cast) |
| DL8 | Alert no web | Util `showAlert(title, message)` — `Alert.alert` no nativo, `window.alert` no web (onde Alert é no-op) — substituindo os usos em stores/telas de erro |
| DL9 | Keychain/Keystore para tokens | **Documentado como dívida** (`docs/mobile-hardening.md`) — trocar AsyncStorage por `react-native-keychain` exige lib nativa + migração de sessão; fora do plano |
| DL10 | Crash reporting (Sentry) | Idem DL9 — documentado, não implementado |
| DL11 | Pods iOS | Passo documentado no plano (`bundle exec pod install`) — obrigatório após o AsyncStorage |

## 3. Requisitos

### L1 — Preferências persistentes no mobile (🟡 #8)
- **L1.1** [auth/store.ts](../../../app/src/features/auth/store.ts): estado ganha `preferencesByUser: Record<string, ProfilePreferences>`; helpers `readStoredPreferencesByUser`/`writeStoredPreferencesByUser`/`canUseLocalStorage` são removidos; `mergeProfilePreferences`, `setToken`, `setPendingAuth` e `setProfilePreferences` leem/gravam o novo campo.
- **L1.2** `partialize` inclui `preferencesByUser`. Migração leve: na hidratação, se web e existir a chave legada `caloria:profile-preferences` no localStorage, importa uma vez.
- **L1.3** Testes do store cobrem: prefs sobrevivem a `clearToken` + novo `setToken` do mesmo usuário (por-usuário) e não vazam entre usuários.

### L2 — CalorieRing nativo (🟡 #9)
- **L2.1** [CalorieRing.tsx](../../../app/src/features/dashboard/components/CalorieRing.tsx): arco real no nativo via duas metades (DL2); web inalterado.
- **L2.2** Teste de render: 0%, 30%, 80%, 100% sem crash (asserts nos testIDs das metades).

### L3 — Leaderboard sem crash (🟡 #10)
- **L3.1** [ChallengeLeaderboardScreen.tsx](../../../app/src/features/challenges/screens/ChallengeLeaderboardScreen.tsx): `const { challengeId, code } = route.params ?? {}` + `ErrorState` quando ambos ausentes.

### L4 — Polling ciente de AppState (🟡 #11)
- **L4.1** [useNotificationPolling.ts](../../../app/src/features/notifications/hooks/useNotificationPolling.ts): interval criado apenas em `active`; limpo em `background`/`inactive`; refetch imediato ao reativar (comportamento atual mantido).
- **L4.2** Teste existente atualizado + caso novo: em background não há fetch periódico.

### L5 — Teclado no AddMealModal (🟡 #12)
- **L5.1** [AddMealModal.tsx](../../../app/src/features/food-log/components/AddMealModal.tsx): `KeyboardAvoidingView` conforme DL5.

### L6 — Tab bar com 6 abas (🟡 #13)
- **L6.1** [BrandTabNavigator.tsx](../../../app/src/navigation/BrandTabNavigator.tsx): remove `Tab.Screen Evolution`; [RootNavigator.tsx](../../../app/src/navigation/RootNavigator.tsx) ganha rota `Evolution` (header "Evolução"); [types.ts](../../../app/src/navigation/types.ts) move `Evolution` de `TabParamList` para `RootStackParamList`.
- **L6.2** [ProfileScreen](../../../app/src/features/profile/screens/ProfileScreen.tsx): item de menu "Evolução" navegando para a rota nova.

### L7 — Baixos (🔵 #14–#17)
- **L7.1** DL7: tipo do Scanner (remove o erro TS pré-existente de `navigate('Scanner')`).
- **L7.2** DL8: novo `app/src/shared/utils/show-alert.ts` + substituição de `Alert.alert` nos fluxos de erro de stores/telas (diet, scanner, challenges, food-log modal, friends).
- **L7.3** DL9/DL10/DL11: `docs/mobile-hardening.md` com Keychain, Sentry e o passo de pods.

## 4. Critérios de aceite

1. Mobile: escolher goal/personalidade → matar o app → reabrir: preferências continuam (AsyncStorage inspecionável).
2. Anel do dashboard mostra arco proporcional no simulador iOS/Android (30% ≈ um terço).
3. `navigate('ChallengeLeaderboard')` sem params → tela de erro amigável, não crash.
4. Com app em background (AppState simulado), zero chamadas de notificação até voltar a `active`.
5. Teclado aberto no AddMealModal (iOS) mantém o botão "Salvar refeição" visível.
6. Tab bar com 6 itens; Evolução acessível pelo Perfil.
7. `tsc` do app perde o erro do `navigate('Scanner')` (baseline de erros pré-existentes cai em 1).
8. No web, um erro de "não foi possível salvar" exibe `window.alert` (antes: silêncio).

## 5. Fora de escopo

Keychain/Keystore, Sentry (documentados em `docs/mobile-hardening.md`); redesign da tab bar; push notifications.
