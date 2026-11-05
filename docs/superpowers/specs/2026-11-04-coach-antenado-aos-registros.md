# Spec: coach "antenado" ao que o usuário registra

**Data:** 04/11/2026 · **Origem:** feedback de cliente (texto; o vídeo citado não chegou)

## O relato

> Fui registrar o jantar do meu filho e não era carne suína, era salmão. Até aí tudo bem porque
> a IA tá aprendendo, certo? Mas fui conversar com o mentor para analisar minha refeição e foi
> responder sobre algo que perguntei na semana passada. O mentor não deveria estar "antenado" ao
> que registro para orientar? Nesse caso eu gostaria de dizer que não era carne suína e sim
> salmão. Aí perguntaria se, baseado no mesmo peso, quais seriam as informações para que eu
> pudesse editar no registro.

O scanner errar o alimento é aceitável e o próprio cliente aceita. O defeito é o coach:

1. **Não vê o que foi registrado.** O contexto do coach (`formatUserContext`) traz só a
   *quantidade* de itens do diário (`diário livre: 2 item(ns)`): nem nome, nem peso, nem
   valores. "Analisa minha refeição" não tem o que analisar.
2. **Não sabe quando cada mensagem aconteceu.** O histórico guarda só `{role, content}`, e a
   conversa é uma só, retomada dias depois. Para o modelo, uma pergunta da semana passada e a
   mensagem de agora são vizinhas na mesma conversa. Por isso ele respondeu ao assunto antigo.
3. **Não consegue corrigir o registro.** Mesmo sabendo os valores do salmão, o usuário teria
   de editar à mão no Diário.

## Outras falhas da mesma família (coach desligado dos dados do usuário)

Levantadas lendo `chat-context.ts`, `chat.service.ts` e as telas do Diário e da Evolução:

| ID | Falha | Decisão |
|---|---|---|
| A1 | Coach não vê nome, peso nem valores do que foi registrado hoje | Corrigir |
| A2 | Coach não sabe a data das mensagens; mistura assunto antigo com o atual | Corrigir |
| A3 | Coach não consegue corrigir um registro errado | Corrigir |
| A4 | Coach não conhece o peso registrado na Evolução, só o do cadastro | Corrigir |
| A5 | No Diário, corrigir um alimento errado exige saber os valores de cabeça; não há caminho para pedir ao coach | Corrigir (atalho "Corrigir com o coach") |
| A6 | O scanner não guarda a confiança da estimativa; o coach não sabe que um item era incerto | Fora (exige migração; registrar) |
| A7 | Mudar o número de refeições refaz a semana inteira | Fora (já registrado em 28/10) |

## Comportamento esperado

### A1 — O coach vê os registros do dia
O contexto ganha a lista do diário de hoje, depois das linhas numéricas:

```
Registros de hoje no diário (mais recentes primeiro):
- [ref m1a2b3] 20:14 Carne suína grelhada — 180 g · 420 kcal · P 38 g · C 0 g · G 29 g
- [ref 9f8e7d] 12:30 Arroz com feijão — 250 g · 330 kcal · P 11 g · C 60 g · G 4 g
```

- No máximo 8 itens, os mais recentes primeiro. `ref` são os 6 primeiros caracteres do id,
  usados pela correção (A3).
- Registro impossível continua fora (regra de 28/10).
- As refeições do plano concluídas aparecem pelo nome.
- Instrução: quando o usuário falar de "minha refeição", "o que eu comi" ou "o jantar", use
  esta lista; sem lista, diga que não há registro hoje.

### A2 — O coach responde à mensagem de agora
- Cada mensagem nova é gravada com o horário (`at`). Mensagens antigas, sem `at`, continuam
  válidas.
- Para o modelo, cada mensagem com `at` vai com o prefixo `[dd/mm hh:mm]`, no fuso do app.
- Se a última atividade da conversa (`chat_history.updated_at`) foi há mais de 6 horas, entra
  antes da mensagem nova um marcador, só para o modelo: `[Retomada em dd/mm às hh:mm — as
  mensagens acima são de conversas anteriores]`. Isso cobre também o histórico antigo, sem `at`.
- Instrução fixa: responda sempre à **última** mensagem do usuário; assunto antigo só volta se
  ele pedir.
- O app nunca vê os prefixos nem o marcador.

### A3 — O coach corrige um registro
Nova tool `update_logged_meal`:

| Campo | Regra |
|---|---|
| `meal_ref` | `ref` de um item da lista de A1 |
| `name` | novo nome |
| `calories`, `protein`, `carbs`, `fat`, `fiber` | valores **para o mesmo peso** do registro |
| `message_to_user` | confirmação para o usuário |

- **Quando chamar:** só depois que o usuário confirmar a correção. O fluxo esperado é este:
  1. O usuário diz: "não era suína, era salmão".
  2. O coach responde com os valores do salmão para os mesmos 180 g e pergunta se pode
     atualizar o registro.
  3. Com o "sim", o coach chama a tool.
- **Servidor:**
  - o registro tem que ser do usuário e de hoje ou de ontem;
  - o peso não muda;
  - os valores passam pelos tetos de `MEAL_LIMITS`;
  - os macros não podem pesar mais que o alimento;
  - se a kcal estiver mais de 25% longe de 4P+4C+9G, ela é recalculada pelos macros.
- Ref inexistente ou valor impossível: nada é gravado e o coach explica em texto.
- A resposta traz `meal_updated: { id, date }`. O app recarrega o Diário e a tela Hoje.

### A4 — Último peso da Evolução
O contexto inclui o registro mais recente de `weight_entries` (`Último peso registrado: 79 kg em
02/11`), dentro da faixa plausível. Se for diferente do peso do cadastro, o coach usa o mais
recente.

### A5 — "Corrigir com o coach" no Diário
Na edição de uma refeição, o link **"Não sabe os valores? Corrija com o coach"**:
1. fecha o modal;
2. abre o Coach com a mensagem pronta (`Corrigir o registro "Carne suína grelhada" (180 g): na
   verdade era `);
3. deixa o cursor no fim do texto, para o usuário completar e enviar.

## Aceite
- [ ] Com um item "Carne suína grelhada · 180 g" registrado hoje, o contexto do coach traz
      nome, peso, valores e `ref`.
- [ ] Conversa parada há mais de 6 h: o modelo recebe o marcador de retomada antes da mensagem
      nova; mensagens novas vão com `[dd/mm hh:mm]`; o app não vê nada disso.
- [ ] Tool com ref válida: o registro muda de nome e de valores, o peso se mantém e a
      resposta traz `meal_updated`. Ref de outro usuário, de 3 dias atrás ou inexistente: nada
      muda.
- [ ] Tool com 999 g de proteína em 180 g: recusada, nada gravado.
- [ ] O contexto traz o último peso da Evolução.
- [ ] Do modal de edição, "Corrija com o coach" abre o Coach com o texto pronto.
- [ ] O eval de decisão de tool ganha dois casos: "não era suína, era salmão" → **sem** tool;
      "sim, pode atualizar" → tool. Ele precisa de chave de IA, então roda fora desta máquina.

## Riscos
- O modelo pode chamar `update_logged_meal` sem confirmação. Mitigação: instrução explícita,
  validação no servidor e caso no eval. Pior caso: um registro do próprio usuário corrigido, e
  ele desfaz editando.
- O contexto fica maior, porque entram até 8 linhas. O corte por linha de `CONTEXT_MAX_CHARS`
  passa a 2.400 caracteres.
