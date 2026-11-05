# Plano: scanner pergunta quando não tem certeza do alimento

Spec: `docs/superpowers/specs/2026-11-05-scanner-duvida-de-alimento.md`

Branch `feat/scanner-duvida-alimento`. Um commit por tarefa, com TDD (teste vermelho antes da
mudança). Backend pela Vercel e app por OTA. A migração roda à mão no Supabase; o código funciona
antes e depois dela.

## T1 — Alternativas na análise (S1)
Arquivos: `backend/src/modules/scanner/scanner.prompt.ts`, `scanner.schemas.ts`,
`scanner.service.ts`.
1. **Contrato:**
   - `visionItemSchema` ganha `alternatives`: array de até 2 com `name`, `calories`, `protein`,
     `carbs`, `fat` e `fiber`, todos obrigatórios (exigência do Structured Outputs);
   - `scanItemSchema` ganha `alternatives` opcional, com os mesmos campos já sanitizados.
2. **Prompt:** a regra de identidade ambígua, com os exemplos da spec; lista vazia quando houver
   certeza; a `confidence` também cai quando a identidade for incerta.
3. **Serviço:** `sanitizeAlternatives(item)` passa cada alternativa por `sanitizeVisionResult` e
   descarta a que passar de `MEAL_LIMITS` ou tiver macros acima de `weightGrams × 1,05`.
4. **Cache:**
   - `SCANNER_ANALYSIS_VERSION` vira `items-weight-alt-v3`;
   - o `cacheSchema` aceita `alternatives`;
   - entradas antigas sem o campo deixam de ser servidas.
5. **Testes (`scanner.service.test.ts`):**
   - alternativa válida chega ao app;
   - alternativa com 999.999 kcal é descartada e a outra fica;
   - item sem alternativas → `[]`;
   - cache v2 não é servido.

   Snapshot do prompt revisado.

## T2 — Gravar a dúvida (S3)
1. **Migração** `backend/supabase/migrations/025_meal_items_scan.sql`: `ai_confidence
   NUMERIC(3,2) NULL CHECK (0..1)` e `ai_alternatives TEXT[] NULL`, com `IF NOT EXISTS`.
2. **Detecção de colunas:** `meal-scan-columns.ts` com `hasMealScanColumns`, cópia do padrão de
   `meal-fiber-columns.ts`.
3. **`addMealBodySchema.scan`:** opcional, `confidence` de 0 a 1 e `alternatives` com até 2 nomes
   de até 60 caracteres.
4. **`insertMealItem`:** com `scan` e as colunas presentes, grava `source = 'ai_vision'`,
   `ai_confidence` e `ai_alternatives`. Sem as colunas, grava como hoje.
5. **`updateMeal`:** zera a dúvida (`NULL`, `source = 'manual'`) quando as colunas existem.
6. **`listMeals`:** devolve `scan: { confidence, alternatives } | null` (`mealSchema.scan`
   opcional). Sem as colunas, `null`.
7. **Testes (`food-log.service.test.ts`):**
   - POST com `scan` e colunas → parâmetros certos;
   - sem colunas → SQL antigo, sem erro;
   - PATCH limpa;
   - GET mapeia;
   - schema recusa 3 alternativas e confiança 1,5.

## T3 — Coach vê a dúvida (S4)
1. `diaryLines` acrescenta o sufixo
   `(scanner, confiança N%; podia ser: a, b)` quando `scan.confidence < 0,7` ou houver
   alternativas. Nomes passam por `shortName`.
2. A instrução da lista ganha: "registro marcado como duvidoso → mencione a dúvida se o usuário
   analisar o dia ou estranhar um valor, e ofereça a correção".
3. **Testes (`chat-context.test.ts`):**
   - sufixo presente com confiança 0,45;
   - ausente com 0,9 e sem alternativas;
   - o corte de contexto longo continua mantendo o aviso e o perfil.

## T4 — App: chips na revisão e aviso de nome (S2)
Arquivos: `app/src/shared/services/scanner.service.ts`, `features/scanner/store.ts`,
`components/ScanItemRow.tsx`.
1. **Tipos:**
   - `ScanItem.alternatives?` e `ScanItem.baseWeightGrams?`, o peso a que os valores das
     alternativas se referem, fixado na análise;
   - `ScanItem.valuesFrom?`, o nome do alimento dono dos valores atuais, para o aviso.
2. **Store `chooseAlternative(itemId, index)`:**
   - troca nome e valores, escalando de `baseWeightGrams` para o peso atual com
     `scaleScanPortion`;
   - o alimento atual entra no lugar da alternativa escolhida, para desfazer;
   - `valuesFrom` passa a ser o novo nome.
3. **`ScanItemRow`:**
   - texto "É outro alimento?" e um chip por alternativa;
   - destaque "Confira o alimento" quando houver alternativas e a confiança for menor que 0,6;
   - aviso "Os valores ainda são de …" quando `name !== valuesFrom` e nenhum valor foi editado.
     Editar um valor faz `valuesFrom = name`.
4. **`confirm`:** envia `scan: { confidence, alternatives: nomes }` para os itens vindos da
   análise. Itens manuais não mandam.
5. **Testes:**
   - store: escolher, desfazer e escalar com o peso alterado;
   - row: chips, destaque e aviso aparecendo e sumindo;
   - confirm envia `scan` só para itens da análise;
   - o serviço mapeia `alternatives`.

## T5 — Entrega
1. Suítes completas: backend (vitest, tsc, biome nos arquivos tocados) e app (jest, tsc, eslint
   nos arquivos tocados).
2. PR, CI, merge (com autorização no chat), OTA nos 7 runtimes e deploy na Vercel.
3. **Verificação sem login:** POST `/food-log` com `scan.alternatives` de 3 itens → 400 de
   validação; bundle web com "É outro alimento?".
4. **Para o usuário:**
   - aplicar a `025_meal_items_scan.sql` no SQL Editor do Supabase;
   - teste manual: fotografar um prato com peixe ou carne, ver os chips, trocar, salvar, conferir
     no Diário e perguntar ao coach sobre o registro.
5. **Na primeira semana:** a proporção de itens com alternativas (meta < 50%) e os tokens do
   `scanner` em `ai_usage`.

## Ordem
- T1 → T4 (o app precisa do contrato).
- T2 → T3 (o contexto precisa de `scan` no `listMeals`).
- T1 e T2 são independentes.
