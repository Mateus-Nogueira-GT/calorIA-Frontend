# Coach responde em áudio — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:executing-plans. Os passos usam checkbox (`- [ ]`).

**Objetivo:** quando o usuário manda áudio ao Coach, a resposta chega em texto e também é falada, tocando sozinha.

**Arquitetura:** `POST /chat/speech` fala a última resposta do Coach gravada no histórico, via OpenRouter `/audio/speech`. O app, depois de aplicar a resposta de uma mensagem de voz, busca o MP3 com uma requisição vinculada ao dono, salva em cache e toca com `expo-audio`.

**Stack:** Fastify/Zod/Vitest; React Native 0.85, Expo 56 (`expo-audio`, `expo-file-system`), Zustand, Jest.

**Spec:** [2026-10-21-coach-resposta-em-audio.md](../specs/2026-10-21-coach-resposta-em-audio.md)

## Restrições globais
- Nenhuma dependência nova, nada em `app/android` ou `app/ios`. O fingerprint precisa continuar `9a9173e…` (android) e `0aee9a0…` (ios).
- Sem débito de créditos: `speech_synthesis: 'free'`.
- Falha de TTS nunca vira erro visível nem bloqueia a conversa.

## Foco de revisão
- Logout enquanto o áudio está sendo gerado: nada é aplicado à conta seguinte. Testado na Task 3.
- Começar a gravar com uma resposta tocando: a reprodução para. Testado na Task 3.
- Conversa sem resposta do Coach (corrida de histórico): 404 `NO_REPLY_TO_SPEAK`, que o app trata em silêncio. Testado nas Tasks 1 e 3.
- Texto com mais de 4.000 caracteres: é cortado sem quebrar a chamada. Testado na Task 1.
- Mensagem digitada: nunca dispara o TTS. Testado na Task 3.

---

### Task 1: backend `POST /chat/speech`
**Arquivos:**
- Criar: `backend/src/modules/chat/speech.service.ts` e `speech.service.test.ts`; `backend/supabase/migrations/023_ai_usage_speech.sql`.
- Modificar: `chat.routes.ts`, `chat.schemas.ts`, `shared/env.ts` (`OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `COACH_SPEECH_ENABLED`), `shared/ai-usage.ts` (`AiFeature` passa a incluir `'speech'`), `shared/credit-ai-policy.ts` (`speech_synthesis: 'free'`).

**Produz:** `synthesizeLastReply(fastify, userId, conversationId, fetchImpl?) => Promise<{ audio: string; mimeType: 'audio/mpeg' }>` e `speechText(raw: string) => string`.

- [ ] Testes que falham, em `speech.service.test.ts` (fake fastify + fetch):
  - envia `model`, `voice`, `response_format: 'mp3'` e o `input` da **última** mensagem `assistant`, sem markdown, devolvendo base64;
  - conversa de outra conta: 404;
  - conversa sem resposta: 404 `NO_REPLY_TO_SPEAK`;
  - provedor responde 400: 503 `SPEECH_UNAVAILABLE`; responde 500 ou timeout: 502 `SPEECH_FAILED`;
  - `COACH_SPEECH_ENABLED=false`: 503 sem chamar o provedor;
  - `speechText` corta em até 4.000 caracteres, no fim de frase;
  - com a cobrança ligada, não é bloqueado pela política de tarifas.
- [ ] Implementar. A migration 023 copia o padrão da 021 e acrescenta `'speech'` ao CHECK.
- [ ] `npm test`, `tsc` e `biome` verdes. Commit.

### Task 2: serviço de reprodução no app
**Arquivos:**
- Criar: `app/src/shared/services/voice-player.service.ts` e `.web.ts`, com teste.
- Modificar: `app/__mocks__/expo-audio.js` (`createAudioPlayer`) e `app/__mocks__/expo-file-system.js` (`Paths`, `write`, `delete`).
- Modificar: `coach.service.ts` (`speak(conversationId, config?)`).

**Produz:**
- `isSpeechSupported: boolean`;
- `saveSpeech(base64: string): Promise<string>`, que devolve o uri;
- `playSpeech(uri: string, onEnd: () => void): Promise<void>`;
- `stopSpeech(): void`.

- [ ] Testes: `playSpeech` configura o modo de áudio (`playsInSilentMode: true`, `allowsRecording: false`) antes de tocar; uma segunda chamada para e libera o player anterior; `onEnd` dispara com `didJustFinish`; `stopSpeech` libera o player.
- [ ] Implementar e commit.

### Task 3: store, gravação e bolha
**Arquivos:**
- Modificar: `features/coach/store.ts` (campo `audioUri` em `StoreMessage`; `speakingMessageId`; `toggleSpeech(id)`; `stopSpeaking()`; fala depois de `sendMessage` com `voice`; `clear` para a reprodução).
- Modificar: `hooks/useVoiceMessage.ts` (`stopSpeaking` ao iniciar a gravação), `screens/CoachScreen.tsx` (repassa props à bolha; para no blur e no background) e `components/ChatBubble.tsx` (botão **Ouvir resposta / Parar**).
- Testes: `store.test.ts`, `ChatBubble.test.tsx` (novo), `useVoiceMessage.test.ts`.

- [ ] Testes que falham:
  - mensagem de voz aplicada: chama `speak` com a conversa, salva, marca `audioUri` e toca, com `speakingMessageId` igual ao id;
  - mensagem digitada: não chama `speak`;
  - logout antes do áudio chegar: nada é aplicado e nada toca;
  - `speak` rejeita: a mensagem fica sem `audioUri`, sem erro no store;
  - `toggleSpeech` alterna tocar e parar;
  - começar a gravar chama `stopSpeaking`;
  - a bolha com `audioUri` mostra o botão com rótulo acessível.
- [ ] Implementar. `npx jest`, `tsc` e fingerprint inalterado. Commit.

### Task 4: entrega
- [ ] PR, CI, merge: a API sai pela Vercel e o app por OTA nos 6 runtimes.
- [ ] Usuário aplica a migration 023 no Supabase (só telemetria e cota).
- [ ] Smoke em produção: `/api/chat/speech` sem token responde 401. Teste real no iPhone: mandar um áudio ao Coach e ouvir a resposta.
