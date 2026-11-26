# Pente fino, lote 8: correções da revisão da branch integrada

Data: 26/11/2026. Base: `fix/pente-fino-integrado` `bd6c46a`.

Origem: revisão externa da branch integrada (feita sobre `595926a`) comparada com `origin/main` `4b6d53d`. A revisão aponta três regressões introduzidas pela branch e quatro correções que ficaram incompletas.

Plano: [2026-11-26-pente-fino-revisao-integrada.md](../plans/2026-11-26-pente-fino-revisao-integrada.md).

**Regra deste lote:** nada se corrige sem antes ser reproduzido. Cada item começa com um teste que falha no estado atual (`bd6c46a`). Se não for possível reproduzir porque o lote 7 já resolveu ou porque a premissa está errada, o item fica registrado como "não reproduzido", com o motivo, e não é alterado.

## Regressões

### R1 (alta). Recarga paga sem crédito quando a flag é desligada e religada

**Onde:** `backend/src/modules/subscriptions/asaas-webhook.service.ts`, no ramo `!p.subscription`.

**Problema:** com `CREDIT_PURCHASES_ENABLED=false`, o evento de cobrança avulsa é **registrado** em `payment_webhook_events` e ignorado. Quando a flag volta e o Asaas reentrega o evento, ele é tratado como `duplicate`. O mesmo acontece com estornos.

**Correção:** a flag passa a controlar só a criação de checkout. O processamento dos eventos de compra depende de a tabela existir. Na mesma transação, `to_regclass('public.credit_purchases')`:
- se a tabela existe, processa normalmente, com a flag ligada ou desligada;
- se a tabela não existe (027 não aplicada), só registra, como no P6.

**Aceite:**
- Com Postgres: compra pendente, flag desligada, chega `PAYMENT_CONFIRMED`. O resultado é crédito aplicado.
- Com a flag desligada e estorno, o estorno é aplicado.
- Sem a tabela, o evento devolve `'ignored'` sem 500. Isso é o P6 e continua verde.

### R2 (alta). Uma conta aposenta a tentativa pendente de outra

**Onde:** `app/src/shared/services/operation-requests.ts`, em `acknowledgeRequest`.

**Problema:** `acknowledgeRequest` percorre o mapa `active`, que é global ao runtime. Na primeira mensagem o escopo é `null`. Um reconhecimento da conta B marca como `superseded` as pendências da conta A. Quando A volta e tenta de novo, recebe chave nova. Se o primeiro envio já tinha sido cobrado, há risco de cobrança dupla.

**Correção:**
- Pendências em memória (`active`, `superseded` e `completed`) passam a ser isoladas por `userId`, com chave composta ou um Map por dono.
- `acknowledgeRequest` só toca pendências do mesmo dono.
- Na primeira mensagem (escopo `null`), só aposenta pendências do mesmo dono com escopo `null`. Conferir no código se isso continua seguro.

**Aceite:**
- A tem uma pendência "oi" sem conversa. B envia e reconhece a primeira mensagem dele. A volta e tenta "oi" de novo: o `Idempotency-Key` é igual ao da primeira tentativa de A.

### R3 (média). Envio novo herda o modo (voz/texto) de uma tentativa anterior

**Onde:** `app/src/shared/services/coach.service.ts:143-149` e a assinatura da pendência no `beginRequest`.

**Problema:** a busca da pendência considera conversa e texto, mas ignora `inputMode`.

**Correção:** `inputMode` entra na assinatura do payload da pendência de chat. Pendências antigas sem `inputMode` equivalem a texto.

**Aceite:**
- Com uma pendência de voz "sim" ainda ativa, um envio digitado "sim" ganha chave nova e sai sem `input_mode`.
- O inverso também vale: pendência digitada e envio por voz.
- O retry (`retryLastAction`) continua reaproveitando a chave e o modo da própria pendência.

## Correções incompletas

### R4 (média). O cartão do coach ainda marca a refeição do plano no dia errado

**Onde:** `backend/src/modules/diets/diets.service.ts`, no toggle e no `completed_at`.

**Problema:** o app já envia `date`, mas o backend grava `completed_at = now()`. Um cartão de segunda confirmado na terça devolve sucesso e conta para a sequência de segunda, mas o plano de segunda continua mostrando a refeição como pendente.

**Correção:**
- Quando `date` for anterior a hoje (no fuso de São Paulo ou no fuso do cliente, se o serviço já recebe o offset), `completed_at` passa a ser um instante dentro daquele dia local, por exemplo 12:00 em São Paulo.
- O W-A deve ler `completedOnDate` no app e a regra do Dashboard antes, para que a refeição apareça concluída **no dia da proposta**.
- Datas futuras ficam recusadas.
- Datas muito antigas também ficam recusadas. Fixar o limite pelo que o cartão aceita hoje, por exemplo ontem.

**Aceite:**
- Teste: cartão de segunda tocado na terça. O `completed_at` cai em segunda local e a refeição aparece concluída no plano de segunda.
- Hoje continua igual.

### R5 (alta). Dados da conta anterior reaparecem depois do logout

**Onde:** stores do app (coach, evolução, dieta e feed).

**Problema:**
- O coach confere a sessão antes de recarregar peso e dieta, mas os `load()` de `useWeightStore` e do store de dieta gravam o resultado sem conferir a sessão de novo.
- No feed, publicar, curtir e comentar também não conferem a sessão depois do `await`.

**Correção:**
- Usar `captureSessionOwner` e `isCurrentOwner` dentro de cada `load()` dos stores de peso/evolução e de dieta, antes do `set`.
- Fazer o mesmo nas ações do feed: publicação, curtida, rollback da curtida, comentários e o rollback deles.
- Varrer os outros stores que fazem `set` depois de `await`, sem guarda (perfil, diário, amigos), e corrigir os que tiverem a mesma lacuna.
- Listar no relatório o que foi varrido.

**Aceite:** para cada store corrigido, um teste com a requisição pendente, troca de sessão e depois a resolução. O store fica vazio ou no estado inicial.

### R6 (média). Duas refeições simultâneas contam o mesmo dia duas vezes na sequência

**Onde:** `update_user_streak` em `014_spec_fixes.sql` e a chamada em `diets.service.ts`.

**Problema:** a função lê a última data e incrementa sem travar a linha. Duas conclusões concorrentes podem levar a sequência de 6 para 8 ou duplicar o post de 7 dias.

**Correção:**
- Migration `032_user_streak_lock.sql`: `CREATE OR REPLACE FUNCTION update_user_streak` com `SELECT … FOR UPDATE` no perfil, ou um `UPDATE` atômico condicional à data.
- A decisão de publicar o marco (lote 3, R2) passa a usar o valor devolvido ou travado na mesma transação. O teste de duas conclusões concorrentes deve gerar um post só.
- Não editar a 014.
- Registrar a 032 nos harnesses que carregam a 014.

**Aceite (Postgres, duas conexões):**
- Duas conclusões concorrentes no mesmo dia, com a sequência em 6: o resultado é 7, com um post só.
- Duas conclusões em dias consecutivos continuam funcionando.

### R7 (média). Conversa antiga com histórico corrompido dá 500 ao abrir

**Onde:** `backend/src/modules/chat/chat.service.ts` (leitura e escrita do histórico) e `chat-history.integration.test.ts`.

**Problema:** os históricos antigos têm elementos que são strings serializadas dentro do array de mensagens, por exemplo `["<json do histórico>", {marker}]`. Esses elementos chegam à API e ao modelo sem `role` e `content` válidos.

**Correção:**
- Na leitura, normalizar:
  - todo elemento string que seja um JSON de array ou de mensagem é expandido;
  - tudo o que não for uma mensagem válida (`role` e `content` string) é descartado;
  - a ordem é preservada.
- Na próxima gravação, o array normalizado substitui o corrompido, numa reparação preguiçosa.
- Aplicar a mesma normalização em todo leitor do histórico: GET da conversa, `loadHistory` e o contexto do coach (grep `chat_history`).

**Aceite:**
- Teste de integração com uma linha `["<json de 3 mensagens>", {"role":"system",...marker}]`: o GET devolve 200 e o histórico completo e válido, conferindo **todas** as mensagens e não só as duas últimas.
- Uma gravação seguinte deixa a linha como array de objetos.

## Limites

- Nada nativo.
- Nenhuma chamada a serviço real.
- A migration 032 não é aplicada no remoto.
