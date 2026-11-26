# Pente fino: cartões do coach e dúvida do scanner

Data: 25/11/2026. Base: `origin/main` `4b6d53d` (PR #104). Branch: `fix/pente-fino-2`.
Origem: auditoria do loop de pente fino. Ledger em `docs/qa/pente-fino-ledger.md`, na branch `fix/pente-fino-1`.
Os achados C1, C2, C4 e C5 foram reproduzidos com testes descartáveis. Os demais foram confirmados lendo o código.
Plano: [2026-11-25-pente-fino-coach-scanner.md](../plans/2026-11-25-pente-fino-coach-scanner.md).

## Requisitos

### R1. C1: porção acima de 5 kg escala os nutrientes ao ser corrigida (alta)

`app/src/shared/utils/scan-portion.ts` `scaleScanPortion`. Hoje, se o peso de origem do item for maior que
5.000 g, a função só troca o peso e mantém os nutrientes. Isso salva 600 g com as kcal de 6 kg.

Correção: o teto de 5.000 g vale só para o peso **novo**. O peso de origem precisa ser apenas positivo e finito.

**Aceite:** um item com `weightGrams: 6000` e 2230 kcal, corrigido para 600 g, passa a ter cerca de 223 kcal,
tanto em `scaleScanPortion` quanto no `updateItem` do store.

### R2. C2: cartão "Adicionar ao Diário" não grava na conta seguinte (média)

`app/src/features/coach/store.ts` `runAction`/`applyAction`. A correção segue o padrão do D01 no scanner
(`captureSessionOwner`/`isCurrentOwner` de `app/src/shared/services/session-owner.ts`):

- capturar o dono antes da chamada;
- passar o dono ao `foodLogService.addMeal(data, owner)`;
- depois do `await`, se o dono mudou, não mexer em `useFoodLogStore`, `useWeightStore` nem no status do
  cartão. O mesmo vale para os recarregamentos de peso e de plano.

**Aceite:** com `addMeal` pendente, troca de sessão e depois resolução, `mealsByDate` fica vazio e o status
do cartão não muda.

### R3. C3: campo cosmético fora do limite não derruba o cartão (média)

`backend/src/modules/chat/action-proposals.ts`. Nos cartões de refeição, peso e refeição do plano:

- `name` com mais de 120 caracteres é cortado;
- `message_to_user` inválido, por tamanho ou tipo, é descartado.

A proposta só falha por número, tipo de refeição, data ou referência inválidos.

**Aceite:** `name` de 121 caracteres e `message_to_user` de 401 caracteres geram proposta válida nos três tipos.

### R4. C5: `confirm()` do scanner não roda duas vezes ao mesmo tempo (baixa)

`app/src/features/scanner/store.ts`. Uma segunda chamada de `confirm()` enquanto a primeira está em
andamento devolve a mesma promise, em vez de repetir os POSTs.

A lista de revisão (`ScanResultList` ou a tela) fica desabilitada enquanto salva. Assim, um chip tocado
durante o salvamento não se perde.

**Aceite:** duas chamadas no mesmo tick fazem `addMeal` uma vez por item.

### R5. C6: dúvida resolvida pelo usuário não vai como dúvida (baixa)

Se o usuário escolheu uma alternativa ou editou os valores do item, o `confirm` não envia `scan` com a
confiança baixa e as alternativas. Isso segue a spec S3 de 05/11: revisão do usuário resolve a dúvida.

**Aceite:** depois de `chooseAlternative('p1', 0)` e `confirm`, o payload sai sem `scan` ou com `scan`
sem dúvida (confiança 1, sem alternativas). Ver no código qual das duas formas o backend interpreta como
"sem dúvida".

### R6. C7: "Marcar como feita" marca o dia da proposta (baixa)

O cartão `complete_plan_meal` passa a carregar a `date` da proposta, que o backend já tem em `context.date`.
O app envia essa data em vez de `todayString()`. O rótulo do `ActionProposalCard` mostra "ontem" só quando
a data é de fato ontem e, nos outros casos, mostra a data.

**Aceite:** um cartão proposto na segunda e tocado na terça marca segunda.

### R7. C8: alternativas fora do formato não derrubam a análise (baixa/média)

`backend/src/modules/scanner/scanner.schemas.ts`. No schema de **leitura**, alternativas acima de 2 são
cortadas e alternativas com nome vazio ou inválido são descartadas, em vez de rejeitar o resultado inteiro.
O schema enviado ao modelo como structured output não muda.

**Aceite:** com o resultado mockado com 3 alternativas, uma delas de nome vazio, a análise devolve 200 com
as válidas, até 2.

## Fora de escopo (suspeito, não corrigido)

- **C4.** Repetir o cartão de refeição depois de uma resposta perdida grava a refeição duas vezes. A correção
  pede chave de idempotência no `POST /food-log`, que é uma mudança de contrato da API, e fica para uma spec
  própria.
- Referência `[plano xxxxxx]` com colchetes em `proposeCompletePlanMeal`. É improvável acontecer.

## Limites

Tudo é JS/TS, sem mudança nativa: o app sai por OTA. Nenhuma chamada real à IA.
