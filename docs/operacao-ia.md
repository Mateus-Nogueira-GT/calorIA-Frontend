# Operação da camada de IA

Referência rápida para quem opera o backend. Spec: `docs/superpowers/specs/2026-09-09-guardrails-ia-coach-design.md`.

## Variáveis de ambiente

| Var | Default | Efeito |
|---|---|---|
| `OPENAI_MODEL` | `openai/gpt-5` | chat do coach |
| `OPENAI_DIET_MODEL` | = `OPENAI_MODEL` | geração de dias (7 chamadas/dieta) |
| `OPENAI_VISION_MODEL` | `openai/gpt-5` | scanner |
| `OPENAI_FALLBACK_MODELS` | vazio | fallbacks do OpenRouter (CSV) |
| `AI_DAILY_TOKEN_CAP` | `200000` | teto diário de tokens por usuário → 429 `AI_QUOTA_EXCEEDED` |
| `RUN_AI_EVALS` | vazio (desligado) | opt-in do eval `src/evals/coach-tool-decision.eval.test.ts` — chama o modelo de verdade para checar a decisão de tool call; sem a variável o arquivo aparece como skipped. Nunca liga sozinho no CI nem no `npm test` normal |
| `EVAL_MODEL` | `openai/gpt-5-mini` | modelo usado pelo eval acima quando `RUN_AI_EVALS=1` |

Rodar o eval com uma chave real: `cd backend && RUN_AI_EVALS=1 npx vitest run src/evals`.

## Códigos de erro que envolvem IA

| Código | HTTP | Onde | Persistiu algo? |
|---|---|---|---|
| `AI_TRUNCATED` | 502 | chat | não |
| `AI_CONTENT_FILTERED` | 422 | chat | não |
| `HISTORY_WRITE_FAILED` | 500 | chat | não (o app reenvia) |
| `AI_QUOTA_EXCEEDED` | 429 | chat, step, scanner | não |
| `ALLERGEN_IN_OUTPUT` / `DAY_VALIDATION_FAILED` / `RECONCILE_FAILED` | 502 | step | job → `failed`; dia NÃO persistido; `/retry` continua do mesmo dia |
| `DIET_STEP_FAILED` | 502 | step | idem, por erro de IA/rede |

Recusas por segurança (menor de idade, condição de saúde, IMC < 18,5 com déficit) **não são erros**: voltam como texto do coach com status `collecting`.

## Lock em voo do `/step` (OP1)

`POST /diets/jobs/:id/step` tem rate limit de **30 requisições/minuto** (por usuário, não por
aparelho). Além disso, a migração `017_diet_jobs_step_lock.sql` adiciona `step_started_at` e
`step_token` a `diet_jobs`: um lock otimista que evita duas chamadas de IA simultâneas para o
mesmo dia quando dois aparelhos (ou o app reaberto) fazem polling ao mesmo tempo. O lock expira
após **300 segundos** — o mesmo teto do `maxDuration` da function — e `step_token` (UUID opaco)
identifica o dono atual, para que um chamador atrasado não libere ou marque `failed` o lock de
quem já reassumiu o job.

## Consultas de alerta (SQL Editor do Supabase)

```sql
-- Loop de geração: mais de uma tool call na mesma conversa em 10 minutos
SELECT conversation_id, COUNT(*) AS tool_calls, MIN(created_at), MAX(created_at)
FROM ai_usage
WHERE feature = 'chat' AND tool_called = TRUE AND created_at >= NOW() - interval '10 minutes'
GROUP BY conversation_id
HAVING COUNT(*) > 1;

-- Truncamentos do chat nas últimas 24h (se subir, o max_tokens do retry está curto)
SELECT COUNT(*) FROM ai_usage
WHERE feature = 'chat' AND finish_reason = 'length' AND created_at >= NOW() - interval '24 hours';

-- Dias regenerados pelos guardrails (2 chamadas diet_day para o mesmo job em < 5 min)
SELECT job_id, COUNT(*) FROM ai_usage
WHERE feature = 'diet_day' AND created_at >= NOW() - interval '1 day'
GROUP BY job_id HAVING COUNT(*) > 7;

-- Usuários perto do teto diário
SELECT user_id, SUM(total_tokens) AS used FROM ai_usage
WHERE created_at >= NOW() - interval '24 hours'
GROUP BY user_id HAVING SUM(total_tokens) > 150000 ORDER BY used DESC;
```

## Manutenção — `scan_cache` cresce sem limite

A janela de 24h do cache de foto (`018_scan_cache.sql`) só é aplicada na LEITURA
(`readCache`, `WHERE created_at > NOW() - interval '24 hours'`); toda escrita é um `UPSERT`
(`ON CONFLICT ... DO UPDATE`) e nada nunca apaga uma linha. Uma linha que sai da janela não é
removida — fica permanentemente inacessível (nenhuma leitura a alcança mais) e continua ocupando
espaço. Rode periodicamente até isso ser automatizado (ex.: cron/job agendado):

```sql
DELETE FROM scan_cache WHERE created_at < NOW() - interval '7 days';
```

## Migrações desta camada

`017_diet_jobs_step_lock.sql` (obrigatória antes do deploy), `018_scan_cache.sql`,
`019_ai_usage_context.sql`.
