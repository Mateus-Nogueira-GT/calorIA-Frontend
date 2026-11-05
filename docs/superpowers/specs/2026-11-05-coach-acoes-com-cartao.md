# Spec: o coach faz as ações que hoje recusa, com cartão de confirmação

**Data:** 05/11/2026 · **Origem:** expansão 2 da varredura de 05/11. O PR #96 fez o coach
**parar de prometer** o que não faz e indicar o caminho no app (M1). O usuário, porém, continua
pedindo. Esta spec transforma as recusas em ações, no mesmo padrão do cartão "Atualizar
registro": o coach propõe, o usuário toca e o app grava.

## Pedidos cobertos

| Pedido | Hoje (PR #96) | Esperado |
|---|---|---|
| "Registra 2 ovos cozidos no café" | Indica Diário › Adicionar | Cartão **Adicionar ao Diário** |
| "Meu peso hoje é 78 kg" | Indica a Evolução | Cartão **Registrar na Evolução** |
| "Marca meu almoço como feito" | Indica a tela Hoje | Cartão **Marcar como feita** |
| "Apaga esse registro" | Indica a lixeira | **Continua indicando a lixeira** (ver Fora) |
| "Troca o arroz por batata" | Sugere a troca | **Continua sugerindo** (o app não tem a tela) |

## Princípios (iguais aos de M3)
- **O modelo nunca grava.** Cada tool só propõe; o servidor valida e normaliza; o app grava pelos
  endpoints que já existem, quando o usuário toca no botão.
- **O texto com números é do servidor**, montado com os valores do cartão.
- **Compatibilidade:** cada ação só existe se o app declarar a capacidade em `client_features`.
  Sem a marca, o coach segue indicando o caminho no app (instrução M1). A lista do que o coach
  "não faz" passa a ser montada conforme as marcas.
- Uma ação por mensagem (`parallel_tool_calls: false` continua). "Registra os ovos e marca o
  almoço" gera um cartão, e o coach avisa que faz o outro em seguida.

## A1 — Adicionar ao Diário (`propose_log_meal`)
- **Campos:** `name`, `weight_grams`, `calories`, `protein`, `carbs`, `fat`, `fiber`,
  `meal_type` (`breakfast`/`lunch`/`snack`/`dinner`), `date` (`today`/`yesterday`) e
  `message_to_user` (sem números).
- **Servidor:** mesmas regras da correção:
  - tetos de `MEAL_LIMITS`;
  - peso de 0,1 a 5.000 g;
  - macros ≤ peso × 1,05;
  - kcal recalculada se o desvio passar de 25%.

  "Ontem" vira a data local de ontem. Data fora da janela é recusada em texto.
- **Vários alimentos numa frase** ("2 ovos e um pão"): um cartão por mensagem, com um item só,
  somado. O nome junta os alimentos ("2 ovos cozidos + 1 pão francês"), o mesmo modelo de item
  único do Diário.
- **Resposta:** `action_proposal: { kind: 'log_meal', name, weightGrams, calories, protein,
  carbs, fat, fiber, mealType, date }`.
- **App:** o cartão mostra nome, peso, valores e a refeição ("Café da manhã · hoje"). O botão
  **Adicionar ao Diário** chama `POST /food-log` com `date` e `mealType` e coloca o registro no
  store do Diário, como o scanner faz. **Agora não** fecha o cartão.

## A2 — Registrar na Evolução (`propose_log_weight`)
- **Campos:** `weight_kg`, `date` (`today`/`yesterday`) e `message_to_user`.
- **Servidor:**
  - o peso tem que estar em `BODY_LIMITS`;
  - se já houver peso nessa data, a proposta traz `replaces: 80.2`, e o texto diz "substitui o
    peso de hoje (80,2 kg)";
  - se a variação passar de 5 kg em relação ao último registro, a proposta sai com aviso "Confira:
    é 5 kg diferente do último registro" (digitação errada é comum).
- **Resposta:** `action_proposal: { kind: 'log_weight', weightKg, date, replaces: number | null,
  bigChange: boolean }`.
- **App:** o botão **Registrar na Evolução** chama `POST /weight` e atualiza o store da Evolução.
- **Não mexe na dieta:** peso novo continua não sendo pedido de plano novo. Depois de salvar, o
  cartão diz "Se quiser, posso refazer seu plano com o peso novo."

## A3 — Marcar refeição do plano (`propose_complete_plan_meal`)
- **Referência:** a lista do plano no contexto (M5) passa a trazer uma ref por refeição:
  `- [plano 9f8e7d] 12:30 Almoço — 650 kcal: …`.
- **Campos:** `plan_meal_ref` e `message_to_user`.
- **Servidor:**
  - a ref é resolvida entre as refeições do plano de **hoje**;
  - se a refeição já estiver concluída hoje, não há cartão, e o texto diz que ela já está
    marcada.
- **Problema do toggle:** o endpoint de hoje **inverte** o estado. Se o usuário tocar no botão
  depois de já ter marcado pela tela Hoje, a refeição seria desmarcada.
  - `toggleMealBodySchema` ganha `completed?: boolean`. Com ele, o estado final é o pedido; o
    servidor não inverte.
  - Apps antigos não mandam `completed` e continuam invertendo.
- **Resposta:** `action_proposal: { kind: 'complete_plan_meal', mealId, title, calories }`.
- **App:** o botão **Marcar como feita** chama o toggle com `completed: true`, `date` e
  `tzOffsetMinutes`, e recarrega o plano do dia (`useDietStore`).

## A4 — O que o coach diz que faz
`CAPABILITIES_INSTRUCTION` vira `capabilitiesInstruction(features)`:
- cada capacidade presente sai da lista "não consegue" e entra em "consegue propor";
- a regra "nunca diga que fez" continua: com o cartão, o coach diz "toque em Adicionar para
  salvar", nunca "adicionei".

## Fora desta spec
- **Apagar pelo coach.** Uma exclusão errada não tem desfazer no app, e "apaga esse" é ambíguo
  com vários registros. A lixeira já resolve em um toque.
- **Trocar item do plano.** O endpoint existe, mas o app não tem a tela; isso precisa de uma spec
  própria.
- **Cartões que voltam ao reabrir o chat e marcador de "ação aplicada" no histórico** (item 4 da
  lista de expansões). Com 4 tipos de cartão isso pesa mais. Recomendo fazer antes ou junto.

## Aceite
- [ ] "Registra 2 ovos cozidos no café" (app novo) → cartão com valores válidos. Tocar em
      Adicionar cria o registro no Diário do dia e do tipo certos.
- [ ] 999.999 kcal ou macros acima do peso → sem cartão, explicação em texto.
- [ ] "Meu peso é 78" → cartão. Se já havia peso hoje, o cartão mostra o que substitui. Mais de
      5 kg de diferença → aviso. Tocar em Registrar grava e atualiza a Evolução. Nenhum plano é
      gerado.
- [ ] "Marca meu almoço" → cartão. Tocar duas vezes, ou depois de marcar pela tela Hoje, nunca
      desmarca. Refeição já concluída → sem cartão.
- [ ] App sem as marcas → o coach indica o caminho, como no PR #96.
- [ ] Eval: 3 casos novos (uma tool por pedido), e "apaga esse registro" continua sem tool.
- [ ] Nada nativo: app por OTA, backend pela Vercel. Não há migração.

## Riscos
- **O modelo pode propor sem o usuário pedir** (ex.: "comi 2 ovos" como desabafo). Nada é gravado
  sem o toque. O pior caso é um cartão a mais, que o usuário dispensa.
- **Valores estimados por texto** são menos precisos que a foto. O cartão mostra os números antes
  de gravar, e o registro pode ser editado no Diário.
- **Mais ferramentas no prompt:** as definições de tool somam tokens fixos por mensagem.
  Acompanhar o custo médio do `chat` em `ai_usage`.
