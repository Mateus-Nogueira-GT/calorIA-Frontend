# Design — Fase 3 (estados presos e erros silenciosos)

Duas convenções transversais, decididas antes do código porque tocam sete telas. Sem
fixá-las, cada tela sairia de um jeito e a mesma revisão se repetiria em seis meses.

---

## 1. Convenção de erro e retry

### O problema

Hoje cada `load*` engole o erro e só desliga o `isLoading`. O estado resultante é
indistinguível de "carregou e veio vazio", e nenhuma tela oferece recarregar. Daí os
sintomas: esqueleto eterno na dieta, "Seja o primeiro a comentar" quando a busca falhou,
card de erro no dashboard que nunca some.

### Regra

Todo store que carrega dados de tela expõe **três** estados, nunca dois:

| Estado | Significado |
|---|---|
| `isLoading` | requisição em voo |
| `error` | a última carga **falhou** |
| dado (`plan`, `comments`, …) | resultado da última carga bem-sucedida |

- `error` é **limpo no início** de toda carga e **marcado no catch**.
- A tela renderiza, nessa ordem: `isLoading` → esqueleto; `error` → `ErrorState`
  com `onRetry`; senão → dado (que pode estar legitimamente vazio).
- `ErrorState` (`@shared/components`) já existe e recebe `onRetry` — é o componente
  único; nenhuma tela inventa o seu.

**Vazio nunca é exibido quando `error` está ligado.** Foi exatamente o que fez a tela de
comentários afirmar "seja o primeiro" sobre um post com 12 comentários.

### Alerta vs. estado de erro

- Falha ao **carregar** uma tela → estado de erro com retry (o usuário não pediu nada;
  a tela é que não tem o que mostrar).
- Falha em uma **ação** que o usuário disparou (publicar, marcar, check-in) → `showAlert`,
  porque ele precisa saber que o toque dele não teve efeito. Nunca as duas coisas.

---

## 2. Política de cache e revalidação do diário

### O problema

O único portão de fetch é `mealsByDate[data] === undefined`. Isso confunde **"temos algum
dado"** com **"carregamos aquele dia do servidor"**.

O scanner escreve com `addMeal(hoje, refeição)`. Se o carregamento do dia falhou antes, a
chave passa a existir com **um único item** — e a partir daí ninguém mais busca, porque
já não é `undefined`. As refeições anteriores do dia ficam invisíveis e o total fica
errado até o app ser reiniciado.

### Regra

Separar os dois conceitos com um segundo mapa:

```
mealsByDate[data]   → o que temos em memória (pode vir de fetch OU de escrita local)
syncedDates[data]   → true SOMENTE após uma carga completa do servidor
```

- `setMeals(data, …)` — a única entrada de carga completa — marca `syncedDates[data]`.
- `addMeal` / `removeMeal` (escritas locais, incluindo o scanner) **não marcam**.
- O portão de fetch passa a ser `!syncedDates[data]`.

Consequência desejada: depois de um scan sobre um dia nunca sincronizado, a próxima
montagem busca o dia inteiro do servidor — e a refeição escaneada volta junto, porque já
está persistida lá.

### Revalidação explícita

`pull-to-refresh` no Dashboard e no Diário força o fetch **ignorando `syncedDates`**. É o
único caminho de revalidação manual; não há invalidação por tempo. Um dia já sincronizado
não é rebuscado a cada montagem — evita o efeito oposto (refetch em loop a cada troca de
aba) que trocaria um bug por outro.

---

## 3. "Sem dieta" ≠ "dia não gerado" (M8)

`getTodayPlan` retorna `null` nos dois casos, e a UI mostra "converse com o Coach para
gerar uma dieta" para quem **tem** um plano ativo cuja geração parou no meio.

### O que NÃO fazer

O rascunho inicial deste design previa devolver `{ status: 'day_missing' }` no lugar do
`null`. **Isso quebraria o app publicado.** O cliente em produção tipa a resposta como
`DietPlan | null` e faz `plan.meals.map(...)`: receber um objeto sem `meals` seria um
crash na tela principal, não um estado degradado. Qualquer mudança em `/diets/today`
precisa manter `DietPlan | null`.

### Decisão: endpoint novo, consultado só quando `plan` é `null`

`GET /diets/today/status` responde:

```
{ hasActiveDiet: boolean, dayMissing: boolean, resumableJobId: string | null }
```

- `/diets/today` fica **intocado** — clientes antigos não percebem nada.
- O app só chama o novo endpoint quando `plan === null`, ou seja, no exato momento em que
  precisa escolher entre "você não tem dieta" e "sua dieta está incompleta".
- Com `resumableJobId`, a tela oferece **retomar a geração** em vez do vazio de
  onboarding. `getActiveJob` não serve para isso: ele só enxerga jobs `pending`/`running`,
  e o caso problemático é justamente o job que **falhou** deixando a dieta parcial.
