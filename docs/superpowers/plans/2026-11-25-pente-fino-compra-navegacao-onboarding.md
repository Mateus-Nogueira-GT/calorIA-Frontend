# Pente fino — compra, navegação, notificações, onboarding: plano

**Spec:** [2026-11-25-pente-fino-compra-navegacao-onboarding.md](../specs/2026-11-25-pente-fino-compra-navegacao-onboarding.md)
**Branch:** `fix/pente-fino-5` (worktree `../calorIA-pente-fino-5`). Só commits locais.

## Restrições

- TDD: o teste falha primeiro, depois vem a correção.
- Os testes de regressão ficam nos arquivos normais do repo, como `BuyCreditsScreen.test.tsx` e `notifications/store.test.ts`.
- Nada em `app/android` nem `app/ios`.
- Staging só com caminhos explícitos.

## Tasks

1. [ ] R1, R2, R3 e R4 na `BuyCreditsScreen`: testes primeiro (fake timers, AppState mockado, promises controladas) e depois a correção. Um commit.
2. [ ] R5: recarregar a carteira no AppState `active`. Commit.
3. [ ] R6: `initialRouteName` da Community, com teste de `getStateFromPath` e um teste de integração do tab. Commit.
4. [ ] R7: guarda de sessão nas notificações. Commit.
5. [ ] R8: `PendingOperations`, ramo de foto. Commit.
6. [ ] R9: limites únicos de corpo no backend, com teste vitest. Commit.
7. [ ] R10: idade em UTC, com teste usando fake time. Commit.
8. [ ] Fechamento: no backend, `npm run typecheck && npm test`; no app, `npx tsc --noEmit && npx jest`.
