# Diagnóstico: idempotência, scanner e sessões

HEAD: `f5ca5bf`. Apenas diagnóstico; nenhuma alteração em código de produção, banco, modelos ou `docs/ota-updates.md`. Não houve rede externa nem inferência paga.

## Execução reproduzível

Da raiz:

```sh
cd app
./node_modules/.bin/jest --config ../docs/qa/debug-2026-10-18/app-operation-jest.config.cjs --runInBand --no-cache
```

Resultado observado: **2 suítes, 9 testes intencionalmente vermelhos, 1,117 s**. Eles afirmam as propriedades de segurança desejadas; falham precisamente porque o defeito está presente. Saída integral em `app-operation-output.txt`. Há nove testes para cinco achados, pois os casos iniciais de seam foram depois confirmados com stores e autenticação reais.

`app-live-session-diagnostic.test.ts` importa os stores Zustand, `clearToken`/`setToken`, serviços e interceptores Axios reais. Apenas transporte e latência do AsyncStorage são locais/controlados. Tokens e dados são fixtures inventadas. `app-operation-diagnostic.test.ts` usa fixtures menores de identidade/storage para concorrência entre runtimes e erro de resposta ambíguo.

## 1. P1: salvar refeição de A após logout contamina o estado local de B

Fonte: `app/src/features/scanner/store.ts:115`, `:136`, `:149`.

Reprodução real de stores: iniciar `confirm()` em A; manter POST `/food-log` pendente; chamar `clearToken()` real; autenticar B e colocar nova foto no scanner; entregar a resposta da refeição A.

Observado: `useFoodLogStore` da sessão B recebe `meal-owned-by-A`, com nome e nutrientes privados de A. O scanner também volta ao estado inicial e perde a foto nova de B. A asserção `diário B === []` falha com uma refeição de A. O teste usa serviço e interceptor reais, sem simular os stores. A escrita no servidor continua vinculada à requisição autenticada original; o problema comprovado é vazamento de dados e sobrescrita no estado local.

Causa: `confirm()` não guarda identidade/geração no início nem valida depois de `Promise.allSettled`; acrescenta resultados no store global e limpa o scanner incondicionalmente. A proteção por geração existente em `analyze()` não cobre `confirm()`.

## 2. P1: resultado concluído após mudança de sessão perde a chave de recuperação

Fontes: `app/src/shared/services/coach.service.ts:124`, `scanner.service.ts:94`, `operation-requests.ts:118`.

Duas reproduções reais:

- Coach de texto, primeiro turno, `conversation_id=null`: iniciar envio A, logout real e login B, entregar resposta com novo ID. O store descarta corretamente a resposta antiga, mas `pendingRequests(A)` fica vazio e o ID novo não chega ao store. Diferentemente de uma conversa já conhecida, esta conversa inicial fica sem ID para o app consultar.
- Scanner com store e AbortController reais: entregar a resposta da foto, pausar a limpeza no AsyncStorage, logout real (que chama `scanner.clear()` e aborta o controller), login B e liberar a limpeza. A foto não entra na UI e `pendingRequests(A)` fica vazio. O aborto ocorre depois da entrega do transporte, portanto não protege esta janela.

As duas asserções de uma chave recuperável falham com **0 chaves**. Não é apenas teste direto do serviço sem sinal. A conclusão de cobrança pressupõe o sucesso da operação de backend representado pela resposta; o harness não debitou um banco real.

Causa: `finishRequest()` aposenta/remove a chave antes de o serviço validar se ainda pode entregar o resultado. A validação posterior lança cancelamento e o store rejeita a resposta, depois que a recuperação já foi apagada.

## 3. P1: interceptor pode associar payload de A às credenciais de B

Fontes: `app/src/shared/services/api.ts:33`, `:38`, `:42`; `scanner.service.ts:62` e `:85`.

Reprodução com auth/store/interceptor reais: depois do guard de sessão do serviço e antes do interceptor assíncrono original do Axios, executar logout/login reais em uma microtask controlada. O teste não substitui o interceptor de autenticação; envolve `api.post` apenas para inserir essa ordem de agendamento, mantendo o método original.

Observado no adapter local: **um POST** `/scanner/analyze` com a foto originada em A, `Authorization: Bearer fixture-B` e geração de sessão B. A asserção de zero envios falha. O interceptor lê a identidade atual e substitui as credenciais sem conhecer o proprietário original da operação. O guard depois da resposta evita exibir resultado, mas o envio já ocorreu.

Confirmação adicional no caminho real da UI: `useCoachStore.sendMessage()` de texto, que não recebe AbortSignal por padrão. O teste agenda logout/login reais no mesmo seam, conserva o `api.post` e o interceptor originais e observa POST `/chat/message` com texto privado de A e `Authorization: Bearer fixture-B`. O store retorna `false` e descarta o resultado, mas o envio cruzado já ocorreu. A asserção de zero envios falha com 1.

Limite: janela de concorrência reproduzida deterministamente; não foi medida sua frequência em aparelho. O teste insere somente a ordem de agendamento, sem substituir autenticação ou interceptor. No scanner com sinal, logout pode impedir o envio; a confirmação em coach de texto elimina essa ressalva para o achado no caminho de uso real.

## 4. P2: duas abas podem apagar metadados pendentes uma da outra

Fontes: `app/src/shared/services/operation-requests.ts:28`, `:31`, `:58`, `:76`.

Reprodução: dois módulos isolados representam duas abas do mesmo usuário compartilhando o mesmo storage. B inicia leitura antiga e aguarda; A grava/verifica uma foto; liberar a leitura antiga de B; B grava/verifica a conversa com o snapshot que não contém A.

Observado: ambas as chamadas concluem, mas `pendingRequests(A)` contém **1 operação em vez de 2**. `writes` serializa apenas dentro de cada runtime. A verificação de readback não torna o read/modify/write atômico entre abas.

Limite: harness de dois runtimes e storage compartilhado, sem navegador real. Aplica-se ao desenho de `localStorage` entre abas da mesma origem; não se atribui ao app nativo de processo único. Perde-se descoberta local de recuperação; não foi provado débito duplo por esta corrida.

## 5. Risco P2: HTTP 500 ambíguo aposenta a chave sem consultar a operação

Fonte: `app/src/shared/services/operation-requests.ts:146`, `:153`; backend trata erros inesperados como `INTERNAL_SERVER_ERROR` em `backend/src/server.ts:193`.

Reprodução do cliente: adapter simula resposta 500 `{error:'INTERNAL_SERVER_ERROR'}` após sucesso/commit remoto representado pela fixture; usuário repete a mesma foto.

Observado: dois POSTs usam **duas chaves diferentes**. A asserção de uma chave falha com 2. O código considera definitivo praticamente qualquer 5xx com campo `error`, não apenas falhas conhecidas e comprovadamente anteriores à liquidação.

Limite deliberado: prova a perda da garantia de retry no cliente sob uma resposta ambígua; **não prova débito duplo real nem demonstra neste harness um serializer falhando depois de um commit PostgreSQL real**. Não apresentar como cobrança duplicada observada. A existência de um código `error` não constitui evidência de que o backend liberou uma reserva.

## Prioridade sugerida

Corrigir primeiro a contaminação de estado em `confirm()` e a aposentadoria prematura de chave; depois vincular identidade/geração à requisição antes do interceptor. Tratar erros ambíguos com consulta/replay da chave e considerar storage por operação ou exclusão mútua entre abas. Estas são propostas de correção, não alterações executadas.
