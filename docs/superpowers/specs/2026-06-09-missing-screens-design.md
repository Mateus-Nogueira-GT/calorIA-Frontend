# Design: Implementação das Telas Faltantes — calorIA

**Data:** 2026-06-09
**Status:** Aprovado

---

## Escopo

Implementar as 4 telas placeholder e subir o app no localhost (porta 3000 via Webpack/React Native Web).

Telas: Dashboard, FoodLog, Scanner, Profile.

---

## Dashboard

**Layout:** Anel de progresso SVG + macros coloridos (escolha B).

### Componentes
- `DashboardScreen` — tela principal
- `CalorieRing` — anel SVG com % de calorias consumidas e número grande ao lado
- `MacroCard` — card individual por macro (proteína, carbs, gordura) com barra de progresso colorida
- `MealListItem` — item de refeição na lista do dia

### Dados
- Refeições do dia: `foodLogService.getMeals(dataHoje)` via `useFoodLog` hook
- Meta calórica: `user` do auth store (campo `calorieGoal`, fallback 2000 kcal)
- Macros: somados das refeições do dia

### Layout
```
[ Saudação + data ]
[ CalorieRing ]  [ nome | kcal/meta ]
[ MacroCard Prot. ] [ MacroCard Carbs ] [ MacroCard Gord. ]
[ "Refeições de hoje" ]
[ MealListItem x N ]
```

### Cores por macro
- Proteína: #FF8C42
- Carboidratos: #17A2B8
- Gordura: #FFC107

---

## FoodLog

**Layout:** Filtro por data + macros do dia + lista agrupada por refeição (escolha C).

### Componentes
- `FoodLogScreen` — tela principal
- `DateChip` — chip clicável de data (Hoje, Ontem, DD Mon)
- `DayMacroSummary` — totais de kcal + macros do dia selecionado
- `MealSection` — seção agrupada (Café da manhã, Almoço, Jantar, Lanche)
- `FoodLogItem` — item de refeição com swipe-to-delete
- `AddMealModal` — modal com campos: nome, kcal, proteína, carbs, gordura + botão salvar

### Store — `features/food-log/store.ts`
```ts
interface FoodLogState {
  mealsByDate: Record<string, Meal[]>   // chave: 'YYYY-MM-DD'
  selectedDate: string
  isLoading: boolean
  setSelectedDate: (date: string) => void
  setMeals: (date: string, meals: Meal[]) => void
  addMeal: (date: string, meal: Meal) => void
  removeMeal: (date: string, id: string) => void
}
```

### Hook — `features/food-log/hooks/useFoodLog.ts`
- Ao montar ou trocar `selectedDate`: chama `foodLogService.getMeals(date)` e popula store
- `handleAddMeal(data)`: chama `foodLogService.addMeal(data)` e atualiza store
- `handleDeleteMeal(id)`: chama `foodLogService.deleteMeal(id)` e atualiza store

### Agrupamento de refeições
Inferido pelo horário (`loggedAt`):
- Café da manhã: 05:00–10:59
- Almoço: 11:00–14:59
- Lanche: 15:00–17:59
- Jantar: 18:00–23:59 (e demais horários)

### Chips de data
Gera 7 chips: hoje + 6 dias anteriores. Selecionado tem fundo `colors.primary`.

---

## Scanner

**Layout:** Área de câmera/upload + resultado inline abaixo (escolha A).

### Componentes
- `ScannerScreen` — tela principal
- `ScannerViewfinder` — na web: botão de upload de foto com ícone de câmera estilizado. No nativo (futuro): câmera real
- `ScanResultCard` — card branco com nome do alimento, kcal destacado, macros, badge de confiança
- `ConfidenceBadge` — badge colorido (verde ≥ 85%, amarelo 60–84%, vermelho < 60%)

### Estados da tela
1. **idle** — viewfinder com instrução "Escolha uma foto do alimento"
2. **analyzing** — spinner + "Analisando..."
3. **result** — ScanResultCard com botões "Escanear outro" e "Adicionar ao diário"
4. **error** — mensagem de erro + botão "Tentar novamente"

### Fluxo
1. Usuário seleciona foto → `scannerService.analyzePhoto(uri)`
2. Exibe resultado inline
3. "Adicionar ao diário" → `foodLogService.addMeal(resultData)` → navega para FoodLog

### Limitação Web
React Native Camera não funciona via Webpack. Usar `<input type="file" accept="image/*">` estilizado com aparência de viewfinder. O serviço de análise recebe o URI/base64 normalmente via MSW mock.

---

## Profile

**Layout:** Avatar centralizado + streak + gráfico semanal + configurações (escolha C).

### Componentes
- `ProfileScreen` — tela principal
- `ProfileHeader` — avatar emoji, nome, dados físicos (altura, peso, objetivo)
- `StreakBadge` — badge "🔥 N dias seguidos"
- `WeeklyCalorieChart` — gráfico de barras dos últimos 7 dias (SVG)
- `ProfileMenuItem` — item de menu com ícone, label e seta

### Hook — `features/profile/hooks/useProfile.ts`
- Busca refeições dos últimos 7 dias (7 chamadas a `getMeals` por data)
- Calcula streak: dias consecutivos com pelo menos 1 refeição registrada
- Expõe `weeklyData: { date, totalCalories }[]`

### Dados do usuário
Do auth store: `user.name`, `user.email`. Campos opcionais (`height`, `weight`, `goal`, `calorieGoal`) adicionados ao tipo `User` se presentes.

### Itens de configuração
- 🎯 Metas e objetivos (placeholder, navega para tela futura)
- 🤖 Personalidade do Coach (placeholder)
- 🚪 Sair — chama `authService.logout()` + `clearToken()` → volta para Auth stack

---

## Estado Global Compartilhado

O `useFoodLog` hook é usado tanto pelo FoodLog quanto pelo Dashboard e Profile — o store centraliza os dados e evita fetches duplicados.

---

## Execução Local (Webpack/Web)

- Comando: `npx webpack serve --config web/webpack.config.js`
- Porta: 3000
- MSW ativo: handlers já configurados para todos os endpoints usados
- Sem necessidade de backend real

---

## O que NÃO está no escopo

- Edição de metas (tela futura)
- Edição de personalidade do Coach (tela futura)
- Câmera nativa real no Scanner (apenas web upload)
- Autenticação com Google/Apple nativa (já implementada, não alterada)
