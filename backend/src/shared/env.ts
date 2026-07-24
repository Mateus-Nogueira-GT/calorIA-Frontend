import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('*'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  // Legado: a autenticação real valida o JWT (ES256) via JWKS do Supabase,
  // não por este segredo simétrico. Mantido opcional só por compatibilidade.
  SUPABASE_JWT_SECRET: z.string().optional(),
  DATABASE_URL: z.string(),

  // URL da tela web de redefinição de senha (link do email de recovery).
  // Vazio/ausente → o Supabase usa o Site URL configurado no projeto.
  PASSWORD_RESET_REDIRECT_URL: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().url().optional(),
  ),

  // IA via OpenRouter (API compatível com a OpenAI). OPENAI_API_KEY é a key do
  // OpenRouter; OPENAI_BASE_URL aponta para o endpoint do OpenRouter. Os modelos
  // vêm prefixados (ex: openai/gpt-5).
  OPENAI_API_KEY: z.string(),
  // preprocess: env var em branco na Vercel vira string vazia (não undefined),
  // o que puraria o default. Tratamos '' como ausente para o default valer.
  OPENAI_BASE_URL: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().url().default('https://openrouter.ai/api/v1'),
  ),
  OPENAI_MODEL: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().default('openai/gpt-5'),
  ),
  OPENAI_VISION_MODEL: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().default('openai/gpt-5'),
  ),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = Object.entries(parsed.error.flatten().fieldErrors)
    .map(([field, messages]) => `   ${field}: ${messages?.join(', ')}`)
    .join('\n')
  const message = `❌  Variáveis de ambiente inválidas ou ausentes:\n${details}`
  console.error(message)
  // Em ambiente serverless (Vercel), process.exit derruba a função sem log
  // tratável. Lançamos um erro: o handler captura e responde 500 com log claro,
  // e o index.ts local falha cedo ao propagar (fail-fast em dev).
  throw new Error(message)
}

export const env = parsed.data
