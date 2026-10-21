# Coach responde em áudio quando o usuário manda áudio

Data: 21/10/2026. Base: main `2e8673f`.
Plano: [2026-10-21-coach-resposta-em-audio.md](../plans/2026-10-21-coach-resposta-em-audio.md).

## 1. Por que não estava ativo

O pedido nunca foi implementado. A spec de 05/10 (`2026-10-05-progresso-dieta-e-audio-coach.md`, "Fora de escopo: Resposta do mentor em áudio (TTS)") entregou só a ida: gravação, transcrição (Whisper via OpenRouter) e resposta **em texto**. A spec de 09/10 repetiu o corte ("Fora de escopo: TTS"). Não existe código, branch ou flag de resposta falada.

Na mesma investigação apareceu um incidente: com `CREDITS_ENFORCEMENT_ENABLED=true` (ligado em 21/10), a transcrição de voz, a geração de dieta e o scanner sem conta passaram a responder 503 `CREDIT_POLICY_UNAVAILABLE`. Isso foi corrigido no PR #76, que declarou esses recursos gratuitos. Esta spec segue a mesma regra para a síntese de voz.

## 2. Decisões de produto (21/10)

- **Quando:** só quando o usuário mandou **áudio**. Mensagem digitada continua só em texto.
- **Reprodução:** a resposta **toca sozinha** ao chegar. O texto continua na conversa, e a bolha da resposta falada ganha um botão **Ouvir resposta / Parar**.
- **Custo:** **sem custo extra em créditos**. A mensagem já é cobrada (1 crédito a cada 5 mensagens).

## 3. Requisitos

### Backend
- **R1:** `POST /chat/speech` com `{ conversation_id }`, autenticado. O servidor fala a **última resposta do Coach** gravada no histórico daquela conversa, e só se ela pertencer ao usuário. O cliente não envia texto livre, então o endpoint não serve como gerador de voz arbitrário.
- **R2:** Provedor via OpenRouter: `POST {OPENAI_BASE_URL}/audio/speech` com `{ model, input, voice, response_format: 'mp3' }`, a mesma chave e o mesmo padrão de `transcribe.service.ts`. Modelo `OPENAI_TTS_MODEL` (padrão `google/gemini-3.8-flash-tts`) e voz `OPENAI_TTS_VOICE` (padrão `Kore`), ambos configuráveis por variável de ambiente sem deploy de código.
- **R3:** O texto vai sem marcação de markdown (`*`, `_`, `#`, crases). Ele é cortado em até 4.000 caracteres, no fim de frase quando possível.
- **R4:** Resposta `{ audio: <base64 mp3>, mimeType: 'audio/mpeg' }`.
- **R5:** Erros mapeados como na transcrição:
  - 4xx não transitório do provedor: 503 `SPEECH_UNAVAILABLE`;
  - 5xx, 408, 429, rede ou timeout (30 s): 502 `SPEECH_FAILED`;
  - conversa inexistente ou de outra conta: 404;
  - conversa sem resposta do Coach: 404 `NO_REPLY_TO_SPEAK`.
- **R6:** Cota diária: `checkDailyQuota` antes da chamada. Uso registrado com `logAiUsage` (`feature: 'speech'`). A migration `023_ai_usage_speech.sql` aceita `'speech'` no CHECK de `ai_usage`. Sem ela, o insert de telemetria falha só com um aviso no log, sem derrubar nada.
- **R7:** Tarifa: `speech_synthesis: 'free'` em `AI_FEATURE_TARIFFS`.
- **R8:** Rate limit de 20 por minuto. Kill switch `COACH_SPEECH_ENABLED` (padrão `true`): quando `false`, a rota responde 503 `SPEECH_UNAVAILABLE`.

### App (OTA, sem build novo)
- **R9:** Depois que uma mensagem **de voz** recebe resposta aplicada no store (mesmo guard de sessão e de requisição de hoje), o app pede `/chat/speech` com uma requisição vinculada ao dono (`bindRequestToOwner`). O áudio só é aplicado se a sessão, a conversa e a mensagem ainda forem as mesmas.
- **R10:** O MP3 é salvo em cache (`expo-file-system`, `Paths.cache`), e a bolha passa a ter `audioUri`. A reprodução usa `expo-audio` (`createAudioPlayer`), que já está nos builds 18/19 do iOS e 27–30 do Android. Antes de tocar, o modo de áudio é configurado com `playsInSilentMode: true` e `allowsRecording: false`, para sair pelo alto-falante mesmo no silencioso do iPhone.
- **R11:** Toca uma resposta por vez. A reprodução **para** quando:
  - o usuário começa a gravar;
  - o usuário toca em Parar;
  - a tela do Coach perde o foco;
  - o app vai para o background;
  - há logout ou troca de conta.
- **R12:** Falha da síntese não aparece como erro. A resposta continua em texto e só não ganha o botão de ouvir.
- **R13:** Web: sem resposta em áudio, porque o web nem grava voz (`isVoiceSupported = false`).
- **R14:** `audioUri` não é persistido. Ao reabrir o app, o histórico volta só com texto.

## 4. Fora de escopo
- Falar respostas de mensagens digitadas.
- Streaming de áudio.
- Escolha de voz pelo usuário.
- Cobrança.
- Web.

## 5. Riscos e limites
- Qualidade do português e latência do modelo: só dá para medir com a chave real em produção. O modelo e a voz trocam por variável de ambiente.
- Latência: a resposta aparece em texto na hora, e o áudio chega alguns segundos depois.
- Android no AAB 23 não recebe OTA. A resposta em áudio chega quando a pessoa atualizar para o AAB 30.
- Custo estimado (Gemini Flash TTS, US$ 0,0000005 por token de entrada e US$ 0,000009 por token de áudio, cerca de 25 tokens por segundo): menos de US$ 0,01 por minuto de fala.
