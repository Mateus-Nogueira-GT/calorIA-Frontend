# Pente fino — coach e scanner: plano

**Spec:** [2026-11-25-pente-fino-coach-scanner.md](../specs/2026-11-25-pente-fino-coach-scanner.md)
**Branch:** `fix/pente-fino-2` (worktree `../calorIA-pente-fino-2`). Só commits locais.

## Restrições

- TDD: o teste falha primeiro, depois vem a correção.
- Nada em `app/android` ou `app/ios`.
- Staging só de arquivos explícitos.
- Testes de app: `cd app && npx jest <arquivos>`. Testes de backend: `cd backend && npx vitest run <arquivos>`.

## Tasks

1. [x] **R1 (C1).** Teste em `scan-portion.test.ts` e em `features/scanner/store.test.ts`, com 6000 → 600 g.
   Corrigir `scaleScanPortion`.
2. [x] **R2 (C2).** Teste em `features/coach/store.actions.test.ts`, com `addMeal` pendente e troca de sessão.
   Capturar o dono, passá-lo ao `addMeal` e proteger as gravações no store.
3. [x] **R3 (C3).** Testes em `backend/src/modules/chat/action-proposals*.test.ts` para os três tipos de cartão.
   Tornar os campos cosméticos tolerantes.
4. **R4 (C5).** Teste no `store.test.ts` do scanner com duas chamadas de `confirm()`. Fazer a promise
   única, desabilitar a lista enquanto salva e cobrir isso no teste da `ScanResultScreen`.
5. **R5 (C6).** Teste: depois de `chooseAlternative`, o `confirm` sai sem dúvida no payload. Confirmar em
   `backend/src/modules/chat/chat-context.ts` qual forma o backend lê como "sem dúvida".
6. **R6 (C7).** Teste de backend: a proposta `complete_plan_meal` tem `date`. Teste de app: o tap envia
   `card.date`. Teste do rótulo do `ActionProposalCard`. Ajustar o schema compartilhado do cartão nos dois
   lados.
7. **R7 (C8).** Teste em `scanner` (vitest), com o resultado do modelo mockado: 3 alternativas, uma de
   nome vazio. Ajustar o schema de leitura.
8. **Fechamento.** Rodar `npm run typecheck && npm test` no backend e `npx tsc --noEmit && npx jest` no app.
   Fazer commit por task ou por grupo.
