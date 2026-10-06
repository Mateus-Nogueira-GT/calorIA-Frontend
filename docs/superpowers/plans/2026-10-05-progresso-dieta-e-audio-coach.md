# Progresso da dieta + áudio no coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barras de progresso (refeições e geração da dieta) que nunca congelam, e conversa com o mentor por áudio (Whisper).

**Architecture:** Backend Fastify + postgres.js (vitest + fake-fastify), app React Native 0.85 bare com módulos Expo SDK 56 (jest + RNTL). Tasks 1–3 (só JS) saem num PR próprio → OTA. Tasks 4–5 (nativo) saem num segundo PR → build de loja.

**Tech Stack:** TypeScript, Fastify, Zod, OpenAI SDK 4.x, Zustand, expo-audio, expo-file-system.

**Spec:** `docs/superpowers/specs/2026-10-05-progresso-dieta-e-audio-coach.md`

## Global Constraints

- Tasks 1–3: NADA nativo (nenhum arquivo em app/android, app/ios, app.json, nenhuma dependência nova) — vão por OTA.
- Tasks 4–5: dependência nativa permitida só `expo-audio` (+ `expo-file-system` explícito no package.json, versão já instalada `~56.0.11`); instalar com versão compatível com Expo SDK 56.
- Textos em pt-BR. Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gates: `cd backend && npm run typecheck && npm test`; `cd app && npm run type-check && npm test`; o build web (`cd app && npm run build:web`) continua compilando nas tasks 4–5.
- Job velho: sem progresso há mais de **10 min** (`updated_at`) → `failed` com código `STALE`.
- Step: `MAX_DAY_ATTEMPTS × timeout do generateDay` < **270 s**, `maxRetries: 0` na chamada de dieta.
- Áudio: máx. **60 s**; corpo máx. **3 MB** base64; rate limit **10/min**; env `OPENAI_TRANSCRIBE_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` (default `whisper-1`); `language: 'pt'`.

## Review Focus

1. Job que já está preso em produção (running há horas, lock vencido) → na próxima leitura vira `failed` e o usuário consegue "Tentar novamente" e terminar a dieta.
2. 429 de cota no meio da geração → app para em segundos com mensagem clara, não em 80 min.
3. Toggle de refeição durante pull-to-refresh → contagem final correta.
4. Usuário nega o microfone → alerta com instrução; nenhum crash; texto continua funcionando.
5. Backend sem `OPENAI_TRANSCRIBE_API_KEY` → 503 tratado no app com mensagem amigável; chat por texto intacto.

---

### Task 1: Barra de refeições — regressão + corrida (app)

**Files:** `app/src/features/diet/store.ts` (`loadCurrent` ~L31, `toggleMealComplete` ~L44-97), `app/src/features/diet/hooks/useDiet.ts`, tests `app/src/features/diet/store.test.ts` (+ hook test se fizer sentido).

- [ ] Testes (falham onde há bug): (a) toggle de refeição não concluída → `meals[i].completedToday === true` e `useDiet().completedCount` sobe 1 (render do hook via RNTL `renderHook`); (b) refeição com `completedAt` de semana passada e `completedToday: false`, servidor `{ is_completed: true }` → conta sobe; (c) `loadCurrent` resolvido no meio de um toggle (servidor do GET ainda sem a marcação) → depois do toggle concluir, `completedToday === true` e contagem correta.
- [ ] Implementar: em `loadCurrent`, se `togglingMealId` está setado, preservar `completedToday`/`completedAt` dessa refeição do estado atual ao montar o novo plano.
- [ ] Gates do app; commit `fix(diet): barra de refeições não perde a marcação durante refresh`.

### Task 2: Geração da dieta nunca fica presa (backend)

**Files:** `backend/src/modules/diets/jobs.service.ts` (generateDay ~L355-400, processJobStep ~L440-520, finalize ~L456 e ~L654-664, retryJob ~L315, createDietJob ~L133, getJob/getActiveJob/getPendingJob), `backend/src/modules/diets/diets.routes.ts` (rotas de job/step), tests `backend/src/modules/diets/process-job-step.test.ts` (+ novo arquivo se preciso).

**Interfaces produzidas:** status de job pode voltar `failed` com `error_code` (ou campo equivalente já existente) `'AI_QUOTA_EXCEEDED' | 'STALE' | 'STEP_TIMEOUT'`, e mensagem amigável em pt-BR. Conferir o schema de resposta do status do job e expor o código se ainda não existir (`errorCode: string | null`) — a Task 3 lê esse campo.

- [ ] Testes: (a) `/step` com cota estourada → job vira `failed` com `AI_QUOTA_EXCEEDED`, resposta 200 com status `failed` (ou 429 + job `failed` — escolher um e documentar no report; a Task 3 trata os dois); (b) job `running` com `updated_at` > 10 min e lock vencido → `getJob`/`getActiveJob`/`/step` devolvem `failed` `STALE`; (c) `retryJob` num job `failed STALE` volta a `running` mantendo `days_completed` (retoma do dia onde parou); (d) `generateDay` é chamado com `maxRetries: 0` e timeout que respeita o orçamento; estouro de tempo → `failJob` com `STEP_TIMEOUT`; (e) `dayNumber > total_days` executa a finalização (draft → active, arquiva a anterior).
- [ ] Implementar o mínimo para cada um. Expiração: constante `STALE_JOB_MS = 10 * 60 * 1000`, aplicada num helper único usado pelas leituras (UPDATE condicional `WHERE status IN ('pending','running') AND updated_at < NOW() - interval`), sem job em background.
- [ ] Gates do backend; commit `fix(diets): geração de dieta falha de forma visível em vez de congelar`.

### Task 3: App trata falha da geração (app)

**Files:** `app/src/features/coach/store.ts` (`runDietGeneration` ~L182-249, `retryDietGeneration` ~L264), `app/src/features/coach/components/DietJobBanner.tsx`, `app/src/shared/services/diet.service.ts` (tipo do job: `errorCode`/mensagem), tests `app/src/features/coach/store.test.ts`, `DietJobBanner` test.

**Consome:** status `failed` com `errorCode` e mensagem (Task 2).

- [ ] Testes (fake timers): (a) `stepJob` rejeita com 429 → loop para, `dietJob.status === 'failed'`, mensagem de cota; (b) `stepJob` devolve status `failed` → para e mostra a mensagem do servidor; (c) erro de rede/5xx repetido sem progresso → falha após 3 rodadas sem progresso (não 30); (d) `retryDietGeneration` com um loop em andamento não cria um segundo loop (single-flight por `jobId`); (e) banner mostra "Ainda trabalhando no dia N…" após uma rodada lenta e a falha com "Tentar novamente".
- [ ] Implementar.
- [ ] Gates do app; commit `fix(coach): geração da dieta para e avisa quando falha`.

**Depois da Task 3 (controller):** revisão final das tasks 1–3, PR, CI, merge → OTA (chega aos builds 17/26).

### Task 4: Endpoint de transcrição (backend)

**Files:** create `backend/src/modules/chat/transcribe.service.ts` (+ test), modify `backend/src/modules/chat/chat.routes.ts`, `backend/src/modules/chat/chat.schemas.ts`, `backend/src/shared/env.ts`, `backend/src/shared/ai-usage.ts` (`AiFeature` += `'transcribe'`), create `backend/supabase/migrations/021_ai_usage_transcribe.sql`, `backend/.env.example`.

**Interfaces produzidas:** `POST /chat/transcribe` body `{ audio: string (base64, sem prefixo data:), mimeType: 'audio/m4a'|'audio/mp4'|'audio/aac'|'audio/webm' }` → 200 `{ text: string }`; erros 400 (validação), 401, 413/400 (tamanho), 422 `EMPTY_TRANSCRIPTION`, 429 (`TOO_MANY_REQUESTS`|`AI_QUOTA_EXCEEDED`), 502 `TRANSCRIBE_FAILED`, 503 `TRANSCRIBE_UNAVAILABLE`.

- [ ] Testes do service com cliente OpenAI fake (injetado): chave ausente → 503; texto vazio/só espaços → 422; erro da OpenAI → 502; sucesso → texto `trim()`; chama `audio.transcriptions.create` com `model` do env, `language: 'pt'` e um `File` com o nome/extensão coerentes com o mimeType; registra uso `feature: 'transcribe'`. Teste de rota: corpo > limite → 413/400; sem JWT → 401.
- [ ] Implementar: cliente `new OpenAI({ apiKey: env.OPENAI_TRANSCRIBE_API_KEY, maxRetries: 1, timeout: 30_000 })` criado sob demanda (não registrar no plugin do OpenRouter); `toFile(Buffer.from(audio,'base64'), 'audio.m4a', { type })` do SDK; `bodyLimit` 3.5 MB na rota; `checkDailyQuota` antes.
- [ ] Migration 021: recria o CHECK de `ai_usage.feature` incluindo `'transcribe'` (DROP CONSTRAINT IF EXISTS pelo nome real — conferir em 015 — e ADD).
- [ ] Gates do backend; commit `feat(chat): transcrição de áudio para o coach (Whisper)`.

### Task 5: Microfone no chat do coach (app, nativo)

**Files:** `app/package.json` (+ lock), `app/ios/calorIA/Info.plist`, `app/android/app/src/main/AndroidManifest.xml`, create `app/src/shared/services/voice-recorder.service.ts` + `.web.ts`, create `app/src/features/coach/hooks/useVoiceMessage.ts` (ou similar), modify `app/src/features/coach/components/ChatInput.tsx`, `app/src/shared/services/coach.service.ts` (`transcribe(audioBase64, mimeType)` com timeout 45 s), jest mocks (`moduleNameMapper`/`__mocks__` para `expo-audio` e `expo-file-system`), tests `ChatInput.test.tsx` + hook test.

**Consome:** `POST /chat/transcribe` (Task 4).

- [ ] Instalar `expo-audio` e declarar `expo-file-system` com versões do SDK 56 (`npx expo install expo-audio expo-file-system` ou equivalente; conferir peer de `expo@~56`). Permissões: `NSMicrophoneUsageDescription` = "O CalorIA usa o microfone para você falar com seu mentor." no Info.plist; `<uses-permission android:name="android.permission.RECORD_AUDIO"/>` no AndroidManifest (mesma formatação das linhas vizinhas; ver aviso em docs/ota-updates.md sobre não reformatar o manifest).
- [ ] Testes (com mocks): campo vazio → botão microfone (`testID="chat-mic-btn"`); com texto → botão enviar; tocar mic com permissão concedida → estado gravando (cronômetro, botão parar `chat-mic-stop-btn`, cancelar `chat-mic-cancel-btn`); parar → `coachService.transcribe` chamado com base64 e depois `onSend(texto)`; cancelar → nada enviado; 60 s → para e envia sozinho; permissão negada → alerta e nada gravado; transcribe 503 → alerta "Áudio indisponível no momento"; 422 → "Não entendi o áudio, tenta de novo"; durante transcrição o input fica desabilitado com indicador.
- [ ] Implementar com `expo-audio` (`AudioModule.requestRecordingPermissionsAsync`, `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })`, recorder com preset de baixa qualidade m4a/AAC mono) e leitura base64 via `expo-file-system` (API `File` do SDK 56). `.web.ts`: `isVoiceSupported = false`, ChatInput não mostra o mic no web.
- [ ] Gates do app + `npm run build:web`; commit `feat(coach): conversar com o mentor por áudio`.

**Depois da Task 5 (controller):** revisão final das tasks 4–5, PR, CI, merge, `eas build` iOS+Android, conferir runtime igual ao do OTA do merge, submeter iOS (Android: subir .aab manualmente ou com chave de serviço do Google).
