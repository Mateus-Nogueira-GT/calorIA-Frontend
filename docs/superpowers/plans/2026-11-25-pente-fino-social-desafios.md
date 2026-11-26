# Pente fino — social, desafios e diário: plano

**Spec:** [2026-11-25-pente-fino-social-desafios.md](../specs/2026-11-25-pente-fino-social-desafios.md)
**Branch:** `fix/pente-fino-3` (worktree `../calorIA-pente-fino-3`). Só commits locais.

## Restrições

- TDD: o teste falha primeiro, depois vem a correção.
- Testes de Postgres só num banco local descartável (initdb/pg_ctl em porta livre sob
  `/private/tmp/claude-501`). Seguir o harness de integração já existente do módulo, se houver. Se não houver,
  criar um no padrão de `subscriptions.integration.test.ts`: guarda de localhost e nome de banco de teste.
- Não editar migrations antigas. A nova é a `029_*`, porque a 028 está reservada na branch `fix/pente-fino-1`.
- Nada em `app/android` nem em `app/ios`. O staging é feito só com arquivos explícitos.

## Tasks

1. [x] R3: guardas de data do check-in, com teste de integração e unit.
2. [x] R1: sequência efetiva na leitura (ranking, amigos, perfil, coach), com teste de integração do
       ranking e unit/integração dos demais.
3. [x] R6: `finished`/join com a data de SP, com teste de relógio controlado.
4. [x] R2: post de marco só quando a sequência sobe, mais try/catch, com teste em `diets`.
5. [x] R7: migration 029, `ON CONFLICT` e trava no app, com testes de Postgres, de backend e de app.
6. [x] R4: totais do Diário, com teste do `FoodLogScreen`/`DayMacroSummary`.
7. [ ] R5: merge do `load()` dos desafios, com teste no store.
8. [ ] R8: guarda de sessão no feed (e, se couber, nos desafios), com teste no store.
9. [ ] Fechamento: `npm run typecheck && npm test` no backend, as integrações com o banco local e
       `npx tsc --noEmit && npx jest` no app. Commits por task.
