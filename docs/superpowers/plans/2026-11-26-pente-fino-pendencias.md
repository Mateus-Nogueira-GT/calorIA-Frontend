# Pente fino — pendências (lote 7): plano

**Spec:** [2026-11-26-pente-fino-pendencias.md](../specs/2026-11-26-pente-fino-pendencias.md)

Três workers trabalham em paralelo. Cada um tem um worktree próprio, criado a partir de `fix/pente-fino-integrado`. Ao final, as três branches são mergeadas de volta na integrada.

| Worker | Branch / worktree | Requisitos | Migrations |
|---|---|---|---|
| W1 | `fix/pente-fino-7-auth`, em `../calorIA-pf7-auth` | R1, R2, R3 | nenhuma |
| W2 | `fix/pente-fino-7-pagamentos`, em `../calorIA-pf7-pag` | R4, R5 | `032_*`, só se for inevitável |
| W3 | `fix/pente-fino-7-dados`, em `../calorIA-pf7-dados` | R6, R7, R8, R9 | `030_*` e `031_*` |

## Restrições comuns

- TDD: o teste falha primeiro, depois vem a correção.
- Postgres só num banco local descartável. Cada worker usa a sua porta: W1 55441, W2 55442, W3 55443.
- Não editar migrations antigas.
- Toda migration nova precisa ser registrada nos harnesses de integração que carregam a lista de migrations.
- Sem chamadas reais ao Supabase, ao Asaas ou à IA.
- Nada em `app/android` nem `app/ios`.
- Staging só por caminhos explícitos.
- Commits em português, com o trailer `Co-Authored-By`.
- Sem push.

## W1

1. [ ] Ler o ramo de login social e mapear todos os caminhos de cadastro que esperam sessão. Registrar o resultado no relatório.
2. [ ] R1, backend: flag, `createUser`/resend, resposta em união e rota de reenvio. Testes com a flag desligada e ligada.
3. [ ] R1, app: estado "Confirme seu e-mail" em cada caminho mapeado. Testes.
4. [ ] R2: ler como o app obtém o token, depois implementar os modos `log`/`enforce` e o signOut das outras sessões. Testes.
5. [ ] R3: hook de JWT antes do rate limit e as exceções `/auth/*`. Testes.
6. [ ] Rodar typecheck e as suítes dos dois pacotes.

## W2

1. [ ] R4, client: separar erro ambíguo de definitivo e criar os métodos de busca por `externalReference`. Testes.
2. [ ] R4, recarga: reconciliação no checkout seguinte. Testes de integração.
3. [ ] R4, assinatura: reconciliação que substitui a regra do lote 1, mais o webhook de assinatura órfã. Testes de integração e unit.
4. [ ] R5: ler a visibilidade no app, depois fazer a carteira real com a recarga ligada. Testes.
5. [ ] Rodar typecheck, as suítes e as integrações de subscriptions/credits.

## W3

1. [x] R6: migration 030, rota com chave opcional e chave do cartão no app. Testes de integração e de app.
2. [x] R7: migration 031, com fechamento dos jobs duplicados, mais o `23505` no service. Testes de integração.
3. [x] R8: summary com as refeições do plano. Teste.
4. [x] R9: `23505` no pedido de amizade vira 409. Teste.
5. [ ] Rodar typecheck, as suítes e as integrações tocadas.

## Fechamento (orquestrador)

- [ ] Mergear W1, W2 e W3 na `fix/pente-fino-integrado`.
- [ ] Rodar as suítes completas e todas as integrações.
- [ ] Atualizar o ledger.
