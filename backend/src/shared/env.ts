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
  SUPABASE_JWT_SECRET: z.string(),
  DATABASE_URL: z.string(),

  // OpenAI
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o'),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Variáveis de ambiente inválidas ou ausentes:')
  for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`   ${field}: ${messages?.join(', ')}`)
  }
  process.exit(1)
}

export const env = parsed.data
