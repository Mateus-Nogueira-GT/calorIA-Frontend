# Pente fino: chat e motor de créditos (plano)

**Spec:** [2026-11-25-pente-fino-chat-creditos.md](../specs/2026-11-25-pente-fino-chat-creditos.md)
**Branch:** `fix/pente-fino-6` (worktree `../calorIA-pente-fino-6`). Só commits locais.

## Restrições

- TDD: o teste falha primeiro, depois vem a correção.
- Postgres só num banco local descartável (initdb/pg_ctl numa porta livre, sob `/private/tmp/claude-501`).
  Usar o harness de `credits.integration.test.ts` / `subscriptions.integration.test.ts`.
- Não editar migrations antigas. Se precisar de uma nova, usar `030_*` (028 e 029 estão em outras branches).
- Nada em `app/android` nem em `app/ios`. Staging só de arquivos explícitos.

## Tasks

1. [x] R1 e R2: `operation-requests.ts`, `coach.service.ts` e `retryLastAction` no store do coach, com
       testes de app. Commit.
2. [ ] R3: operação de custo zero para conta ilimitada, com integração Postgres e unit. Commit.
3. [x] R4 e R5: `handleDietGeneration` persiste na liquidação e o parse fica protegido, com testes
       vitest. Commit.
4. [x] R8: `persistHistory` passa a anexar, com teste de integração Postgres e os testes unit de chat
       ajustados. Commit.
5. [ ] R6: token de sequência no voice-player, com teste. Commit.
6. [ ] R7: orçamento do banner de dieta, com teste. Commit.
7. [ ] Fechamento: no backend, `npm run typecheck && npm test` mais as integrações; no app,
       `npx tsc --noEmit && npx jest`.
