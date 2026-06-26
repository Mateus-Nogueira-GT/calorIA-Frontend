# Hardening — Auditoria de Bugs (estado atual)

Branch: feat/ui-polish (Comunidade + Tracking + Polish). Suíte: 6 suítes / 11 testes falhando. `@env` já carrega (mock presente).

## Achados (classificados)
| id | área | suíte | sintoma | classe | fix |
|----|------|-------|---------|--------|-----|
| H1 | diet | MealPlanCard.test | componente renderiza "Concluida"/"Marcar como concluida" (sem acento, sem ✓); teste espera "✓ Concluída"/"Marcar como concluída" | bug de texto PT-BR | corrigir componente para "✓ Concluída"/"Marcar como concluída"; alinhar teste |
| H2 | diet | DietProgressHeader.test | mismatch de acento/encoding | bug de texto PT-BR | corrigir acentos no componente; alinhar teste |
| H3 | dashboard | DashboardScreen.test | saudação "Ola"/"Diario" sem acento + possível async | bug de texto PT-BR + act | corrigir "Olá,"/"Diário alimentar"; alinhar teste; drenar async se preciso |
| H4 | auth | OnboardingOptionCard.test | teste espera style como ArrayContaining; componente passa style mesclado (objeto) | teste desatualizado | alinhar o teste à estrutura real de style |
| H5 | auth | LoginScreen.test | Apple sign-in: setToken esperado com assinatura antiga (sem refreshToken) | teste desatualizado vs refresh token | alinhar o teste à assinatura atual |
| H6 | auth | RegisterScreen.test | provável mesma classe de H5 (fluxo social/assinatura) | teste desatualizado | alinhar o teste |

## Sementes dos ledgers (melhorias, não quebram teste) — follow-up nas tasks seguintes
- Feed onEndReached sem guarda de isLoadingMore/hasMore.
- PostCard botão de comentários sem accessibilityLabel.
- Scanner manualSeq não-determinístico entre testes.
- CameraAction (tab) navegável programaticamente sem tabPress preventDefault.
- ScannerStackScreenProps sem CompositeScreenProps.

## Responsividade web (D43) — Tasks 7-8 do plano
- ScreenContainer (maxWidth condicional web) + aplicação nas telas + breakpoints 375/768/1280.

## Status final
H1-H6 resolvidos; sementes aplicadas (+9 testes); responsividade web (ScreenContainer em 8 telas). Suíte: 58 suítes / 208 testes VERDE.
Follow-ups: warnings act flaky (setup global jest p/ Animated); useWindowDimensions p/ gráficos; remover `shell` style morto no Dashboard.
