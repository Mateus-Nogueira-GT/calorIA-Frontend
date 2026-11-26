# Pente fino, lote 8 (revisão da integrada): plano

**Spec:** [2026-11-26-pente-fino-revisao-integrada.md](../specs/2026-11-26-pente-fino-revisao-integrada.md)

Dois workers em paralelo. Cada um trabalha num worktree próprio, criado a partir de `fix/pente-fino-integrado` `bd6c46a`, e no fim tudo é mergeado de volta na integrada.

| Worker | Branch / worktree | Requisitos | Migration | Porta Postgres |
|---|---|---|---|---|
| W-A (backend) | `fix/pente-fino-8-backend` / `../calorIA-pf8-backend` | R1, R4, R6, R7 | `032_user_streak_lock.sql` | 55451 |
| W-B (app) | `fix/pente-fino-8-app` / `../calorIA-pf8-app` | R2, R3, R5 | — | — |

## Restrições

- Para cada requisito: reproduzir com um teste que falha **antes** de mexer no código.
- Se não for possível reproduzir, registrar o item como "não reproduzido" e explicar o motivo.
- Postgres só em banco local descartável.
- Nada de chamadas reais, de mudanças em `app/android`/`app/ios`, nem de push.
- Staging apenas com caminhos explícitos.
- Commits em português, com o trailer `Co-Authored-By`.

## W-A

1. [ ] R1: tratar o evento de compra de acordo com a existência da tabela, e não da flag. Testes de integração (flag desligada credita, estorno com flag desligada, sem tabela) e unitários.
2. [ ] R4: `completed_at` no dia da proposta, com os limites de data. Antes, ler `completedOnDate` no app. Testes.
3. [ ] R6: migration 032, decisão do marco travada e harness atualizado. Teste de integração com duas conexões concorrentes.
4. [ ] R7: normalizar o histórico em todos os leitores e reparar na gravação. Teste de integração conferindo o histórico inteiro.
5. [ ] Rodar typecheck, a suíte inteira e todas as integrações tocadas.

## W-B

1. [x] R2: pendências em memória isoladas por dono. Teste com duas contas.
2. [x] R3: `inputMode` entra na assinatura da pendência. Testes (voz contra texto, nos dois sentidos, e retry).
3. [x] R5: guarda de sessão nos `load()` de peso/evolução e de dieta, e nas ações do feed. Varrer os outros stores. Um teste por store corrigido.
4. [x] Rodar `tsc` e o jest completo.

## Fechamento (orquestrador)

- [ ] Mergear W-A e W-B na integrada.
- [ ] Rodar as suítes completas e todas as integrações.
- [ ] Atualizar o ledger e o roteiro de deploy (migration 032).
