# Spec: feedback do Eliton (refeição absurda aceita e coach que "parou" depois de mudar a dieta)

**Data:** 28/10/2026 · **Origem:** feedback de usuário com print da tela Hoje (27/10)

## O relato

> Adicionei uma refeição de 999.999 em todos os campos, e ele aceitou de boa, poderia ter uma
> pop-up um alerta avisando que os valores estavam passando muitos % da meta diária.
>
> E por algum motivo o chat ali parou de funcionar quando eu pedi para ele alterar a minha
> dieta de 3 para 6 refeições ao dia. no final tem uma surpresa rsrs

O print confirma as duas coisas e mostra a "surpresa": o card **Plano do dia** já diz
**"0 de 6 refeições concluídas"**. A dieta foi trocada para 6 refeições mesmo com o chat
aparentemente quebrado. O pedido funcionou no servidor, mas o usuário não ficou sabendo.

São três problemas independentes:

| ID | Problema | Severidade |
|---|---|---|
| R1 | Registro manual aceita qualquer valor (999.999 kcal / 999.999 g) | Alta: corrompe o dia, o resumo semanal e o contexto do coach |
| R2 | Tela Hoje não aguenta valores fora da escala (percentuais de 7 dígitos, número estourando o card) | Média |
| C1 | Depois de gerar a dieta, o coach para de responder | Alta: trava a função principal paga |
| C2 | A conclusão da dieta não aparece no chat, e os marcadores internos vazam para a conversa | Média |

---

## R1: registro manual sem limite de plausibilidade

**Onde**
- `backend/src/modules/food-log/food-log.schemas.ts` — `addMealBodySchema`: `calories`,
  `protein`, `carbs`, `fat` e `fiber` só têm `.min(0)`. Sem `.max()` e sem `.finite()`.
- `app/src/features/food-log/components/AddMealModal.tsx` — `parseMacro`/`parseFiber` só
  rejeitam NaN e negativos. Nenhum teto, nenhum aviso em relação à meta.

**O usuário vê:** salva 999.999 em tudo sem nenhuma pergunta. O dia fica com 58.997% da
meta e o registro passa a contaminar tudo que soma o dia: o resumo semanal (`/food-log/summary`),
a Evolução e o contexto que o coach recebe ("você comeu 999.999 kcal hoje").

**Comportamento esperado**

1. **Limite rígido no servidor (fonte da verdade).** Valores fisicamente impossíveis para
   uma única refeição são rejeitados com 400 e mensagem por campo:

   | Campo | Máximo por refeição |
   |---|---|
   | `calories` | 5.000 kcal |
   | `protein`, `carbs`, `fat` | 500 g |
   | `fiber` | 150 g |

   Todos também `.finite()`. Os mesmos limites valem para o `PATCH` (que deriva do mesmo
   schema). Os tetos são folgados de propósito: um rodízio inteiro cabe, um erro de digitação
   com três zeros a mais não.

2. **Mesmo limite no app**, antes do envio, com o erro no próprio campo
   ("Máximo de 5.000 kcal por refeição") em vez de alerta genérico.

3. **Aviso de confirmação em relação à meta** (o pedido do usuário). Antes de salvar, se
   houver meta do dia (dieta ativa) e **qualquer** das condições valer:
   - a refeição sozinha passa de **60% da meta de calorias** do dia; ou
   - o dia, somado a essa refeição, passa de **150% da meta de calorias**; ou
   - algum macro da refeição sozinho passa de **100% da meta daquele macro**;

   o app mostra um diálogo:
   > **Essa refeição está bem acima da sua meta**
   > Com ela, você chega a 3.200 kcal hoje (189% da meta de 1.695 kcal). Confira se os
   > valores estão certos.
   > [Revisar valores] [Salvar mesmo assim]

   "Revisar valores" volta ao formulário com os campos preenchidos. Sem dieta ativa (sem
   meta), o aviso não aparece; só o limite rígido vale. O aviso é só uma confirmação: não
   bloqueia nada que esteja dentro do limite rígido.

**Fora do escopo:** checar se calorias batem com os macros (4/4/9). Dá falso positivo com
álcool, arredondamento e rótulo de fabricante.

**Dados já gravados:** registros acima do novo teto continuam existindo e o usuário pode
apagá-los ou editá-los (a edição exige valores válidos). Não há migração.

---

## R2: tela Hoje fora da escala

**Onde**
- `app/src/features/dashboard/screens/DashboardScreen.tsx:131` — `percentLabel` sem teto
  (mostra `58997%`). O anel (`CalorieRing.tsx:81`) já limita em `999%+`; os dois discordam
  na mesma tela.
- `app/src/features/dashboard/components/MacroCard.tsx:21` — `pctLabel` sem teto
  (`4166663%`), e o valor (`999999g`) estoura a largura do card.

**Esperado:** um formatador único (`formatGoalPercent`) usado pelo anel, pelo resumo e pelos
cards de macro, com teto `999%+`. Valores grandes no card de macro usam separador de milhar
e não quebram o layout (o valor encolhe com `adjustsFontSizeToFit`/`numberOfLines={1}`, como
o resumo de calorias já faz com `stackSummary`). Com R1 isso vira proteção para dados antigos,
mas precisa existir: os registros de 999.999 já estão no banco.

---

## C1: o coach para de responder depois de gerar a dieta

### Causa provável (pelo código; falta confirmar no banco)

O teto diário de IA (`checkDailyQuota`, `backend/src/shared/ai-usage.ts:96`) soma
**todos os tokens do usuário nas últimas 24 h, de qualquer feature**:

```sql
SELECT COALESCE(SUM(total_tokens), 0) FROM ai_usage
WHERE user_id = $1 AND created_at >= NOW() - interval '24 hours'
```

Uma dieta são 7 chamadas `diet_day` (`jobs.service.ts:527`, `max_tokens: 20000` cada, com
reasoning), e cada uma vai para o mesmo `ai_usage` com o `user_id`. Somando o prompt (perfil,
dias anteriores para não repetir cardápio), uma dieta sozinha pode consumir boa parte do
`AI_DAILY_TOKEN_CAP` padrão de **200.000**. Quem já usou o coach e o scanner no dia e pede
uma alteração na dieta estoura o teto, e a partir daí **toda** mensagem do chat volta
`429 AI_QUOTA_EXCEEDED`. O app mostra "Você atingiu o limite diário do coach. Volte amanhã.",
que o usuário lê como "parou de funcionar".

Isso também explica a "surpresa": a geração começou antes de estourar o teto e pelo menos o
dia de hoje foi gravado com 6 refeições. Se o teto estourou no meio, `processJobStep`
(`jobs.service.ts:655`) marca o job `failed` com `AI_QUOTA_EXCEEDED` e os dias seguintes
ficaram sem gerar. Vale checar.

Três agravantes:
- **A geração é gratuita por decisão de produto (21/10)**, mas gasta o teto que o chat pago
  usa. O usuário perde o chat que está pagando por causa de uma função grátis.
- **O usuário tem créditos** (13,8 no print). Com a carteira ligada, o teto de tokens bloqueia
  mesmo quem pagou pela mensagem, e a mensagem "volte amanhã" não explica o porquê.
- Uma alteração simples ("de 3 para 6 refeições") refaz os 7 dias inteiros. É o pedido mais
  caro possível para a mudança pedida.

### Hipóteses alternativas (descartar na investigação)

- **Mensagens durante a geração:** o input não fica desabilitado durante o job
  (`CoachScreen.tsx:204` só olha `isLoading`); o modelo recebe a conversa sem a tool. Deveria
  funcionar, mas é o segundo lugar a olhar se o `ai_usage` não mostrar 429.
- **Resposta vazia/truncada (`AI_TRUNCATED`):** histórico longo após a dieta + reasoning.
  Aparece em `ai_usage.finish_reason = 'length'`.

### Investigação (primeiro passo, antes de mexer em código)

No SQL Editor do Supabase, com o `user_id` do Eliton:

```sql
-- 1. Consumo por feature nas 24 h em volta do relato (27/10)
SELECT feature, COUNT(*) AS chamadas, SUM(total_tokens) AS tokens,
       MIN(created_at), MAX(created_at)
FROM ai_usage
WHERE user_id = :uid AND created_at BETWEEN '2026-10-26' AND '2026-10-28'
GROUP BY feature ORDER BY tokens DESC;

-- 2. Linha do tempo do chat e da dieta, com fim de cada chamada
SELECT created_at, feature, total_tokens, finish_reason, tool_called, conversation_id
FROM ai_usage
WHERE user_id = :uid AND created_at BETWEEN '2026-10-27' AND '2026-10-28'
ORDER BY created_at;

-- 3. Estado do job da dieta de 6 refeições
SELECT id, status, error, days_completed, created_at, updated_at
FROM diet_jobs WHERE user_id = :uid ORDER BY created_at DESC LIMIT 3;
```

Mais os logs da Vercel no período, procurando `Quota diária de IA excedida` com o `userId`.

**Confirmado se:** a soma da consulta 1 passa de 200.000 e as chamadas de chat param (ou os
logs mostram o warn de quota) depois das chamadas `diet_day`.

### Comportamento esperado

1. **A geração de dieta não consome o teto do chat.** O teto passa a ser por grupo de feature:
   - `chat` + `transcribe` + `speech`: teto do coach (`AI_DAILY_TOKEN_CAP`, como hoje);
   - `vision`: teto do scanner;
   - `diet_day`: teto próprio (`AI_DIET_DAILY_TOKEN_CAP`), dimensionado para **2 dietas
     completas por dia** a partir do consumo real medido na investigação.
   Estourar o teto da dieta falha só o job; o chat continua.

2. **Mensagem de limite que explica.** Quando o teto do chat estourar, o app diz o que
   aconteceu e quando volta, sem culpar o usuário: "Você usou bastante o coach hoje e
   chegou ao limite diário de segurança. Ele volta a responder às HH:MM." (o servidor devolve
   `retryAt` = quando a janela de 24 h libera tokens suficientes). Com créditos sobrando, a
   mensagem deixa claro que **os créditos não foram cobrados**.

3. **Antes de refazer a dieta, o coach confirma o custo.** A `EXISTING_DIET_INSTRUCTION` já
   manda perguntar na dúvida; para pedidos de alteração ela passa a exigir uma confirmação
   que diga que o plano dos 7 dias será refeito e as refeições marcadas hoje serão zeradas.

**Fora do escopo (registrar como próximo passo de produto):** alterar só o número de
refeições sem regerar a semana inteira. Exige redistribuir os alimentos entre refeições, o
que é uma feature à parte.

---

## C2: conclusão invisível e marcadores internos na conversa

**Onde**
- `backend/src/modules/diets/jobs.service.ts:863` grava `"[Dieta concluída — 7 dias]"` no
  histórico do chat quando o job termina.
- `backend/src/modules/chat/history-markers.ts` — `isInternalChatMarker` só reconhece o
  marcador de **início** (`[Dieta de 7 dias iniciada em …]`), não o de conclusão.
- `GET /chat/history` e `coachService.getHistory` (app) não filtram nada: quem reabre a
  conversa vê os dois marcadores como balões do coach.
- `app/src/features/coach/store.ts:555` — `onDietJobCompleted` só recarrega a dieta. Nada
  aparece no chat.

**O usuário vê:** pede a alteração, o coach diz que vai gerar, o banner some, e a conversa
fica parada. A dieta nova só é descoberta por acaso na tela Hoje ("a surpresa"). Se reabrir
o chat depois, aparecem textos entre colchetes que parecem erro.

**Esperado**
1. `isInternalChatMarker` reconhece os dois marcadores (a partir de constantes compartilhadas,
   não de strings soltas).
2. `GET /chat/history` remove os marcadores da resposta. Eles continuam no banco e no
   contexto do modelo, que é para isso que existem.
3. Quando o job termina, o app adiciona à conversa uma mensagem local do coach:
   "Pronto! Sua nova dieta está no ar, com N refeições por dia. Veja na aba Dieta." com
   botão para a aba. Se o job falhar, o `DietJobBanner` já mostra o erro com "Tentar de novo".

---

## Critérios de aceite

- [ ] `POST /food-log` com `calories: 999999` volta 400 com mensagem do campo; com
      `calories: 4800` salva.
- [ ] No app, 999999 em qualquer campo mostra o erro no campo e não chama a API.
- [ ] Com meta de 1.695 kcal, salvar 1.200 kcal mostra o aviso; "Revisar valores" mantém o
      formulário; "Salvar mesmo assim" salva.
- [ ] Sem dieta ativa, 1.200 kcal salva direto.
- [ ] A tela Hoje com o registro antigo de 999.999 mostra `999%+` no resumo, no anel e nos
      quatro cards, sem texto estourando.
- [ ] Gerar uma dieta completa e depois mandar mensagem no coach funciona, mesmo com o
      teto do chat configurado abaixo do consumo de uma dieta (teste de integração).
- [ ] Estouro do teto do chat mostra o horário de volta e informa que nada foi cobrado.
- [ ] Reabrir uma conversa com dieta gerada não mostra nenhum texto entre colchetes.
- [ ] Concluir a geração com o chat aberto adiciona a mensagem "Pronto! …" com o número de
      refeições certo.

---

## Revisão de 28/10: registro impossível é inválido, não "999%+"

Depois do PR de R2, a tela Hoje passou a mostrar `999%+` para o registro antigo de 999.999.
Isso continua exibindo um dado impossível como se fosse consumo. Decisão: **um registro acima
de qualquer teto de `MEAL_LIMITS` é inválido.**

- Não entra em nenhuma soma: tela Hoje, Diário (`DayMacroSummary`), resumo semanal
  (`GET /food-log/summary`) e contexto do coach.
- Os números dele não aparecem. No Diário e na lista da tela Hoje, o item mostra só o nome e
  "Valores impossíveis", com Editar/Apagar no Diário. Na edição, os campos já aparecem com o
  erro do teto.
- O coach recebe a informação de que existe um registro impossível ignorado, para pedir a
  correção se o usuário falar do dia. Nunca para repetir o número.

O teto de 999%+ de R2 fica como proteção visual para dias somados de verdade.

---

## Varredura de 28/10: outras falhas do mesmo tipo

Busca por valor impossível que entra (digitado ou vindo da IA) ou que chega à tela:

| # | Falha | Correção |
|---|---|---|
| V1 | A revisão do scanner aceitava porção de até 100 kg e calorias sem limite. Desde o teto por refeição, salvar falhava com um "Tente novamente" que nunca funcionava | Porção até 5 kg (app e servidor). O item mostra o erro sem exibir o número, e a confirmação diz qual item corrigir |
| V2 | Soma de decimais crua na tela: `558.0999999999999 kcal`, "faltam 1136.9000000000001 kcal" | `getDayTotals` arredonda (kcal inteira, gramas com uma casa). Barra do Diário, resumo do Diário e metas também |
| V3 | O registro de peso aceitava 0,5 kg (ia para o gráfico) e acima de 500 kg mostrava só "Tente novamente" | 30–300 kg no app, com mensagem, e no servidor. Registros antigos fora da faixa saem do gráfico e da variação |
| V4 | O perfil no servidor aceitava peso 0,1 kg, altura 1 cm e nascimento em 1800 ou no futuro | `BODY_LIMITS` (as faixas do cadastro inicial) no servidor. O coach ignora valores impossíveis de perfis antigos |
| V5 | A dieta da IA podia ter um alimento cujos macros pesam mais que ele, ou 1,5 kg de um item | Novas violações `ITEM_MACROS_EXCEED_WEIGHT` e `ITEM_QUANTITY_TOO_LARGE`: a IA refaz o dia |
| V6 | A API aceitava desafio até 2099 | Máximo de 90 dias |
