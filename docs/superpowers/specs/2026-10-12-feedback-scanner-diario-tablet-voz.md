# Feedbacks de uso — edição, rótulos, fibra, tablet e voz do coach

Data: 2026-10-12 · Branches: `fix/feedback-tablet-voz-rotulos` (PR A) e
`feat/fibra-e-edicao-refeicoes` (PR B)

Cinco relatos de uso real, depois de reinstalar o app:

1. "Não tem o botão de editar caso a IA tenha errado."
2. "Ainda está somente com a primeira letra. Ex: P ao invés de proteína."
3. "Não está aparecendo as Fibras."
4. No tablet, o total de calorias do dia aparece com a fonte "cortada".
5. "O mentor de caloria aceita o áudio, mas não conversa comigo."

A rodada de 2026-10-05 (`2026-10-05-feedbacks-cardapio-coach-biotipo.md`, F1)
resolveu nomes por extenso e fibra **só no cardápio da dieta**. Os relatos 1–3
falam do **scanner** e do **diário**, que ficaram de fora.

## Entrega

| PR | Itens | Camadas | Como chega ao usuário |
|---|---|---|---|
| A | 2, 4, 5 | só app (JS) | OTA `production` ao dar merge (mesmo fingerprint) |
| B | 1, 3 | migration + API + app (JS) | migration à mão no Supabase → merge (Vercel + OTA) |

Nada nativo muda nos dois PRs: não exigem build de loja. Um app recém-instalado
abre primeiro o bundle embutido; o OTA só entra na **segunda** abertura.

## Diagnóstico (medido no código, não suposto)

| # | Causa |
|---|---|
| 1 | No resultado do scanner os campos já são `TextInput`, mas nada indica que são editáveis. No diário só existe excluir; a API não tem rota para alterar refeição. |
| 2 | `ScanItemRow.tsx` rotula os campos com `kcal`, `P`, `C`, `G`. Diário e cardápio já usam nomes por extenso. |
| 3 | O Vision não pede fibra (`visionAnalysisSchema`); `meals`/`meal_items` não têm coluna de fibra; nenhuma tela do diário/painel mostra fibra. |
| 4 | O `Text` compartilhado aplica a variante `body` (lineHeight 16 × 1,5 = **24 px**). `kcalValue` do Dashboard usa `fontSize: 48` sem `lineHeight`: o glifo de 48 px é renderizado numa linha de 24 px e corta em cima e embaixo. Mesmo padrão em mais 8 estilos (saudação do Dashboard 30 px; títulos de Coach, Diário, Perfil 24 px etc.). |
| 5 | Em `useVoiceMessage.stop()`, depois da transcrição, o envio ao coach recebe o contexto da **operação de voz**, cujo `isValid()` exige tela em foco e app ativo. A resposta do coach leva 10–30 s; se nesse intervalo a tela perde o foco (troca de aba) ou o app sai do primeiro plano (tela apaga), a operação é cancelada: o `onAbort` do store remove a bolha do usuário e a resposta é descartada **sem aviso**. A spec de 2026-10-09 pedia cancelar por foco/background **durante gravação e transcrição**; na etapa `/chat/message` só pedia proteger contra **troca de sessão**. |

O item 5 foi confirmado lendo o código, não reproduzido em aparelho (os logs
de produção da Vercel não retêm o período).

## Requisitos

### R1 — Altura de linha que acompanha a fonte (item 4)

`Text` (`app/src/shared/components/Text.tsx`): quando o `style` recebido define
`fontSize` **e não** define `lineHeight`, e a variante tem `lineHeight`, e
`fontSize × 1,2` (`typography.lineHeight.tight`) é **maior** que o `lineHeight`
herdado, aplica `lineHeight = ceil(fontSize × 1,2)`.

- Textos que hoje cabem (fontSize ≤ lineHeight / 1,2) não mudam de layout.
- `lineHeight` explícito no `style` sempre vence.
- A variante `label` (sem `lineHeight`) não é afetada.

### R2 — Rótulos por extenso no scanner (item 2)

`Calorias`, `Proteína`, `Carboidratos`, `Gordura` (e `Fibra`, com R4), com a
unidade no rótulo: `Calorias (kcal)`, `Proteína (g)` etc. Os campos quebram em
duas colunas para caber no telefone.

### R3 — A resposta do coach a um áudio sobrevive a foco/background (item 5)

- Gravação e transcrição: comportamento atual (foco/background/sessão cancelam).
- Depois que a transcrição volta válida, a operação de voz **termina**
  (`status = 'idle'`) e o texto segue para o coach com um contexto ligado
  **somente à sessão** (mesmo `user.id` e mesma `sessionGeneration`).
- Perder o foco, ir para background ou desmontar a tela **não** cancela esse
  envio. Logout ou troca de conta **cancela** (aborta o sinal), preservando o
  teste "Logout enquanto resposta de `/chat/message` está pendente".

### R4 — Fibra na foto, no diário e no painel (item 3)

- **IA:** `visionAnalysisSchema.fiber` (obrigatório — Structured Outputs) e o
  prompt pede fibra em gramas da porção.
- **Guardrail:** `fiber = max(0, round(fiber))`; escala junto com os macros
  quando as calorias estouram o teto. Fibra não entra no cálculo de kcal.
- **Contrato do scanner:** `ScanItem.fiber: number | null`. Resultado em cache
  anterior a esta mudança volta com `fiber: null`.
- **Banco (migration `022_meal_fiber.sql`):** `meal_items.fiber_g` e
  `meals.total_fiber`, `NUMERIC(8,2)` **nullable** (registro antigo = sem dado,
  não 0 g). O trigger `recalculate_meal_totals` passa a somar `fiber_g` em
  `total_fiber` (`SUM` de nulos = `NULL`).
- **Tolerância à ordem do deploy:** como em `fiber-columns.ts` da dieta, o
  backend checa `information_schema.columns` (cache só do "sim"). Sem as
  colunas, grava como hoje e devolve `fiber: null`.
- **API do diário:** `Meal.fiber: number | null`; `POST /food-log` aceita
  `fiber?: number | null`.
- **App:** campo "Fibra (g)" no scanner e no modal de refeição; linha do item do
  diário mostra "Fibras Xg" quando houver; resumo do dia (Diário) e card no
  Dashboard mostram "Fibras". Meta de fibra no Dashboard = soma da fibra das
  refeições do plano de hoje quando alguma tiver o dado; senão "Sem meta".
- O resumo semanal (`/food-log/summary`) fica sem fibra (YAGNI).

### R5 — Editar quando a IA errou (item 1)

- **Scanner:** cada item mostra os valores em modo leitura com um botão
  **"Editar"**; ao tocar, vira formulário (nome + 5 campos) com **"Concluir"**.
  Item manual (nome vazio) já abre em edição. O fluxo de confirmar não muda.
- **Diário:** cada refeição ganha um botão **"Editar"** (ao lado de excluir) que
  abre o mesmo modal de registro, preenchido, com título "Editar refeição" e
  botão "Salvar alterações".
- **API:** `PATCH /food-log/:id` com o mesmo corpo do POST menos `date`
  (`name`, `calories`, `protein`, `carbs`, `fat`, `fiber?`, `mealType?`).
  Refeição de outro usuário ou inexistente → 404 `MEAL_NOT_FOUND`. Os itens da
  refeição são substituídos por um único item com os novos valores (o trigger
  recalcula os totais), igual ao modelo do POST.

## Fora de escopo

- Editar refeições do **plano** (cardápio da dieta).
- Fibra no gráfico semanal do Perfil.
- Desfazer edição / histórico de versões.

## Critérios de aceite

| Caso | Esperado |
|---|---|
| Dashboard com 1234 kcal num tablet | Números inteiros visíveis, sem corte |
| Scanner | Rótulos "Proteína (g)", "Carboidratos (g)", "Gordura (g)", "Fibra (g)" |
| Áudio enviado e troca para a aba Hoje antes da resposta | Ao voltar, bolha do usuário e resposta do coach estão no chat |
| Áudio enviado e logout antes da resposta | Nada da conversa antiga aparece na sessão seguinte |
| Foto de prato | Resultado traz fibra; salvar grava fibra; diário e painel mostram |
| Backend no ar antes da migration 022 | Scanner e diário funcionam; fibra aparece como ausente |
| Editar refeição do diário | Valores e totais do dia atualizam sem recarregar |
| PATCH de refeição de outro usuário | 404 |
