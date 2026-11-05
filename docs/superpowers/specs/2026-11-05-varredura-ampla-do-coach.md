# Spec: varredura ampla do coach (mentor)

**Data:** 05/11/2026 · **Origem:** pedido de expandir o bug de 04/11 (coach respondeu a uma
pergunta antiga e não via o registro errado do scanner) para outras falhas que o usuário pode
encontrar.

**Antecede:** `2026-11-04-coach-antenado-aos-registros.md`, que corrigiu A1–A5 (lista do diário
no contexto, datas nas mensagens, tool de correção, último peso, atalho no Diário).

## Como a varredura foi feita

Li o caminho inteiro de uma mensagem ao coach e comparei com o que o usuário vê e faz no app:

- **Backend:**
  - `chat.service.ts`: prompt, instruções, tools, janela de 30 mensagens, histórico;
  - `chat-context.ts`: o que o modelo recebe sobre o usuário;
  - `meal-correction.ts`: a correção de 04/11;
  - `food-log.service.ts` (`updateMeal`, `getSummary`);
  - `diets` (`getTodayPlan`, `replaceDietItem`);
  - `weight`.
- **App:**
  - `coach.service.ts`, `features/coach/store.ts`, `CoachScreen.tsx` (com as 3 sugestões da
    tela), `ChatBubble.tsx`;
  - o Dashboard, que lê o mesmo store do Diário.

Para cada pedido plausível do usuário, a pergunta foi a mesma: o coach tem o dado e a ferramenta
para responder certo? Se não tem, ele recusa ou inventa?

Hipóteses verificadas e **descartadas** (não entram):

- **Correção mudar o peso de refeição com vários itens.** Não acontece: toda refeição é gravada
  com um único item (`addMeal` e `updateMeal` inserem um), então peso do primeiro item = peso
  total.
- **Tela Hoje não atualizar depois da correção do coach.** Não acontece: o Dashboard lê o mesmo
  `useFoodLogStore` que o refresh de 04/11 atualiza.
- **Duas mensagens ao mesmo tempo sobrescreverem o histórico.** O `ChatInput` fica desabilitado
  enquanto a resposta não chega, e com a carteira ligada há lease por conversa.
- **Resumo da semana contar registro impossível.** `getSummary` já exclui pelos tetos.

## Falhas encontradas

| ID | Falha | Gravidade | Decisão |
|---|---|---|---|
| M1 | Coach pode dizer que fez o que não consegue fazer (registrar, apagar, marcar refeição, atualizar peso, trocar item do plano) | Alta | Corrigir |
| M2 | O chat mostra todas as mensagens antigas com o horário de agora e sem data | Alta | Corrigir |
| M3 | A correção grava assim que o modelo chama a tool; a confirmação depende só do modelo obedecer | Alta | Corrigir (proposta + botão) |
| M4 | A mensagem da correção pode citar kcal diferente da gravada | Média | Resolvida por M3 |
| M5 | Coach não vê o que tem no plano de hoje, só o nome e a kcal da próxima refeição | Alta | Corrigir |
| M6 | Coach só enxerga hoje: o atalho "Corrija com o coach" num registro de outro dia falha, e "como foi minha semana?" fica sem dados | Média | Corrigir |
| M7 | O contexto traz dois pesos diferentes (cadastro e Evolução) | Média | Corrigir |
| M8 | Passou da meta → o contexto diz "Faltam: -350 kcal" | Baixa | Corrigir |
| M9 | O corte do contexto derruba as últimas linhas (aviso de registro impossível, perfil, peso, streak) quando o diário é longo | Média | Corrigir |
| M10 | A conversa é uma só e cresce sem limite; cada mensagem relê e regrava o histórico inteiro | Média | Corrigir |
| M11 | Troca de item do plano (`POST /diets/items/:itemId/replace`) aceita qualquer valor (999.999 kcal) | Baixa | Corrigir |
| A6 | Scanner não guarda a confiança da estimativa | — | Fora (migração; já registrado) |
| A7 | Mudar o número de refeições refaz a semana | — | Fora (já registrado em 28/10) |
| — | Histórico de conclusões do plano por dia (`completedAt` guarda só a última) | — | Fora (migração); M6 avisa o modelo |

## Detalhe e comportamento esperado

### M1 — O coach não pode prometer o que não faz
**Hoje:** o coach tem só duas tools, `collect_diet_data` (gera um plano novo) e
`update_logged_meal`. O prompt não diz o que ele **não** consegue fazer. Pedidos naturais podem
receber "Pronto, registrei!" sem que nada tenha acontecido:
- "registra aí 2 ovos";
- "apaga esse registro";
- "marca meu almoço como feito";
- "meu peso agora é 78 kg";
- "troca o arroz do almoço por batata".

O caso do peso é pior com dieta ativa: o modelo pode chamar `collect_diet_data`, o que gera um
plano novo e zera as refeições concluídas.

**Esperado:**
- Instrução fixa `CAPABILITIES_INSTRUCTION`, com o que o coach faz e o que não faz:
  - **Faz:** orientar; analisar o dia; propor a correção de um registro (M3); gerar um plano
    novo, só quando pedido.
  - **Não faz, e indica o caminho no app:**
    - registrar refeição: Diário › Adicionar refeição, ou o Scanner;
    - apagar um registro: lixeira do registro no Diário;
    - marcar uma refeição do plano: tela Hoje;
    - registrar o peso: Evolução;
    - trocar um item do plano: o app não tem essa tela. O coach sugere a troca equivalente e
      diz que o usuário pode seguir com ela, ou pedir um plano novo.
  - Nunca dizer "registrei", "apaguei", "marquei" ou "atualizei" sem a ferramenta.
- "Meu peso agora é X": com dieta ativa, **não** gera plano. O coach responde e indica a
  Evolução. Plano novo só se o usuário pedir.
- Eval com 5 casos novos.

### M2 — O chat mostra quando cada mensagem aconteceu
**Hoje:** `coachService.getHistory` monta `timestamp: new Date()` para todas as mensagens. Ao
reabrir o app, a conversa da semana passada aparece com o horário de agora. É o mesmo engano do
modelo em A2, agora na tela: o usuário não percebe que aquela pergunta é velha.

**Esperado:**
- `GET /chat/history` passa a devolver `created_at`, vindo do `at` gravado desde 04/11.
- O app mostra a hora real e um separador de dia antes da primeira mensagem de cada dia:
  "Hoje", "Ontem" ou "02/11".
- Mensagem antiga, sem `at`: sem horário, com um separador único "Conversas anteriores" no topo.
- A mensagem enviada agora continua com o horário local do envio.

### M3 — Correção por proposta e botão (substitui a gravação direta)
**Hoje:** quando o modelo chama `update_logged_meal`, o servidor grava. A regra "só depois de o
usuário confirmar" é só instrução, o risco que a spec de 04/11 deixou anotado.

**Esperado:**
- A tool passa a se chamar `propose_meal_correction`, com os mesmos campos. O servidor:
  1. resolve a ref (M6);
  2. valida os tetos e a regra macros ≤ peso;
  3. recalcula a kcal incoerente;
  4. **não grava nada.**
- A resposta traz
  `meal_proposal: { id, date, currentName, name, weightGrams, calories, protein, carbs, fat, fiber }`,
  já com os valores normalizados.
- O texto do coach vem do servidor, montado com esses valores: `Para os mesmos 180 g de "Salmão
  grelhado": 367 kcal · P 36 g · C 0 g · G 24 g. Toque em Atualizar registro para salvar.` A
  `message_to_user` do modelo entra antes, como frase de abertura, se existir.
- O app mostra a proposta num cartão logo abaixo da mensagem, com dois botões:
  - **Atualizar registro:** chama o `PATCH /food-log/meals/:id` existente, com os valores e o
    `weightGrams` da proposta. Depois recarrega o dia e mostra "Registro atualizado".
  - **Agora não:** fecha o cartão.
- O cartão vive só na sessão. Ao reabrir o chat, a proposta antiga não volta.
- O "sim" do usuário deixa de ser necessário, e com ele uma chamada de IA e 2 créditos.
- **Compatibilidade:** o app novo manda `client_features: ['meal_proposal']` na mensagem.
  - Com essa marca, o servidor oferece só a tool de proposta.
  - Sem ela (app que ainda não aplicou o OTA), continua a tool de 04/11, que grava direto, para
    o texto não falar de um botão que não existe.
  - O campo `meal_updated` continua na resposta.

**Por que resolve M4:** os números que o usuário lê no cartão e no texto saem dos mesmos valores
que serão gravados.

### M5 — O coach vê o plano de hoje
**Hoje:** do plano, o contexto traz só a contagem de refeições concluídas e a próxima refeição
(título e kcal). Pedidos como "o que tem no meu almoço?", "posso trocar o arroz?" ou "Sugira uma
refeição equilibrada" (sugestão da própria tela) são respondidos sem o plano, e o coach pode
contradizê-lo ou inventá-lo.

**Esperado:** um bloco no contexto, uma linha por refeição:

```
Plano de hoje:
- 07:30 Café da manhã (concluída) — 420 kcal: pão integral 50 g, ovo 2 un, café 200 ml.
- 12:30 Almoço — 650 kcal: arroz 120 g, feijão 100 g, frango 150 g, salada 80 g.
```

- No máximo 6 itens por refeição. Passando disso, "+N itens".
- Instrução: perguntas sobre o plano usam este bloco. Para trocar um item, o coach sugere a troca
  com quantidades equivalentes, sem dizer que alterou o plano (M1).

### M6 — Além de hoje
**Hoje:**
- `update_logged_meal` aceita registros de hoje e de ontem, mas o contexto só mostra as refs de
  hoje. Corrigir um registro de ontem só dá certo se o modelo adivinhar a ref.
- O atalho "Corrija com o coach" (04/11) aparece em qualquer dia do Diário. Num registro de três
  dias atrás, a resposta é sempre "não encontrei".
- "Como foi minha semana?" e "ontem eu exagerei?" ficam sem nenhum dado.

**Esperado:**
- **Ref no rascunho:** o rascunho do atalho passa a levar a ref e a data:
  `Corrigir o registro "Carne suína grelhada" (180 g, 02/11 · ref m1a2b3): na verdade era `. A
  ref fica no histórico, e o modelo a usa na proposta.
- **Janela da correção:** a busca da ref vai de 2 para 7 dias (hoje e os 6 anteriores). A
  mensagem de "não encontrado" passa a dizer "dos últimos 7 dias".
- **Atalho:** só aparece em registros de até 6 dias atrás.
- **Resumo da semana no contexto:** uma linha com os 6 dias anteriores, que vem de `getSummary`
  e só conta o diário: `Últimos dias (só diário): 30/10 1.850 kcal / 95 g prot · 31/10 sem
  registro · …`. A instrução diz que as refeições do plano concluídas em dias passados não
  entram (o sistema não guarda), então o coach não deve concluir que o usuário "não comeu".

### M7 — Um peso só
**Hoje:** a linha "Perfil" usa o peso do cadastro, e a linha "Último peso registrado na
Evolução" mostra outro valor. O modelo vê dois pesos. O bloco de dados já conhecidos usa o mais
recente, mas o de contexto não.

**Esperado:**
- A linha "Perfil" usa o peso mais recente e diz a origem: `79 kg (Evolução, 02/11)`.
- A linha separada some.
- Na consulta, empate de data é desempatado por `created_at DESC`.

### M8 — Meta ultrapassada
**Hoje:** `Faltam: -350 kcal, -12g proteína.`

**Esperado:** cada número sai na forma certa.
- Acima da meta: `Passou da meta em 350 kcal`.
- Abaixo da meta: `Faltam 12 g de proteína`.
- No limite: `Meta atingida`.

### M9 — O que o corte pode derrubar
**Hoje:** `truncateByLines` corta a partir do fim. A ordem atual é esta:
1. números do dia;
2. lista do diário (até 8 linhas longas);
3. aviso de registro impossível;
4. perfil;
5. restrições;
6. peso;
7. streak.

Com o plano (M5) e a semana (M6), o corte passaria a derrubar o aviso e o perfil com frequência.

**Esperado:**
- **Ordem nova:**
  1. números do dia;
  2. aviso de registro impossível;
  3. perfil e restrições;
  4. plano de hoje;
  5. diário;
  6. semana;
  7. streak.
- O diário e o plano são encurtados antes de serem descartados. Nomes passam a ter no máximo 60
  caracteres.
- `CONTEXT_MAX_CHARS` vai para 3.600.
- Teste: com 8 registros de 120 caracteres e um plano de 6 refeições cheias, o aviso e o perfil
  continuam no contexto.

### M10 — Conversa sem fim
**Hoje:** há um único `chat_history` por usuário, para sempre. Cada mensagem lê e regrava o JSON
inteiro. O `GET /chat/history` devolve tudo, e o app renderiza tudo. Com meses de uso, isso deixa
o envio lento e a tela pesada.

**Esperado:**
- **Gravação:** ao gravar, o histórico guarda as últimas 400 mensagens. O modelo continua vendo
  30.
- **Leitura:** o `GET` devolve as últimas 200.
- Os marcadores internos continuam valendo dentro da janela.

### M11 — Troca de item sem teto
**Hoje:** `replaceDietItemBodySchema` só tem `min(0)`. O app atual não chama esse endpoint, mas
ele está exposto e é da mesma família do 999.

**Esperado:**
- Tetos de `MEAL_LIMITS` nos valores.
- `quantity_g` com máximo de 5.000.
- `food_name` com máximo de 120.

## Aceite
- [ ] M1: o prompt inclui a lista do que o coach faz e não faz. O eval ganha 5 casos
      (registrar, apagar, marcar, peso com dieta ativa, trocar item), todos **sem tool**.
- [ ] M2: reabrir o chat mostra a hora real de cada mensagem nova e separadores de dia. As
      mensagens antigas aparecem sem horário.
- [ ] M3: a tool não grava. A resposta traz `meal_proposal` com valores normalizados, e o
      cartão mostra os mesmos números do texto. "Atualizar registro" grava pelo PATCH e atualiza
      Diário e Hoje.
- [ ] M5: com plano ativo, o contexto lista as refeições de hoje com os itens.
- [ ] M6: o rascunho leva a ref. Uma ref de 5 dias atrás é encontrada, uma de 8 dias não. O
      contexto traz o resumo dos dias anteriores.
- [ ] M7: o contexto tem um peso só.
- [ ] M8: com a meta passada, o contexto não tem número negativo.
- [ ] M9: o teste de contexto longo mantém o aviso e o perfil.
- [ ] M10: o histórico gravado tem no máximo 400 mensagens, e o GET devolve no máximo 200.
- [ ] M11: o POST de troca com 999.999 kcal devolve 400.
- [ ] Nenhuma mudança nativa: tudo vai por OTA e Vercel.

## Riscos
- **M3 muda o fluxo de 04/11.** Quem já viu "pode atualizar?" passa a ver um botão. O fluxo
  antigo de 04/11 ainda não foi visto em uso real, então o custo de troca é baixo.
- **Prompt maior (M5 e M6).** Mais tokens por mensagem, cerca de +800 caracteres no máximo.
  Acompanhar o custo médio em `ai_usage` na primeira semana.
- **Ref visível no rascunho (M6).** O usuário vê "ref m1a2b3" na mensagem. É feio, mas é
  previsível. A alternativa, mandar o id escondido na requisição, não sobrevive ao turno
  seguinte.
- O comportamento do modelo (M1) só é verificável com chave de IA: o eval roda fora desta
  máquina.
