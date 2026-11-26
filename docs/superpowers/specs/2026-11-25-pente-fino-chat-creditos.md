# Pente fino: núcleo do chat, voz, geração de dieta e motor de créditos

Data: 25/11/2026. Base: `origin/main` `4b6d53d` (PR #104). Branch: `fix/pente-fino-6`.
Origem: auditoria do loop de pente fino. O ledger está em `docs/qa/pente-fino-ledger.md`, na branch `fix/pente-fino-1`.
Os achados F1, F2, F4, F5, F6 e F7 foram reproduzidos com testes descartáveis
(`/private/tmp/claude-501/pente-fino-audit-F/`). F3 e F8 foram confirmados lendo o código.
Plano: [2026-11-25-pente-fino-chat-creditos.md](../plans/2026-11-25-pente-fino-chat-creditos.md).

## Requisitos

### R1. F1: chave de uma mensagem que falhou não é reaproveitada para sempre (média-alta)

Arquivos: `app/src/shared/services/operation-requests.ts:60-65` e `coach.service.ts:129`.

A pendência de chat que não foi entregue continua servindo para o retry imediato e para a recuperação em
Créditos. Ela deixa de ser reaproveitada por um envio **novo** com o mesmo texto nos seguintes casos:
- quando outra mensagem da mesma conversa foi entregue e reconhecida depois dela (`acknowledge`);
- quando ela é mais velha que uma janela curta (sugestão: 10 min, igual ao lease do servidor; conferir o
  valor em `credits.service.ts`).

Nesses casos o envio novo ganha chave nova. A pendência antiga continua listada para recuperação, sem
ser reaproveitada.

**Aceite:**
1. "sim" falha por erro de rede.
2. "quero almoçar" é entregue e reconhecido.
3. "sim" de novo usa um `Idempotency-Key` diferente do primeiro.

O retry imediato de "sim", sem nada entre as tentativas, continua usando a mesma chave.

### R2. F2: retry de mensagem de voz reenvia `input_mode` (média)

O `input_mode` (e o que mais entra no hash do payload no servidor) é guardado na pendência, como já
acontece com `date`, e reenviado pelo `retryLastAction`. No app, `IDEMPOTENCY_CONFLICT` passa a ser
rejeição definitiva, o que libera a chave.

**Aceite:**
- Depois de uma falha de voz, o `retryLastAction` envia `input_mode: 'voice'` com a mesma chave.
- Um 409 `IDEMPOTENCY_CONFLICT` faz o próximo envio sair com chave nova.

### R3. F3: conta ilimitada também tem proteção de replay (média)

Arquivo: `backend/src/modules/credits/credits.service.ts:169-173,197`.

Para carteira `unlimited`, o `runCreditOperation` grava a operação e o lease normalmente, e liquida com
custo 0, sem débito. O replay, o `by-key` e o lease de conversa passam a valer igual para todo mundo.
Conferir os CHECKs do ledger e da operação para custo 0. Se um CHECK impedir, a operação de custo 0 não
gera linha no ledger.

**Aceite:** num teste de integração com Postgres, dois `runCreditOperation` com a mesma chave para um
usuário ilimitado chamam `infer` uma vez só, e o saldo não muda. `by-key` devolve a operação.

### R4. F4: turno de geração de dieta só persiste na liquidação (baixa-média)

Arquivo: `chat.service.ts:713-797` (`handleDietGeneration`).

A escrita do histórico, o `createDietJob` e o UPDATE do perfil passam para o `persist(tx)` da liquidação,
como nos outros ramos. Se a liquidação falhar (`OPERATION_EXPIRED`), nada disso fica gravado.

**Aceite:** com `runCreditOperation` mockado para rodar `infer` e lançar `OPERATION_EXPIRED` antes do
`persist`, não há insert em `diet_jobs` nem em `chat_history`.

### R5. F5: argumento malformado de `collect_diet_data` vira erro de IA (baixa)

Arquivo: `chat.service.ts:702`.

O `JSON.parse` fica protegido. Em caso de falha, segue para `describeInvalidFields` (o coach pede os
dados de novo) ou lança `AI_TRUNCATED`, conforme o padrão dos outros ramos.

**Aceite:** com argumentos truncados, o erro é um `AppError` com código de IA, e não `SyntaxError` nem 503.

### R6. F6: fala não toca depois de parada nem sobrepõe outra (baixa-média)

Arquivo: `app/src/shared/services/voice-player.service.ts:70-80`.

Um token de sequência é capturado antes do `await setAudioModeAsync`. Se mudou depois do await (houve
`stopSpeech` ou outro `playSpeech`), não cria nem toca o player.

**Aceite:**
- A sequência `playSpeech`, `stopSpeech` e depois resolução não chama `play`.
- Dois `playSpeech` concorrentes deixam só o último tocando, e o primeiro recebe `remove`.

### R7. F7: banner de dieta não falha enquanto o servidor ainda gera (baixa)

Arquivo: `app/src/features/coach/store.ts:788-792`.

As respostas "ocupado" (200 sem progresso, lock de outro passo) não contam em `MAX_STEPS`. O loop passa a
ter também um orçamento de tempo maior que o lock do servidor (300 s) somado à geração. Conferir os valores
em `jobs.service.ts`.

**Aceite:** um `stepJob` que devolve `running` sem progresso por 30 chamadas não marca `failed`. O loop
ainda termina quando o orçamento de tempo acaba.

### R8. F8: marcador de dieta concluída não é sobrescrito pelo chat (baixa)

Arquivos: `chat.service.ts:904-910` (`persistHistory`) e `jobs.service.ts:865-871`.

O `persistHistory` anexa só o turno novo (`messages || $novo`) em vez de regravar o array lido antes da
chamada ao modelo. O teto de 400 mensagens continua valendo; aplicar o corte no SQL.

**Aceite:** num teste com Postgres, a sequência `loadHistory`, `finalizeJob` e liquidação do chat mantém
o `DIET_COMPLETED_MARKER`.

## Limites

Nenhuma chamada real à IA. Nada nativo muda. Os testes de Postgres rodam só num banco local descartável.
