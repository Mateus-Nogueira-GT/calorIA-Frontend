# Barras de progresso da dieta + conversar com o mentor por áudio

Data: 2026-10-05 · Branch: `feat/progresso-dieta-audio-coach`

Três feedbacks. A e B vão por OTA (só JS) + deploy do backend. C exige **build
de loja** (módulo nativo de áudio + permissão de microfone).

## A — "X de Y refeições concluídas" não atualiza

**Investigação:** o código atual (e o do build de 20/09 instalado) conta pelo
mesmo campo que o card usa (`completedToday`). A causa real era o bug corrigido
hoje (F4, PR #56): todo toggle dava 500, o store desfazia o otimista e a barra
nunca andava. O backend corrigido já está em produção.

**O que fazer mesmo assim (blindagem):**
- Teste de regressão ponta a ponta no app: marcar refeição → `useDiet().completedCount`
  sobe; refeição com `completedAt` antigo e `completedToday: false` + servidor
  devolvendo `{ is_completed: true }` → contagem sobe.
- Corrida: `loadCurrent` (pull-to-refresh) durante um toggle sobrescreve o
  otimista. `loadCurrent` preserva o estado da refeição em `togglingMealId`.

## B — "Gerando sua dieta — dia N de 7" congela

**Causa raiz (investigada):** o app conduz a geração chamando
`POST /diets/jobs/:id/step` dia a dia (`coach/store.ts` `runDietGeneration`).
Várias falhas do backend deixam o job `running` com o mesmo `days_completed`
e nunca `failed`; o app trata todo erro igual (espera 160 s calado e tenta de
novo, até 30 rodadas ≈ 80 min–2,5 h) e nada no servidor expira job velho:
1. **429 `AI_QUOTA_EXCEEDED`** no `/step` (cota diária de tokens) — antes do
   lock, sem `failJob`.
2. **Função morta pela Vercel em 300 s**: `generateDay` tem timeout 120 s mas o
   SDK da OpenAI repete 2× (default `maxRetries`) e há 2 tentativas por dia →
   pode passar de 300 s; o lock fica preso e o job `running` para sempre.
3. **500 genérico** antes do lock/`failJob`.
E o job preso nunca sai: `retryJob` só aceita `failed`, `createDietJob` reusa
o job `running`, o chat esconde a tool com job pendente, e todo boot retoma.

**Design:**
- Backend
  - Orçamento de tempo por step: `generateDay` com `maxRetries: 0` e timeout
    tal que `MAX_DAY_ATTEMPTS × timeout` < 270 s; estourou → `failJob`.
  - 429 de cota no `/step` → `failJob` com código `AI_QUOTA_EXCEEDED` (mensagem
    "Limite diário de IA atingido. Tente amanhã.") e responde o status `failed`.
  - Job velho expira: `running`/`pending` sem progresso há mais de 10 min
    (`updated_at`) vira `failed` (`STALE`) ao ser lido (`getJob`,
    `getActiveJob`, `getPendingJob`, `/step`). `retryJob` aceita `failed`.
  - Ramo `dayNumber > total_days` roda a mesma finalização (draft → active).
- App
  - No catch do step: erro 4xx (429/404/422) ou status `failed` → para e mostra
    falha com a mensagem do servidor; só erro de rede/5xx/timeout segue
    tentando, com no máximo 3 rodadas sem progresso (≈ 8 min) antes de falhar.
  - Banner mostra "ainda trabalhando no dia N…" quando uma rodada demora, e
    falha visível com botão "Tentar novamente" (já existe) em vez de congelar.
  - Loop single-flight por `jobId` (retry não abre um segundo loop).

## C — Conversar com o mentor por áudio

"Whisper Flow" interpretado como **OpenAI Whisper** (transcrição). O usuário
grava, o backend transcreve e o texto vai como mensagem normal do coach.

- **Backend** `POST /chat/transcribe` (JWT, rate limit 10/min, `checkDailyQuota`)
  - Corpo JSON `{ audio: base64, mimeType: 'audio/m4a' | 'audio/mp4' | 'audio/aac' | 'audio/webm' }`,
    máx. ~3 MB (60 s de m4a mono 32 kbps ≈ 250 KB; Vercel limita corpo a 4,5 MB).
  - Cliente OpenAI **direto** (`api.openai.com`), separado do OpenRouter:
    env `OPENAI_TRANSCRIBE_API_KEY` (obrigatória para o recurso) e
    `OPENAI_TRANSCRIBE_MODEL` (default `whisper-1`), `language: 'pt'`.
    Sem a chave → 503 `TRANSCRIBE_UNAVAILABLE`.
  - Resposta `{ text }`; texto vazio → 422 `EMPTY_TRANSCRIPTION`.
  - Uso registrado em `ai_usage` com `feature: 'transcribe'` (migration 021
    amplia o CHECK; o insert já é tolerante a falha antes da migration).
- **App**
  - `expo-audio` (SDK 56). Permissões: `NSMicrophoneUsageDescription` no
    Info.plist ("O CalorIA usa o microfone para você falar com seu mentor.") e
    `RECORD_AUDIO` no AndroidManifest.
  - `ChatInput`: com o campo vazio, o botão de enviar vira **microfone**. Toque
    inicia a gravação (indicador + cronômetro), toque de novo para e envia;
    botão de cancelar descarta. Limite de 60 s (para sozinho).
  - Envio: lê o arquivo em base64 (`expo-file-system`), `POST /chat/transcribe`,
    e chama o `sendMessage` existente com o texto — o usuário vê a própria fala
    transcrita como bolha.
  - Permissão negada → alerta explicando como liberar nas configurações.
  - Web: serviço `.web.ts` sem gravação; o microfone não aparece no web.
- **Entrega:** muda o fingerprint → **build de loja novo** (iOS e Android).
  O OTA desta entrega não chega aos builds 17/26. As partes A e B (só JS)
  chegam a eles. Por isso a ordem: A+B primeiro (PR/OTA próprio), C depois.

## Fora de escopo
- Resposta do mentor em áudio (TTS).
- Streaming de transcrição em tempo real.

## Ações do usuário
1. Criar chave na OpenAI e cadastrar `OPENAI_TRANSCRIBE_API_KEY` nas variáveis
   de ambiente da Vercel (produção).
2. Rodar `021_ai_usage_transcribe.sql` no SQL Editor do Supabase.
3. Conferir que as migrations 017 e 019 estão aplicadas em produção.
