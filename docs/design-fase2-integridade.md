# Design — Fase 2 (integridade de dados)

Decisões de contrato antes do código, para os itens da Fase 2 onde errar o desenho
custa caro. B4 e o botão do check-in são correções diretas e não precisam de design.

---

## B1 — Toggle da refeição do plano por data

### O problema de modelagem

Existem **duas verdades** sobre "refeição concluída" e elas divergem:

| Fonte | O que é | Onde |
|---|---|---|
| `diet_meals.is_completed` | booleano cru, sem data | escrito pelo toggle |
| `completedToday` | derivado: `completed_at` cai no dia local? | lido pela UI (`getTodayPlan`) |

O plano é cíclico (`day_number`), então a mesma linha volta a ser exibida quando o dia
da semana se repete. `is_completed` fica `true` de uma conclusão antiga enquanto
`completedToday` mostra `false` — e o toggle `NOT is_completed` inverte a verdade errada.

### Decisão: `completed_at` é a única fonte de verdade

`is_completed` passa a ser **derivado** de `completed_at`, nunca invertido diretamente.

Novo estado, calculado no servidor a partir da data local do cliente:

```
concluída_na_data  :=  completed_at IS NOT NULL
                       AND (completed_at em hora local do cliente)::date = data_local

marcar   → completed_at = NOW(),  is_completed = true      (quando NÃO concluída_na_data)
desmarcar→ completed_at = NULL,   is_completed = false     (quando concluída_na_data)
```

Em SQL, a conversão para hora local espelha exatamente o helper `completedOnDate` do
backend (`local = UTC + tzOffsetMinutes`, BRT = -180):

```sql
(completed_at AT TIME ZONE 'UTC' + make_interval(mins => :tz))::date = :data_local
```

### Por que continua uma única instrução

O toggle já era atômico (comentário `B10` no código) para impedir double-toggle em toques
rápidos. Mantemos isso com um CTE que calcula `concluída_na_data` e faz o `UPDATE` na
mesma instrução — nada de select-then-update.

### Contrato da API

`PATCH /diets/meals/:mealId/toggle` passa a aceitar `tzOffsetMinutes` no body, ao lado do
`date` que já existia. **É obrigatório para a correção funcionar**: sem o fuso, o servidor
compara em UTC e o dia "vira" às 21h no horário de Brasília — exatamente o bug que o
`getTodayPlan` já evita ao receber `tzOffsetMinutes` na query.

A resposta continua `{ is_completed: boolean }`, mas o significado fica **preciso**: "está
concluída na data local enviada". É o que o app já atribui a `completedToday`, então o
cliente não muda de forma — só passa a receber a verdade.

Compatibilidade: sem `tzOffsetMinutes` no body, o default é `0` (UTC), que é o
comportamento de hoje. Clientes antigos não quebram.

### O que NÃO muda

O streak continua sendo disparado só ao **marcar** (`newState === true`), com a data local.
Com a correção, o primeiro toque passa a marcar de verdade — hoje ele desmarcava e não
contava streak nenhum.

---

## M6 — Uma única regra de soma de calorias

### O problema

Duas telas somam coisas diferentes e comparam com a **mesma meta**:

| Tela | Consumido | Meta |
|---|---|---|
| Dashboard | refeições do plano concluídas hoje **+** diário livre | `plan.totalCalories` |
| Diário | **só** diário livre | `plan.totalCalories` |

Com dieta ativa, o Dashboard diz "2000 / 2000" e o Diário diz "200 / 2000" no mesmo dia.

### Decisão: a regra do Dashboard é a correta, e vira função compartilhada

O que a pessoa comeu é plano-concluído + avulso. Extraímos para `shared/utils/calories.ts`:

```ts
getDayTotals({ planMeals, freeMeals })  // → { calories, protein, carbs, fat }
```

O Diário passa a usar a mesma função **quando o dia selecionado é hoje**.

### A borda: dias anteriores

O `plan` em memória é só o **dia de hoje** — `completedToday` não diz nada sobre terça
passada, e não guardamos histórico de plano por data. Então, para um dia anterior, o Diário
soma apenas o diário livre (é o único dado real que existe para aquele dia).

Consequência assumida: a meta exibida em dias anteriores continua sendo a meta do plano
atual, por falta de meta histórica. É impreciso, mas é uma referência do objetivo do
usuário — inventar uma meta retroativa seria pior. Fica registrado como limitação
conhecida; resolver de verdade exige persistir a meta por dia, o que é mudança de escopo.
