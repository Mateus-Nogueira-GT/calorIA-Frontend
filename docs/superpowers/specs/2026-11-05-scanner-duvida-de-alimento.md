# Spec: scanner pergunta quando não tem certeza do alimento

**Data:** 05/11/2026 · **Origem:** expansão 1 da varredura de 05/11. O feedback de 04/11 era um
jantar de salmão registrado como carne suína. O PR #95 e o PR #96 trataram o depois (o coach
corrige); esta spec trata a origem do erro.

## O que acontece hoje

Li `scanner.prompt.ts`, `scanner.schemas.ts`, `scanner.service.ts`, o `ScanItemRow`, o store do
scanner e o caminho até o diário (`addMeal`, `meal_items`). O que encontrei:

1. **A confiança fala de quantidade, não de identidade.** O prompt manda reduzir `confidence`
   quando "escala, profundidade, quantidade ou ingredientes" forem incertos. Não há nada sobre
   **qual** alimento é. Salmão grelhado e lombo suíno podem sair com confiança alta, porque o peso
   parece certo.
2. **Trocar o nome não troca os valores.** Na revisão, o usuário pode renomear "Carne suína" para
   "Salmão", mas calorias e macros continuam os da carne suína. Nada avisa. Na prática, o usuário
   que percebe o erro e corrige o nome grava um registro pior: nome certo e valores errados.
3. **A dúvida se perde ao salvar.** `confidence` e `uncertain` existem só na tela de revisão.
   `meal_items` é gravado com `source = 'manual'` e sem confiança (a coluna `source` existe e
   aceita `'ai_vision'`, mas nunca é usada). O coach e o Diário não sabem que aquele registro era
   duvidoso (A6 da spec de 04/11).

## Comportamento esperado

### S1 — O scanner diz quando pode ser outro alimento
- Cada item da análise ganha `alternatives`: até 2 outros alimentos plausíveis **para o mesmo
  peso**, cada um com `name`, `calories`, `protein`, `carbs`, `fat` e `fiber`.
- **Regra no prompt:** liste alternativas só quando a identidade for ambígua na foto. Exemplos:
  - carne vermelha × suína;
  - salmão × truta;
  - frango × peixe empanado;
  - arroz branco × integral;
  - purê de batata × mandioquinha.

  Se tiver certeza, a lista fica vazia. A `confidence` também baixa quando a identidade for
  incerta, não só a quantidade.
- **Servidor:** cada alternativa é normalizada pelo mesmo `sanitizeVisionResult` do item (que
  arredonda e acerta a kcal pelos macros). Depois disso, é descartada se passar dos tetos de
  `MEAL_LIMITS` ou se os macros pesarem mais que o item; as outras ficam. O cache muda de versão (`items-weight-alt-v3`), para não
  servir análises antigas sem alternativas.
- **Contrato:** `scanItemSchema.alternatives` é opcional. O app antigo ignora o campo.

### S2 — Na revisão, trocar é um toque
- Item com alternativas: abaixo do nome aparece "É outro alimento?" e um botão (chip) por
  alternativa, ex.: `[Salmão grelhado] [Truta]`.
- **Tocar num chip:**
  - troca nome, calorias, macros e fibra pelos da alternativa, no mesmo peso;
  - o alimento anterior vira uma alternativa, para dar para desfazer;
  - se o usuário já tinha mudado o peso, os valores da alternativa são escalados para o peso
    atual (mesma regra de `scaleScanPortion`).
- Item com alternativas e confiança abaixo de 0,6: a linha ganha destaque ("Confira o alimento")
  além do selo de confiança que já existe.
- **Trocar o nome à mão:** se o usuário editar o nome e não mexer em nenhum valor, aparece abaixo
  do campo: "Os valores ainda são de "Carne suína". Confira ou toque numa opção acima." O aviso
  some quando um valor muda ou um chip é tocado.

### S3 — A dúvida fica guardada no registro
- **Migração `025_meal_items_scan.sql`:** `meal_items.ai_confidence NUMERIC(3,2) NULL` e
  `meal_items.ai_alternatives TEXT[] NULL` (só os nomes, no máximo 2).
- **`addMealBodySchema`** ganha `scan?: { confidence: 0..1, alternatives: string[] (≤ 2, ≤ 60
  caracteres) }`. Com `scan`, o item é gravado com `source = 'ai_vision'`.
- **Antes da migração:** o mesmo padrão de `hasMealFiberColumns`. Sem as colunas, grava como hoje
  e ignora `scan`. A migração roda à mão no SQL Editor do Supabase.
- **Edição pelo Diário ou correção pelo coach** (`updateMeal`): o usuário revisou, então
  `ai_confidence` e `ai_alternatives` voltam a `NULL` e `source` vira `'manual'`.
- **`listMeals`** devolve `scan: { confidence, alternatives } | null`.

### S4 — O coach sabe que o registro era duvidoso
- Na lista do diário do contexto, o registro do scanner que tiver confiança abaixo de 0,7 ou
  alternativas ganha um sufixo:
  `- [ref abcdef] 20:14 Carne suína grelhada — 180 g · … (scanner, confiança 45%; podia ser: salmão grelhado, truta).`
- **Instrução:** se o usuário analisar o dia ou estranhar um valor, o coach menciona a dúvida e
  oferece a correção (o cartão do PR #96).

## Fora desta spec
- Selo "Conferir" no próprio Diário para registros duvidosos. Vale depois de medir quantos
  registros saem com alternativas.
- Pedir uma segunda foto ou usar código de barras.

## Aceite
- [ ] A análise com identidade ambígua devolve `alternatives` válidas. Uma alternativa absurda
      (999.999 kcal) é descartada. Análise do cache antigo não é servida.
- [ ] Na revisão, tocar no chip troca nome e valores, e tocar de novo desfaz. Com o peso
      alterado, os valores saem escalados.
- [ ] Renomear sem mexer nos valores mostra o aviso, que some ao mudar um valor ou tocar num
      chip.
- [ ] Com a migração aplicada, o registro do scanner grava `ai_confidence`, `ai_alternatives` e
      `source = 'ai_vision'`. Sem ela, o registro grava como hoje, sem erro.
- [ ] Editar o registro limpa a dúvida.
- [ ] O contexto do coach traz o sufixo só para registros duvidosos.
- [ ] Nada nativo: app por OTA, backend pela Vercel, mais a migração no Supabase.

## Riscos
- **Mais tokens na análise de foto** (até 2 alternativas por item). Acompanhar `ai_usage` do
  `scanner` na primeira semana; o teto de 20 itens continua.
- **O modelo pode listar alternativas demais** (ruído em toda foto). Mitigação: a regra pede
  alternativas só com ambiguidade real; se mais de 50% dos itens vierem com alternativas na
  primeira semana, endurecer o prompt.
- A migração é manual. O código funciona sem ela, mas a parte S3/S4 só vale depois de aplicada.
